import { evaluateStructureAndEditabilityQa, W2F_PLUGIN_DATA_KEYS } from "@w2f/figma-renderer";
import type { WtfAssetRecord, WtfRenderNode } from "@w2f/w2f-ir";
import { inspectFigmaSceneForQa } from "./figma-qa.js";
import {
  isNode31UiToMainMessage,
  node31MeasurementMessage,
  type W2fNode31ExpectedDocumentIdentity,
  type W2fNode31MeasureRequest,
  type W2fNode31SelectedRootInfo,
} from "./node31-measurement-protocol.js";
import {
  evaluateNode31DesktopResponsiveQa,
  type W2fNode31ResponsiveSceneObservation,
} from "./node31-responsive-measurement.js";

declare const __html__: string;

const RASTER_MODE_KEY = "w2f.raster.mode";
const FONT_SUBSTITUTION_COUNT_KEY = "w2f.font.substitutionCount";
const VISUAL_ASSET_KINDS = new Set<WtfAssetRecord["kind"]>([
  "image",
  "svg",
  "canvas-raster",
  "video-frame",
  "fallback-raster",
]);

function post(payload: Parameters<typeof node31MeasurementMessage>[0]): void {
  figma.ui.postMessage(node31MeasurementMessage(payload));
}

function error(code: string, cause: unknown): void {
  post({
    type: "NODE31_ERROR",
    code,
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

function childNodes(node: SceneNode): readonly SceneNode[] {
  return "children" in node ? (node as SceneNode & ChildrenMixin).children : [];
}

function selectedRoot(): FrameNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (!node || node.type !== "FRAME") return null;
  return node;
}

function selectedRootInfo(): W2fNode31SelectedRootInfo {
  const root = selectedRoot();
  if (!root) {
    return {
      ok: false,
      reason: "Select exactly one imported W2F root Frame before measuring.",
    };
  }
  const documentId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.documentId);
  const captureId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.captureId);
  const revisionId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.revisionId);
  const sourceFingerprint = root.getPluginData(W2F_PLUGIN_DATA_KEYS.sourceFingerprint);
  if (!documentId || !captureId || !revisionId || !sourceFingerprint) {
    return {
      ok: false,
      reason: "Selected Frame is not a committed W2F import root with complete source identity.",
      nodeId: root.id,
      nodeName: root.name,
    };
  }
  return {
    ok: true,
    nodeId: root.id,
    nodeName: root.name,
    documentId,
    captureId,
    revisionId,
    sourceFingerprint,
  };
}

