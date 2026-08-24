import { normalizeRenderProfile } from "@w2f/figma-capability-resolver";
import type { WtfRenderNode, WtfSourceNode } from "@w2f/w2f-ir";
import {
  W2F_BASIC_RENDERER_VERSION,
  W2F_PLUGIN_DATA_KEYS,
  W2fBasicRendererError,
  type W2fBasicGeometry,
  type W2fBasicImportMode,
  type W2fBasicNodePlan,
  type W2fBasicRenderPlan,
  type W2fBasicRendererInput,
} from "./types.js";

const FRAME_LIKE_KINDS = new Set([
  "document",
  "section",
  "container",
  "table",
  "row",
  "cell",
  "control",
]);

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function assertGeometry(node: WtfRenderNode): W2fBasicGeometry {
  const { x, y, width, height } = node.geometry.bounds;
  if (![x, y, width, height].every(isFiniteNumber) || width < 0 || height < 0) {
    throw new W2fBasicRendererError(
      "W2F_RENDERER_GEOMETRY",
      `Invalid geometry for render node ${node.id}`,
    );
  }
  return { x, y, width, height };
}

function assertPoint(value: { x: number; y: number }, label: string): void {
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new W2fBasicRendererError("W2F_RENDERER_GEOMETRY", `${label} must be finite`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    output[key] = canonicalize(record[key]);
  }
  return output;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sanitizeFigmaLayerName(
  value: string | undefined,
  fallbackKind: string,
  fallbackId: string,
): string {
  const cleaned = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 0) return cleaned.slice(0, 120);
  const kind = fallbackKind.length > 0 ? fallbackKind : "node";
  return `${kind} · ${fallbackId.slice(0, 12)}`;
}

function nodeTypeFor(node: WtfRenderNode): "FRAME" | "RECTANGLE" {
  if (node.childIds.length > 0 || FRAME_LIKE_KINDS.has(node.kind)) return "FRAME";
  return "RECTANGLE";
}

function sourceNodeMap(input: W2fBasicRendererInput): ReadonlyMap<string, WtfSourceNode> {
  return new Map((input.sourceGraph?.nodes ?? []).map((node) => [node.captureNodeId, node]));
}

function nodePluginData(
  node: WtfRenderNode,
  input: W2fBasicRendererInput,
  sources: ReadonlyMap<string, WtfSourceNode>,
): Readonly<Record<string, string>> {
  const firstSourceId = node.sourceNodeIds[0];
  const firstSource = firstSourceId ? sources.get(firstSourceId) : undefined;
  const data: Record<string, string> = {
    [W2F_PLUGIN_DATA_KEYS.nodeId]: node.id,
    [W2F_PLUGIN_DATA_KEYS.sourceNodeIds]: canonicalJson(node.sourceNodeIds),
    [W2F_PLUGIN_DATA_KEYS.sourceStableIds]: canonicalJson(node.sourceStableIds ?? []),
    [W2F_PLUGIN_DATA_KEYS.renderStrategy]: node.renderStrategy,
    [W2F_PLUGIN_DATA_KEYS.importVersion]: W2F_BASIC_RENDERER_VERSION,
    [W2F_PLUGIN_DATA_KEYS.tokenPolicy]: input.tokenPolicy ?? "literal",
    [W2F_PLUGIN_DATA_KEYS.renderProfile]: normalizeRenderProfile(input.profile),
  };
  if (node.revisionHashes) {
    data[W2F_PLUGIN_DATA_KEYS.revisionHashes] = canonicalJson(node.revisionHashes);
  }
  if (firstSource) {
    data[W2F_PLUGIN_DATA_KEYS.sourceKind] = firstSource.kind;
    if (firstSource.tagName) data[W2F_PLUGIN_DATA_KEYS.sourceTag] = firstSource.tagName;
    if (firstSource.sourceSelector) {
      data[W2F_PLUGIN_DATA_KEYS.sourceSelector] = firstSource.sourceSelector;
    }
  }
  return data;
}

function rootIdentityPluginData(
  input: W2fBasicRendererInput,
  mode: W2fBasicImportMode,
): Record<string, string> {
  const data: Record<string, string> = {
    [W2F_PLUGIN_DATA_KEYS.importVersion]: W2F_BASIC_RENDERER_VERSION,
    [W2F_PLUGIN_DATA_KEYS.tokenPolicy]: input.tokenPolicy ?? "literal",
    [W2F_PLUGIN_DATA_KEYS.renderProfile]: normalizeRenderProfile(input.profile),
    [W2F_PLUGIN_DATA_KEYS.importScope]: mode,
    [W2F_PLUGIN_DATA_KEYS.transactionState]: "importing",
  };
  const revision = input.sourceGraph?.revision;
  if (revision) {
    data[W2F_PLUGIN_DATA_KEYS.documentId] = revision.documentId;
    data[W2F_PLUGIN_DATA_KEYS.captureId] = revision.captureId;
    data[W2F_PLUGIN_DATA_KEYS.revisionId] = revision.revisionId;
    data[W2F_PLUGIN_DATA_KEYS.sourceFingerprint] = revision.sourceFingerprint;
  }
  return data;
}

