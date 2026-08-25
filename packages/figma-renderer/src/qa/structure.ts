import type { WtfRenderNode } from "@w2f/w2f-ir";
import {
  W2F_NODE29_QA_VERSION,
  W2F_NODE29_THRESHOLDS,
  type W2fEditableClass,
  type W2fFigmaQaNodeSnapshot,
  type W2fStructureQaInput,
  type W2fStructureQaReport,
} from "./types.js";

const NODE_ID_KEY = "w2f.nodeId";
const RENDER_STRATEGY_KEY = "w2f.renderStrategy";
const RASTER_MODE_KEY = "w2f.raster.mode";
const MINIMAL_RASTER_MODE = "minimal-local-fallback";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function expandIncludedNodes(input: W2fStructureQaInput): Set<string> {
  const all = new Map(input.renderTree.nodes.map((node) => [node.id, node]));
  if (!input.includedRenderNodeIds || input.includedRenderNodeIds.length === 0) {
    return new Set(all.keys());
  }
  const included = new Set<string>();
  const stack = [...input.includedRenderNodeIds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || included.has(id)) continue;
    const node = all.get(id);
    if (!node) continue;
    included.add(id);
    stack.push(...node.childIds);
  }
  return included;
}

function suppressedByRaster(nodes: readonly WtfRenderNode[], included: ReadonlySet<string>): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const suppressed = new Set<string>();
  for (const node of nodes) {
    if (!included.has(node.id) || node.renderStrategy !== "raster") continue;
    const stack = [...node.childIds];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || suppressed.has(id)) continue;
      suppressed.add(id);
      const child = byId.get(id);
      if (child) stack.push(...child.childIds);
    }
  }
  return suppressed;
}

function snapshotsByRenderNodeId(
  sceneNodes: readonly W2fFigmaQaNodeSnapshot[],
): ReadonlyMap<string, W2fFigmaQaNodeSnapshot[]> {
  const grouped = new Map<string, W2fFigmaQaNodeSnapshot[]>();
  for (const snapshot of sceneNodes) {
    if (!snapshot.renderNodeId) continue;
    const group = grouped.get(snapshot.renderNodeId) ?? [];
    group.push(snapshot);
    grouped.set(snapshot.renderNodeId, group);
  }
  return grouped;
}

function expectedEditableClass(node: WtfRenderNode): W2fEditableClass | null {
  if (node.renderStrategy === "raster") return "raster";
  if (node.kind === "text") return "text";
  if (node.kind === "vector") return "vector";
  if (node.kind === "image") return "image";
  return null;
}

function isEditableMatch(node: WtfRenderNode, snapshot: W2fFigmaQaNodeSnapshot): boolean {
  const expected = expectedEditableClass(node);
  if (!expected) return snapshot.editableClass !== "raster";
  if (expected === "raster") return snapshot.editableClass === "raster";
  return snapshot.editableClass === expected;
}

function nodeArea(node: WtfRenderNode): number {
  return Math.max(0, node.geometry.bounds.width) * Math.max(0, node.geometry.bounds.height);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? clamp01(numerator / denominator) : 1;
}

