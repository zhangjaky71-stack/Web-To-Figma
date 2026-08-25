import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import type { WtfReferenceTileDescriptor } from "@w2f/w2f-schema";
import type { W2fRasterReferenceEvidence } from "./protocol.js";

export const W2F_HYBRID_RASTER_VERSION = "1.0.0" as const;

export const W2F_RASTER_PLUGIN_DATA_KEYS = {
  mode: "w2f.raster.mode",
  version: "w2f.raster.version",
  referenceId: "w2f.raster.referenceId",
  referenceKind: "w2f.raster.referenceKind",
  sourceNodeId: "w2f.raster.sourceNodeId",
  viewportId: "w2f.raster.viewportId",
  dpr: "w2f.raster.dpr",
  reason: "w2f.raster.reason",
  tileCount: "w2f.raster.tileCount",
  tileId: "w2f.raster.tileId",
  tileSha256: "w2f.raster.tileSha256",
  tilePath: "w2f.raster.tilePath",
} as const;

export type W2fHybridRasterErrorCode =
  | "W2F_E_RASTER_REFERENCE_MISSING"
  | "W2F_E_RASTER_REFERENCE_BOUNDS"
  | "W2F_E_RASTER_TILE_MISSING"
  | "W2F_E_RASTER_TILE_INVALID"
  | "W2F_E_RASTER_TARGET_INVALID";

export class W2fHybridRasterError extends Error {
  readonly code: W2fHybridRasterErrorCode;

  constructor(code: W2fHybridRasterErrorCode, message: string) {
    super(message);
    this.name = "W2fHybridRasterError";
    this.code = code;
  }
}

export interface W2fHybridRasterSurfacePlan {
  renderNodeId: string;
  sourceNodeId: string;
  reference: W2fRasterReferenceEvidence;
  tiles: readonly WtfReferenceTileDescriptor[];
}

export interface W2fHybridRasterPlan {
  version: typeof W2F_HYBRID_RASTER_VERSION;
  surfaces: readonly W2fHybridRasterSurfacePlan[];
}

export interface W2fHybridRasterBundle {
  references: readonly W2fRasterReferenceEvidence[];
  tilePayloadsByPath: Readonly<Record<string, Uint8Array>>;
}

export interface W2fHybridRasterStats {
  rasterNodeCount: number;
  rasterTileNodeCount: number;
  suppressedNativeDescendantCount: number;
}

function renderNodeMap(renderTree: WtfRenderTree): ReadonlyMap<string, WtfRenderNode> {
  return new Map(renderTree.nodes.map((node) => [node.id, node]));
}

function nearestRasterBoundary(
  renderNodeId: string,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): string {
  let cursor = nodes.get(renderNodeId);
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.renderStrategy === "raster") return cursor.id;
    if (!cursor.parentId) break;
    if (seen.has(cursor.parentId)) break;
    seen.add(cursor.parentId);
    cursor = nodes.get(cursor.parentId);
  }
  return renderNodeId;
}

export function effectiveSelectedRootIds(
  renderTree: WtfRenderTree,
  mode: "whole-page" | "selected-roots",
  selectedRootIds: readonly string[],
): string[] {
  if (mode === "whole-page") return [];
  const nodes = renderNodeMap(renderTree);
  return [
    ...new Set(
      selectedRootIds.map((renderNodeId) => nearestRasterBoundary(renderNodeId, nodes)),
    ),
  ];
}

export function renderTreeForNativePass(renderTree: WtfRenderTree): WtfRenderTree {
  return {
    ...renderTree,
    nodes: renderTree.nodes.map((node) => {
      if (node.renderStrategy !== "raster") return node;
      const clone: WtfRenderNode = { ...node, assetRefs: [] };
      delete clone.text;
      return clone;
    }),
  };
}

function containsBounds(
  outer: W2fRasterReferenceEvidence["bounds"],
  inner: WtfRenderNode["geometry"]["bounds"],
): boolean {
  const epsilon = 0.5;
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outer.x + outer.width >= inner.x + inner.width - epsilon &&
    outer.y + outer.height >= inner.y + inner.height - epsilon
  );
}

function boundsDistance(
  reference: W2fRasterReferenceEvidence,
  node: WtfRenderNode,
): number {
  const left = reference.bounds;
  const right = node.geometry.bounds;
  return (
    Math.abs(left.x - right.x) +
    Math.abs(left.y - right.y) +
    Math.abs(left.width - right.width) +
    Math.abs(left.height - right.height)
  );
}

function selectReference(
  node: WtfRenderNode,
  references: readonly W2fRasterReferenceEvidence[],
): W2fRasterReferenceEvidence {
  const sourceIds = new Set(node.sourceNodeIds);
  const sourceBound = references.filter((reference) => sourceIds.has(reference.sourceNodeId));
  if (sourceBound.length === 0) {
    throw new W2fHybridRasterError(
      "W2F_E_RASTER_REFERENCE_MISSING",
      `Raster render node ${node.id} has no source-bound local raster evidence`,
    );
  }
  const covering = sourceBound.filter((reference) => containsBounds(reference.bounds, node.geometry.bounds));
  if (covering.length === 0) {
    throw new W2fHybridRasterError(
      "W2F_E_RASTER_REFERENCE_BOUNDS",
      `Raster evidence for ${node.id} does not cover its minimal fallback boundary`,
    );
  }
  return [...covering].sort((left, right) => {
    const distance = boundsDistance(left, node) - boundsDistance(right, node);
    if (distance !== 0) return distance;
    return left.id.localeCompare(right.id);
  })[0]!;
}

function tileOrder(
  left: WtfReferenceTileDescriptor,
  right: WtfReferenceTileDescriptor,
): number {
  if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
  if (left.bounds.x !== right.bounds.x) return left.bounds.x - right.bounds.x;
  return left.id.localeCompare(right.id);
}