function geometryRelativeTo(
  absolute: W2fBasicGeometry,
  parentOrigin: { x: number; y: number },
): W2fBasicGeometry {
  return {
    x: absolute.x - parentOrigin.x,
    y: absolute.y - parentOrigin.y,
    width: absolute.width,
    height: absolute.height,
  };
}

function unionGeometry(geometries: readonly W2fBasicGeometry[]): W2fBasicGeometry {
  if (geometries.length === 0) {
    throw new W2fBasicRendererError("W2F_RENDERER_INPUT", "At least one selected root is required");
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const geometry of geometries) {
    minX = Math.min(minX, geometry.x);
    minY = Math.min(minY, geometry.y);
    maxX = Math.max(maxX, geometry.x + geometry.width);
    maxY = Math.max(maxY, geometry.y + geometry.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function buildTreeOrder(
  rootId: string,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): ReadonlyMap<string, number> {
  const order = new Map<string, number>();
  const active = new Set<string>();
  let cursor = 0;

  const visit = (id: string, expectedParentId?: string): void => {
    const node = nodes.get(id);
    if (!node) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", `Missing render node ${id}`);
    }
    if (active.has(id)) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", `Cycle detected at render node ${id}`);
    }
    if (order.has(id)) {
      throw new W2fBasicRendererError(
        "W2F_RENDERER_TREE",
        `Render node ${id} is referenced more than once`,
      );
    }
    if (expectedParentId && node.parentId && node.parentId !== expectedParentId) {
      throw new W2fBasicRendererError(
        "W2F_RENDERER_TREE",
        `Render node ${id} parentId does not match childIds hierarchy`,
      );
    }
    assertGeometry(node);
    active.add(id);
    order.set(id, cursor);
    cursor += 1;
    const childSet = new Set<string>();
    for (const childId of node.childIds) {
      if (childSet.has(childId)) {
        throw new W2fBasicRendererError(
          "W2F_RENDERER_TREE",
          `Render node ${id} contains duplicate child ${childId}`,
        );
      }
      childSet.add(childId);
      visit(childId, id);
    }
    active.delete(id);
  };

  visit(rootId);
  if (order.size !== nodes.size) {
    throw new W2fBasicRendererError(
      "W2F_RENDERER_TREE",
      `Render tree contains ${nodes.size - order.size} unreachable node(s)`,
    );
  }
  return order;
}

function isAncestor(
  ancestorId: string,
  nodeId: string,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): boolean {
  let cursor = nodes.get(nodeId)?.parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", "Cycle detected in parent chain");
    }
    seen.add(cursor);
    cursor = nodes.get(cursor)?.parentId;
  }
  return false;
}

function selectedRoots(
  input: W2fBasicRendererInput,
  nodes: ReadonlyMap<string, WtfRenderNode>,
  order: ReadonlyMap<string, number>,
): { mode: W2fBasicImportMode; ids: string[] } {
  const mode = input.mode ?? "whole-page";
  if (mode === "whole-page") return { mode, ids: [input.renderTree.rootId] };

  const unique = [...new Set(input.selectedRootIds ?? [])];
  if (unique.length === 0) {
    throw new W2fBasicRendererError(
      "W2F_RENDERER_INPUT",
      "selected-roots mode requires selectedRootIds",
    );
  }
  for (const id of unique) {
    if (!nodes.has(id)) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", `Unknown selected root ${id}`);
    }
  }

  const outermost = unique.filter(
    (candidate) =>
      !unique.some((other) => other !== candidate && isAncestor(other, candidate, nodes)),
  );
  outermost.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  return { mode, ids: outermost };
}

function mergePluginData(
  base: Readonly<Record<string, string>>,
  extra: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return { ...base, ...extra };
}