export function evaluateStructureAndEditabilityQa(input: W2fStructureQaInput): W2fStructureQaReport {
  const included = expandIncludedNodes(input);
  const suppressed = suppressedByRaster(input.renderTree.nodes, included);
  const expectedNodes = input.renderTree.nodes.filter(
    (node) => included.has(node.id) && !suppressed.has(node.id),
  );
  const expectedById = new Map(expectedNodes.map((node) => [node.id, node]));
  const snapshots = snapshotsByRenderNodeId(input.sceneNodes);
  const failures: string[] = [];
  const warnings: string[] = [];

  let mappedNodeCount = 0;
  let parentCorrectCount = 0;
  let parentComparableCount = 0;
  let metadataCorrectCount = 0;

  for (const node of expectedNodes) {
    const matches = snapshots.get(node.id) ?? [];
    if (matches.length === 0) {
      failures.push(`Missing Figma mapping for render node ${node.id}`);
      continue;
    }
    if (matches.length > 1) {
      failures.push(`Duplicate Figma mappings for render node ${node.id}`);
      continue;
    }
    mappedNodeCount += 1;
    const snapshot = matches[0]!;
    const expectedParentId = node.parentId && expectedById.has(node.parentId) ? node.parentId : undefined;
    parentComparableCount += 1;
    if (snapshot.parentRenderNodeId === expectedParentId) {
      parentCorrectCount += 1;
    } else {
      failures.push(
        `Parent mismatch for ${node.id}: expected ${expectedParentId ?? "import-root"}, got ${snapshot.parentRenderNodeId ?? "import-root"}`,
      );
    }

    const nodeIdOk = snapshot.pluginData[NODE_ID_KEY] === node.id;
    const strategyOk = snapshot.pluginData[RENDER_STRATEGY_KEY] === node.renderStrategy;
    if (nodeIdOk && strategyOk) metadataCorrectCount += 1;
    else failures.push(`PluginData identity/strategy mismatch for ${node.id}`);

    const rasterMode = snapshot.pluginData[RASTER_MODE_KEY];
    if (node.renderStrategy === "raster") {
      if (snapshot.editableClass !== "raster" || rasterMode !== MINIMAL_RASTER_MODE) {
        failures.push(`Raster boundary ${node.id} is not a NODE-28 minimal-local-fallback surface`);
      }
    } else if (snapshot.editableClass === "raster" || rasterMode) {
      failures.push(`Unauthorized rasterization of native render node ${node.id}`);
    }

    const expectedEditable = expectedEditableClass(node);
    if (expectedEditable && !isEditableMatch(node, snapshot)) {
      failures.push(
        `Editability mismatch for ${node.id}: expected ${expectedEditable}, got ${snapshot.editableClass}`,
      );
    }
  }

  let siblingGroups = 0;
  let correctSiblingGroups = 0;
  for (const parent of expectedNodes) {
    const expectedChildren = parent.childIds.filter((id) => expectedById.has(id));
    if (expectedChildren.length < 2) continue;
    const actual = expectedChildren
      .map((id) => snapshots.get(id)?.[0])
      .filter((value): value is W2fFigmaQaNodeSnapshot => value !== undefined)
      .sort((left, right) => left.siblingIndex - right.siblingIndex)
      .map((value) => value.renderNodeId!);
    siblingGroups += 1;
    if (
      actual.length === expectedChildren.length &&
      actual.every((id, index) => id === expectedChildren[index])
    ) {
      correctSiblingGroups += 1;
    } else {
      failures.push(`Sibling order mismatch under ${parent.id}`);
    }
  }

  const terminalNodes = expectedNodes.filter((node) => {
    if (node.renderStrategy === "raster") return true;
    return !node.childIds.some((id) => expectedById.has(id));
  });
  let visibleSupportedArea = 0;
  let editableArea = 0;
  let rasterArea = 0;
  for (const node of terminalNodes) {
    if (node.renderStrategy === "unsupported") continue;
    const area = nodeArea(node);
    visibleSupportedArea += area;
    if (node.renderStrategy === "raster") {
      rasterArea += area;
      continue;
    }
    const snapshot = snapshots.get(node.id)?.[0];
    if (snapshot && isEditableMatch(node, snapshot)) editableArea += area;
  }

  const mappingCompleteness = ratio(mappedNodeCount, expectedNodes.length);
  const parentCorrectness = ratio(parentCorrectCount, parentComparableCount);
  const siblingOrderCorrectness = ratio(correctSiblingGroups, siblingGroups);
  const metadataCorrectness = ratio(metadataCorrectCount, expectedNodes.length);
  const structureScore = clamp01(
    mappingCompleteness * 0.45 +
      parentCorrectness * 0.25 +
      siblingOrderCorrectness * 0.15 +
      metadataCorrectness * 0.15,
  );
  const editableAreaRatio = ratio(editableArea, visibleSupportedArea);
  const rasterAreaRatio = ratio(rasterArea, visibleSupportedArea);

  if (structureScore < W2F_NODE29_THRESHOLDS.deterministicStructureScore) {
    failures.push(
      `Structure score ${(structureScore * 100).toFixed(2)}% is below ${(W2F_NODE29_THRESHOLDS.deterministicStructureScore * 100).toFixed(0)}%`,
    );
  }
  if (editableAreaRatio < W2F_NODE29_THRESHOLDS.supportedEditableAreaRatio) {
    failures.push(
      `Editable area ratio ${(editableAreaRatio * 100).toFixed(2)}% is below ${(W2F_NODE29_THRESHOLDS.supportedEditableAreaRatio * 100).toFixed(0)}%`,
    );
  }
  if (rasterAreaRatio > W2F_NODE29_THRESHOLDS.supportedRasterAreaRatio) {
    failures.push(
      `Raster area ratio ${(rasterAreaRatio * 100).toFixed(2)}% exceeds ${(W2F_NODE29_THRESHOLDS.supportedRasterAreaRatio * 100).toFixed(0)}% for native-supported QA`,
    );
  }

  if (terminalNodes.length === 0) {
    warnings.push("No terminal supported render nodes were available for area-based editability QA");
  }

  return {
    version: W2F_NODE29_QA_VERSION,
    status: failures.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS",
    metrics: {
      expectedNodeCount: expectedNodes.length,
      mappedNodeCount,
      suppressedRasterDescendantCount: suppressed.size,
      mappingCompleteness,
      parentCorrectness,
      siblingOrderCorrectness,
      metadataCorrectness,
      structureScore,
      editableAreaRatio,
      rasterAreaRatio,
    },
    failures,
    warnings,
  };
}
