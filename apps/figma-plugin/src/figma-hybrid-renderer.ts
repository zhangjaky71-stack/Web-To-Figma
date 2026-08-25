import {
  createHybridRasterPlan,
  type W2fRasterBoundaryReadyPlan,
  type W2fReferenceTileDescriptor,
} from "@w2f/figma-renderer";
import type { WtfRenderTree } from "@w2f/w2f-ir";

export interface W2fHybridRasterBundle {
  referenceTiles: readonly W2fReferenceTileDescriptor[];
  referenceTilePayloadsById: Readonly<Record<string, Uint8Array>>;
}

export interface W2fHybridRasterStats {
  plannedBoundaryCount: number;
  rasterizedBoundaryCount: number;
  rasterTileCount: number;
  keptNativeBoundaryCount: number;
  missingTilePayloadCount: number;
  removedDescendantMappingCount: number;
}

const RASTER_TILE_DATA_KEY = "w2f.rasterTileId";
const RASTER_TILE_SHA_KEY = "w2f.rasterTileSha256";
const RASTER_REFERENCE_DATA_KEY = "w2f.rasterReferenceId";
const RASTER_SOURCE_DATA_KEY = "w2f.rasterSourceNodeId";

function copyPluginData(from: SceneNode, to: SceneNode): void {
  for (const key of from.getPluginDataKeys()) {
    to.setPluginData(key, from.getPluginData(key));
  }
}

function parentContainer(node: SceneNode): (BaseNode & ChildrenMixin) | null {
  const parent = node.parent;
  if (!parent || !("children" in parent) || !("insertChild" in parent)) return null;
  return parent as BaseNode & ChildrenMixin;
}

function createTileRectangle(
  tile: W2fRasterBoundaryReadyPlan["tiles"][number],
  image: Image,
): RectangleNode {
  const rectangle = figma.createRectangle();
  rectangle.name = `__W2F_RASTER_TILE__ r${tile.row} c${tile.column}`;
  rectangle.x = tile.localX;
  rectangle.y = tile.localY;
  rectangle.resize(Math.max(0.01, tile.width), Math.max(0.01, tile.height));
  rectangle.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
  rectangle.strokes = [];
  rectangle.effects = [];
  rectangle.setPluginData(RASTER_TILE_DATA_KEY, tile.tileId);
  rectangle.setPluginData(RASTER_TILE_SHA_KEY, tile.sha256);
  return rectangle;
}

function buildRasterFrame(
  oldNode: SceneNode,
  boundary: W2fRasterBoundaryReadyPlan,
  images: readonly Image[],
): FrameNode {
  const frame = figma.createFrame();
  try {
    frame.name = oldNode.name;
    frame.x = oldNode.x;
    frame.y = oldNode.y;
    frame.resize(Math.max(0.01, oldNode.width), Math.max(0.01, oldNode.height));
    frame.layoutMode = "NONE";
    frame.clipsContent = true;
    frame.fills = [];
    frame.strokes = [];
    frame.effects = [];
    frame.opacity = 1;
    frame.blendMode = "NORMAL";
    copyPluginData(oldNode, frame);
    frame.setPluginData(RASTER_REFERENCE_DATA_KEY, boundary.referenceId);
    frame.setPluginData(RASTER_SOURCE_DATA_KEY, boundary.sourceNodeId);

    boundary.tiles.forEach((tile, index) => {
      const image = images[index];
      if (!image) throw new Error(`W2F_E_RASTER_IMAGE: missing prepared image for ${tile.tileId}`);
      frame.appendChild(createTileRectangle(tile, image));
    });
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}

function replaceBoundaryAtSameIndex(oldNode: SceneNode, replacement: FrameNode): void {
  const parent = parentContainer(oldNode);
  if (!parent) {
    replacement.remove();
    throw new Error(`W2F_E_RASTER_PARENT: ${oldNode.type} has no replaceable parent`);
  }
  const index = parent.children.indexOf(oldNode);
  if (index < 0) {
    replacement.remove();
    throw new Error("W2F_E_RASTER_PARENT: raster boundary is absent from parent children");
  }
  parent.insertChild(index, replacement);
  oldNode.remove();
}

export function rasterSafeLayoutTree(
  renderTree: WtfRenderTree,
  rasterizedRenderNodeIds: readonly string[],
): WtfRenderTree {
  const rasterized = new Set(rasterizedRenderNodeIds);
  if (rasterized.size === 0) return renderTree;
  return {
    ...renderTree,
    nodes: renderTree.nodes.map((node) =>
      rasterized.has(node.id)
        ? {
            ...node,
            layout: {
              ...node.layout,
              mode: "none",
              display: "block",
            },
          }
        : node,
    ),
  };
}

export function applyFigmaHybridRaster(
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,
  renderTree: WtfRenderTree,
  bundle: W2fHybridRasterBundle,
): {
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>;
  rasterizedRenderNodeIds: readonly string[];
  stats: W2fHybridRasterStats;
} {
  const nodes = new Map(nodesByRenderNodeId);
  const plan = createHybridRasterPlan({
    renderTree,
    referenceTiles: bundle.referenceTiles,
  });
  const rasterizedRenderNodeIds: string[] = [];
  const stats: W2fHybridRasterStats = {
    plannedBoundaryCount: plan.boundaries.length,
    rasterizedBoundaryCount: 0,
    rasterTileCount: 0,
    keptNativeBoundaryCount: plan.missingBoundaryCount,
    missingTilePayloadCount: 0,
    removedDescendantMappingCount: 0,
  };

  for (const boundary of plan.boundaries) {
    if (boundary.state !== "ready") continue;
    const oldNode = nodes.get(boundary.renderNodeId);
    if (!oldNode) {
      stats.keptNativeBoundaryCount += 1;
      continue;
    }

    const payloads: Uint8Array[] = [];
    let complete = true;
    for (const tile of boundary.tiles) {
      const bytes = bundle.referenceTilePayloadsById[tile.tileId];
      if (!bytes || bytes.byteLength === 0) {
        complete = false;
        stats.missingTilePayloadCount += 1;
      } else {
        payloads.push(bytes);
      }
    }
    if (!complete || payloads.length !== boundary.tiles.length) {
      stats.keptNativeBoundaryCount += 1;
      continue;
    }

    const images = payloads.map((bytes) => figma.createImage(bytes));
    const replacement = buildRasterFrame(oldNode, boundary, images);
    replaceBoundaryAtSameIndex(oldNode, replacement);
    nodes.set(boundary.renderNodeId, replacement);
    for (const descendantId of boundary.descendantRenderNodeIds) {
      if (nodes.delete(descendantId)) stats.removedDescendantMappingCount += 1;
    }
    rasterizedRenderNodeIds.push(boundary.renderNodeId);
    stats.rasterizedBoundaryCount += 1;
    stats.rasterTileCount += boundary.tiles.length;
  }

  return { nodesByRenderNodeId: nodes, rasterizedRenderNodeIds, stats };
}