export function createBasicFigmaRenderPlan(input: W2fBasicRendererInput): W2fBasicRenderPlan {
  if (!input || typeof input !== "object") {
    throw new W2fBasicRendererError("W2F_RENDERER_INPUT", "Renderer input is required");
  }
  if ((input.tokenPolicy ?? "literal") !== "literal") {
    throw new W2fBasicRendererError(
      "W2F_RENDERER_INPUT",
      "NODE-25 only accepts the frozen literal token policy",
    );
  }
  const renderTree = input.renderTree;
  if (!renderTree || !Array.isArray(renderTree.nodes) || typeof renderTree.rootId !== "string") {
    throw new W2fBasicRendererError("W2F_RENDERER_INPUT", "A validated render tree is required");
  }

  const nodes = new Map<string, WtfRenderNode>();
  for (const node of renderTree.nodes) {
    if (nodes.has(node.id)) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", `Duplicate render node id ${node.id}`);
    }
    nodes.set(node.id, node);
  }
  if (!nodes.has(renderTree.rootId)) {
    throw new W2fBasicRendererError("W2F_RENDERER_TREE", "Render tree root is missing");
  }

  const order = buildTreeOrder(renderTree.rootId, nodes);
  const selection = selectedRoots(input, nodes, order);
  const sources = sourceNodeMap(input);
  const selectedGeometries = selection.ids.map((id) => assertGeometry(nodes.get(id)!));
  const sourceRootGeometry =
    selection.mode === "whole-page" ? selectedGeometries[0]! : unionGeometry(selectedGeometries);
  const destination = input.destination ?? { x: sourceRootGeometry.x, y: sourceRootGeometry.y };
  assertPoint(destination, "destination");

  const wholeRoot = selection.mode === "whole-page" ? nodes.get(renderTree.rootId)! : undefined;
  const rootName = input.importName
    ? sanitizeFigmaLayerName(input.importName, "W2F Import", renderTree.rootId)
    : wholeRoot
      ? sanitizeFigmaLayerName(wholeRoot.name, wholeRoot.kind, wholeRoot.id)
      : `W2F Import · ${selection.ids.length} section${selection.ids.length === 1 ? "" : "s"}`;

  let rootPluginData = rootIdentityPluginData(input, selection.mode);
  if (wholeRoot) {
    rootPluginData = {
      ...nodePluginData(wholeRoot, input, sources),
      ...rootPluginData,
    };
  }

  const plans: W2fBasicNodePlan[] = [];
  const emitted = new Set<string>();

  const emit = (
    id: string,
    parentRenderNodeId: string | undefined,
    parentOrigin: { x: number; y: number },
  ): void => {
    if (emitted.has(id)) return;
    const node = nodes.get(id);
    if (!node) {
      throw new W2fBasicRendererError("W2F_RENDERER_TREE", `Missing render node ${id}`);
    }
    const absoluteGeometry = assertGeometry(node);
    const plan: W2fBasicNodePlan = {
      renderNodeId: node.id,
      ...(parentRenderNodeId ? { parentRenderNodeId } : {}),
      nodeType: nodeTypeFor(node),
      sourceKind: node.kind,
      name: sanitizeFigmaLayerName(node.name, node.kind, node.id),
      absoluteGeometry,
      localGeometry: geometryRelativeTo(absoluteGeometry, parentOrigin),
      sourceNodeIds: [...node.sourceNodeIds],
      sourceStableIds: [...(node.sourceStableIds ?? [])],
      ...(node.revisionHashes ? { revisionHashes: { ...node.revisionHashes } } : {}),
      renderStrategy: node.renderStrategy,
      pluginData: nodePluginData(node, input, sources),
    };
    plans.push(plan);
    emitted.add(id);
    for (const childId of node.childIds) {
      emit(childId, node.id, absoluteGeometry);
    }
  };

  if (wholeRoot) {
    const rootAbsolute = assertGeometry(wholeRoot);
    for (const childId of wholeRoot.childIds) {
      emit(childId, wholeRoot.id, rootAbsolute);
    }
  } else {
    for (const id of selection.ids) {
      emit(id, undefined, sourceRootGeometry);
    }
  }

  return {
    version: W2F_BASIC_RENDERER_VERSION,
    mode: selection.mode,
    root: {
      ...(wholeRoot ? { sourceRenderNodeId: wholeRoot.id } : {}),
      name: rootName,
      sourceOrigin: { x: sourceRootGeometry.x, y: sourceRootGeometry.y },
      geometry: {
        x: destination.x,
        y: destination.y,
        width: sourceRootGeometry.width,
        height: sourceRootGeometry.height,
      },
      pluginData: rootPluginData,
    },
    nodes: plans,
    selectedRootIds: [...selection.ids],
    profile: input.profile,
    tokenPolicy: "literal",
  };
}

export function committedRootPluginData(
  pluginData: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return mergePluginData(pluginData, {
    [W2F_PLUGIN_DATA_KEYS.transactionState]: "committed",
  });
}