function assertIdentity(root: SceneNode, expected: W2fNode31ExpectedDocumentIdentity): void {
  const actual = {
    documentId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.documentId),
    captureId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.captureId),
    revisionId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.revisionId),
    sourceFingerprint: root.getPluginData(W2F_PLUGIN_DATA_KEYS.sourceFingerprint),
  };
  for (const key of ["documentId", "captureId", "revisionId", "sourceFingerprint"] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Selected Figma root does not match the parsed WTF ${key}: expected ${expected[key]}, got ${actual[key] || "<missing>"}`,
      );
    }
  }
}

function allSceneNodes(root: SceneNode): SceneNode[] {
  const output: SceneNode[] = [];
  const stack: SceneNode[] = [root];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    output.push(node);
    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push(child);
    }
  }
  return output;
}

function mappedSceneNodes(root: SceneNode): Map<string, SceneNode> {
  const output = new Map<string, SceneNode>();
  for (const node of allSceneNodes(root)) {
    const renderNodeId = node.getPluginData(W2F_PLUGIN_DATA_KEYS.nodeId);
    if (renderNodeId && !output.has(renderNodeId)) output.set(renderNodeId, node);
  }
  return output;
}

function absoluteBounds(node: SceneNode) {
  const candidate = node as SceneNode & {
    absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
    absoluteTransform?: readonly [
      readonly [number, number, number],
      readonly [number, number, number],
    ];
  };
  const box = candidate.absoluteBoundingBox;
  if (
    box &&
    [box.x, box.y, box.width, box.height].every((value) => Number.isFinite(value)) &&
    box.width >= 0 &&
    box.height >= 0
  ) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  const transform = candidate.absoluteTransform;
  return {
    x: transform?.[0]?.[2] ?? node.x,
    y: transform?.[1]?.[2] ?? node.y,
    width: Math.max(0, node.width),
    height: Math.max(0, node.height),
  };
}

function geometryObservations(root: SceneNode) {
  const output = [];
  for (const [renderNodeId, node] of mappedSceneNodes(root)) {
    output.push({ renderNodeId, bounds: absoluteBounds(node) });
  }
  return output;
}

function textObservations(root: SceneNode, request: W2fNode31MeasureRequest) {
  const mapped = mappedSceneNodes(root);
  const output = [];
  for (const renderNode of request.renderTree.nodes) {
    if (!renderNode.text) continue;
    const node = mapped.get(renderNode.id);
    if (!node || node.type !== "TEXT") continue;
    const fontRunCount = renderNode.text.runs.length;
    const substitutionCount = Math.max(
      0,
      Number.parseInt(node.getPluginData(FONT_SUBSTITUTION_COUNT_KEY) || "0", 10) || 0,
    );
    output.push({
      renderNodeId: renderNode.id,
      characters: node.characters,
      fontRunCount,
      matchedFontRunCount: Math.max(0, fontRunCount - Math.min(fontRunCount, substitutionCount)),
    });
  }
  return output;
}

function hasImageFill(node: SceneNode): boolean {
  const fills = (node as SceneNode & { fills?: unknown }).fills;
  return (
    Array.isArray(fills) &&
    fills.some(
      (paint) =>
        typeof paint === "object" &&
        paint !== null &&
        "type" in paint &&
        (paint as { type?: unknown }).type === "IMAGE",
    )
  );
}

function isVectorType(type: SceneNode["type"]): boolean {
  return ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE", "POLYGON"].includes(type);
}

function sceneMatchesAsset(node: SceneNode, kind: WtfAssetRecord["kind"]): boolean {
  const stack: SceneNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (kind === "svg" && isVectorType(current.type)) return true;
    if (
      kind !== "svg" &&
      (hasImageFill(current) || Boolean(current.getPluginData(RASTER_MODE_KEY)))
    ) {
      return true;
    }
    stack.push(...childNodes(current));
  }
  return false;
}

function appliedAssetIds(root: SceneNode, request: W2fNode31MeasureRequest): string[] {
  const mapped = mappedSceneNodes(root);
  const assets = new Map(request.assets.map((asset) => [asset.id, asset]));
  const output = new Set<string>();
  for (const renderNode of request.renderTree.nodes) {
    const node = mapped.get(renderNode.id);
    if (!node) continue;
    const candidates = new Set(renderNode.assetRefs ?? []);
    for (const fill of renderNode.paint.fills) {
      if (fill.type === "image") candidates.add(fill.assetId);
    }
    for (const assetId of candidates) {
      const asset = assets.get(assetId);
      if (!asset || !VISUAL_ASSET_KINDS.has(asset.kind)) continue;
      if (sceneMatchesAsset(node, asset.kind)) output.add(assetId);
    }
  }
  return [...output].sort();
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return finiteNumber(value);
}

function responsiveObservation(
  snapshotId: string,
  viewportWidth: number,
  renderNodeId: string,
  node: SceneNode,
): W2fNode31ResponsiveSceneObservation {
  const candidate = node as SceneNode & Record<string, unknown>;
  const constraints = candidate.constraints;
  const constraintRecord =
    typeof constraints === "object" && constraints !== null && !Array.isArray(constraints)
      ? (constraints as Record<string, unknown>)
      : undefined;
  const observation: W2fNode31ResponsiveSceneObservation = {
    snapshotId,
    viewportWidth,
    renderNodeId,
    width: node.width,
    height: node.height,
    visible: node.visible,
  };
  for (const [source, target] of [
    ["layoutMode", "layoutMode"],
    ["layoutSizingHorizontal", "layoutSizingHorizontal"],
    ["layoutSizingVertical", "layoutSizingVertical"],
    ["layoutPositioning", "layoutPositioning"],
  ] as const) {
    const value = candidate[source];
    if (typeof value === "string") observation[target] = value;
  }
  for (const [source, target] of [
    ["paddingTop", "paddingTop"],
    ["paddingRight", "paddingRight"],
    ["paddingBottom", "paddingBottom"],
    ["paddingLeft", "paddingLeft"],
    ["itemSpacing", "itemSpacing"],
    ["counterAxisSpacing", "counterAxisSpacing"],
    ["gridColumnGap", "gridColumnGap"],
    ["gridRowGap", "gridRowGap"],
  ] as const) {
    const value = finiteNumber(candidate[source]);
    if (value !== undefined) observation[target] = value;
  }
  for (const [source, target] of [
    ["minWidth", "minWidth"],
    ["maxWidth", "maxWidth"],
    ["minHeight", "minHeight"],
    ["maxHeight", "maxHeight"],
  ] as const) {
    const value = finiteOrNull(candidate[source]);
    if (value !== undefined) observation[target] = value;
  }
  if (constraintRecord) {
    if (typeof constraintRecord.horizontal === "string") {
      observation.constraintsHorizontal = constraintRecord.horizontal;
    }
    if (typeof constraintRecord.vertical === "string") {
      observation.constraintsVertical = constraintRecord.vertical;
    }
  }
  return observation;
}

async function measureResponsiveQa(root: FrameNode, request: W2fNode31MeasureRequest) {
  if (request.responsive.snapshots.length === 0) {
    return evaluateNode31DesktopResponsiveQa(request.renderTree, request.responsive, []);
  }

  let qaPage: PageNode | null = null;
  try {
    qaPage = figma.createPage();
    qaPage.name = "__W2F_NODE31_RESPONSIVE_MEASUREMENT__";
    await qaPage.loadAsync();
    const observations: W2fNode31ResponsiveSceneObservation[] = [];
    const snapshots = [...request.responsive.snapshots].sort(
      (left, right) => left.viewport.width - right.viewport.width || left.id.localeCompare(right.id),
    );

    for (const snapshot of snapshots) {
      const clone = root.clone();
      qaPage.appendChild(clone);
      try {
        clone.x = 0;
        clone.y = 0;
        clone.resize(Math.max(0.01, snapshot.viewport.width), Math.max(0.01, clone.height));
        for (const [renderNodeId, node] of mappedSceneNodes(clone)) {
          observations.push(
            responsiveObservation(snapshot.id, snapshot.viewport.width, renderNodeId, node),
          );
        }
      } finally {
        clone.remove();
      }
    }

    return evaluateNode31DesktopResponsiveQa(request.renderTree, request.responsive, observations);
  } finally {
    if (qaPage) {
      try {
        qaPage.remove();
      } catch {
        // Responsive QA uses disposable clones and must never mutate the committed import.
      }
    }
  }
}

async function exportTiles(
  root: FrameNode,
  rootBounds: WtfRenderNode["geometry"]["bounds"],
  request: W2fNode31MeasureRequest,
) {
  let qaPage: PageNode | null = null;
  try {
    qaPage = figma.createPage();
    qaPage.name = "__W2F_NODE31_DESKTOP_MEASUREMENT__";
    await qaPage.loadAsync();
    const clone = root.clone();
    qaPage.appendChild(clone);
    clone.x = rootBounds.x - request.reference.bounds.x;
    clone.y = rootBounds.y - request.reference.bounds.y;

    const tiles = [];
    for (const tile of request.reference.tiles) {
      const slice = figma.createSlice();
      qaPage.appendChild(slice);
      slice.x = tile.bounds.x - request.reference.bounds.x;
      slice.y = tile.bounds.y - request.reference.bounds.y;
      slice.resize(Math.max(0.01, tile.bounds.width), Math.max(0.01, tile.bounds.height));
      try {
        const pngBytes = await slice.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: request.reference.dpr },
        });
        tiles.push({ tileId: tile.id, pngBytes });
      } finally {
        slice.remove();
      }
    }
    return tiles;
  } finally {
    if (qaPage) {
      try {
        qaPage.remove();
      } catch {
        // Cleanup must never mutate or invalidate the selected committed import.
      }
    }
  }
}

async function measure(request: W2fNode31MeasureRequest): Promise<void> {
  const measurementStartedAt = new Date().toISOString();
  const root = selectedRoot();
  if (!root) throw new Error("Select exactly one imported W2F root Frame before measuring.");
  assertIdentity(root, request.expectedIdentity);

  const rootRenderNode = request.renderTree.nodes.find(
    (node) => node.id === request.expectedIdentity.rootRenderNodeId,
  );
  if (!rootRenderNode || request.renderTree.rootId !== rootRenderNode.id) {
    throw new Error("Measurement request root does not match the secure parsed render tree root.");
  }

  const sceneNodes = inspectFigmaSceneForQa(root);
  const structureQa = evaluateStructureAndEditabilityQa({
    renderTree: request.renderTree,
    sceneNodes,
  });
  const observedGeometry = geometryObservations(root);
  const observedText = textObservations(root, request);
  const observedAssetIds = appliedAssetIds(root, request);
  const responsiveQa = await measureResponsiveQa(root, request);

  const tiles = await exportTiles(root, rootRenderNode.geometry.bounds, request);
  if (tiles.length !== request.reference.tiles.length) {
    throw new Error(
      `Figma Desktop exported ${tiles.length} tiles; expected ${request.reference.tiles.length}`,
    );
  }

  post({
    type: "NODE31_MEASUREMENT_RESULT",
    result: {
      sampleId: request.sampleId,
      rootNodeId: root.id,
      createdNodeCount: allSceneNodes(root).length,
      mappedRenderNodeCount: structureQa.metrics.mappedNodeCount,
      measurementStartedAt,
      measurementCompletedAt: new Date().toISOString(),
      host: {
        apiVersion: figma.apiVersion,
        editorType: figma.editorType,
      },
      structureQa,
      responsiveQa,
      observedGeometry,
      observedText,
      appliedAssetIds: observedAssetIds,
      tiles,
    },
  });
}

figma.showUI(__html__, {
  width: 480,
  height: 640,
  themeColors: true,
});

figma.ui.onmessage = (message: unknown) => {
  if (!isNode31UiToMainMessage(message)) {
    error("NODE31_E_PROTOCOL", "Rejected invalid Desktop measurement message");
    return;
  }
  switch (message.payload.type) {
    case "NODE31_UI_READY":
    case "NODE31_REFRESH_SELECTION":
      post({ type: "NODE31_SELECTION", selection: selectedRootInfo() });
      return;
    case "NODE31_MEASURE":
      void measure(message.payload.request).catch((cause) => error("NODE31_E_MEASURE", cause));
      return;
    case "NODE31_CLOSE":
      figma.closePlugin();
      return;
  }
};