export function createHybridRasterPlan(
  renderTree: WtfRenderTree,
  renderedNodeIds: readonly string[],
  bundle: W2fHybridRasterBundle,
): W2fHybridRasterPlan {
  const rendered = new Set(renderedNodeIds);
  const surfaces: W2fHybridRasterSurfacePlan[] = [];
  for (const node of renderTree.nodes) {
    if (node.renderStrategy !== "raster" || !rendered.has(node.id)) continue;
    const reference = selectReference(node, bundle.references);
    const tiles = [...reference.tiles].sort(tileOrder);
    if (tiles.length === 0) {
      throw new W2fHybridRasterError(
        "W2F_E_RASTER_TILE_MISSING",
        `Raster reference ${reference.id} for ${node.id} has no tiles`,
      );
    }
    for (const tile of tiles) {
      if (tile.bounds.width <= 0 || tile.bounds.height <= 0) {
        throw new W2fHybridRasterError(
          "W2F_E_RASTER_TILE_INVALID",
          `Raster tile ${tile.id} has invalid bounds`,
        );
      }
      if (!bundle.tilePayloadsByPath[tile.path]) {
        throw new W2fHybridRasterError(
          "W2F_E_RASTER_TILE_MISSING",
          `Raster tile payload ${tile.path} is missing for ${node.id}`,
        );
      }
    }
    surfaces.push({
      renderNodeId: node.id,
      sourceNodeId: reference.sourceNodeId,
      reference,
      tiles,
    });
  }
  return { version: W2F_HYBRID_RASTER_VERSION, surfaces };
}

function countSuppressedDescendants(
  renderTree: WtfRenderTree,
  renderedNodeIds: ReadonlySet<string>,
  rasterNodeIds: ReadonlySet<string>,
): number {
  const nodes = renderNodeMap(renderTree);
  let count = 0;
  for (const node of renderTree.nodes) {
    if (renderedNodeIds.has(node.id) || rasterNodeIds.has(node.id)) continue;
    let cursor = node.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (rasterNodeIds.has(cursor)) {
        count += 1;
        break;
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = nodes.get(cursor)?.parentId;
    }
  }
  return count;
}

function setSurfacePluginData(frame: FrameNode, surface: W2fHybridRasterSurfacePlan): void {
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.mode, "minimal-local-fallback");
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.version, W2F_HYBRID_RASTER_VERSION);
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.referenceId, surface.reference.id);
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.referenceKind, surface.reference.kind);
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.sourceNodeId, surface.sourceNodeId);
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.viewportId, surface.reference.viewportId);
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.dpr, String(surface.reference.dpr));
  frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.tileCount, String(surface.tiles.length));
  if (surface.reference.reason) {
    frame.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.reason, surface.reference.reason.slice(0, 1024));
  }
}

function materializeTile(
  frame: FrameNode,
  renderNode: WtfRenderNode,
  tile: WtfReferenceTileDescriptor,
  bytes: Uint8Array,
): void {
  const image = figma.createImage(bytes);
  const rectangle = figma.createRectangle();
  rectangle.name = `Raster tile · ${tile.id}`;
  rectangle.resize(Math.max(0.01, tile.bounds.width), Math.max(0.01, tile.bounds.height));
  rectangle.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
  rectangle.strokes = [];
  rectangle.effects = [];
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.mode, "tile");
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.tileId, tile.id);
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.tileSha256, tile.sha256);
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.tilePath, tile.path);
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.viewportId, tile.viewportId);
  rectangle.setPluginData(W2F_RASTER_PLUGIN_DATA_KEYS.dpr, String(tile.dpr));
  frame.appendChild(rectangle);
  rectangle.x = tile.bounds.x - renderNode.geometry.bounds.x;
  rectangle.y = tile.bounds.y - renderNode.geometry.bounds.y;
}

export function applyFigmaHybridRasterFallbacks(
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,
  renderTree: WtfRenderTree,
  bundle: W2fHybridRasterBundle,
): W2fHybridRasterStats {
  const plan = createHybridRasterPlan(renderTree, [...nodesByRenderNodeId.keys()], bundle);
  const renderNodes = renderNodeMap(renderTree);
  for (const surface of plan.surfaces) {
    const target = nodesByRenderNodeId.get(surface.renderNodeId);
    const renderNode = renderNodes.get(surface.renderNodeId);
    if (!target || target.type !== "FRAME" || !renderNode) {
      throw new W2fHybridRasterError(
        "W2F_E_RASTER_TARGET_INVALID",
        `Raster render node ${surface.renderNodeId} was not materialized as a Figma frame`,
      );
    }

    target.layoutMode = "NONE";
    target.clipsContent = true;
    target.fills = [];
    target.strokes = [];
    target.effects = [];
    setSurfacePluginData(target, surface);

    for (const tile of surface.tiles) {
      const bytes = bundle.tilePayloadsByPath[tile.path];
      if (!bytes) {
        throw new W2fHybridRasterError(
          "W2F_E_RASTER_TILE_MISSING",
          `Raster tile payload ${tile.path} disappeared before Figma materialization`,
        );
      }
      materializeTile(target, renderNode, tile, bytes);
    }
  }

  const rasterNodeIds = new Set(plan.surfaces.map((surface) => surface.renderNodeId));
  const renderedNodeIds = new Set(nodesByRenderNodeId.keys());
  return {
    rasterNodeCount: plan.surfaces.length,
    rasterTileNodeCount: plan.surfaces.reduce((total, surface) => total + surface.tiles.length, 0),
    suppressedNativeDescendantCount: countSuppressedDescendants(
      renderTree,
      renderedNodeIds,
      rasterNodeIds,
    ),
  };
}
