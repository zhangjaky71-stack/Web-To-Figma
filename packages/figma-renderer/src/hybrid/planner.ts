import type { WtfRenderNode } from "@w2f/w2f-ir";
import type {
  W2fHybridRasterPlan,
  W2fHybridRasterPlannerInput,
  W2fRasterBoundaryPlan,
  W2fRasterTilePlan,
  W2fReferenceTileDescriptor,
} from "./types.js";

const EPSILON = 1e-6;
const RASTER_REFERENCE_KINDS = ["node-fallback", "canvas", "video-frame"] as const;

interface ParsedTileId {
  referenceId: string;
  row: number;
  column: number;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function parseTileId(tileId: string): ParsedTileId | null {
  const match = tileId.match(/^(.*):r(\d+):c(\d+)$/);
  if (!match) return null;
  const row = Number.parseInt(match[2] ?? "", 10);
  const column = Number.parseInt(match[3] ?? "", 10);
  if (!match[1] || !Number.isSafeInteger(row) || !Number.isSafeInteger(column)) return null;
  return { referenceId: match[1], row, column };
}

function parentMap(nodes: readonly WtfRenderNode[]): ReadonlyMap<string, string> {
  const parents = new Map<string, string>();
  for (const node of nodes) {
    if (node.parentId) parents.set(node.id, node.parentId);
    for (const childId of node.childIds) {
      if (!parents.has(childId)) parents.set(childId, node.id);
    }
  }
  return parents;
}

function hasRasterAncestor(
  nodeId: string,
  parents: ReadonlyMap<string, string>,
  byId: ReadonlyMap<string, WtfRenderNode>,
): boolean {
  let current = parents.get(nodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (byId.get(current)?.renderStrategy === "raster") return true;
    current = parents.get(current);
  }
  return false;
}

function descendants(root: WtfRenderNode, byId: ReadonlyMap<string, WtfRenderNode>): string[] {
  const output: string[] = [];
  const stack = [...root.childIds].reverse();
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    const node = byId.get(id);
    if (!node) continue;
    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      const childId = node.childIds[index];
      if (childId) stack.push(childId);
    }
  }
  return output;
}

function referenceIdsForSource(sourceNodeId: string): string[] {
  const encoded = encodeURIComponent(sourceNodeId);
  return RASTER_REFERENCE_KINDS.map((kind) => `${kind}:${encoded}`);
}

function groupReferenceTiles(
  tiles: readonly W2fReferenceTileDescriptor[],
): ReadonlyMap<string, Array<{ descriptor: W2fReferenceTileDescriptor; parsed: ParsedTileId }>> {
  const grouped = new Map<
    string,
    Array<{ descriptor: W2fReferenceTileDescriptor; parsed: ParsedTileId }>
  >();
  for (const descriptor of tiles) {
    const parsed = parseTileId(descriptor.id);
    if (!parsed) continue;
    const group = grouped.get(parsed.referenceId) ?? [];
    group.push({ descriptor, parsed });
    grouped.set(parsed.referenceId, group);
  }
  return grouped;
}

function validateCoverage(
  renderNode: WtfRenderNode,
  referenceId: string,
  entries: readonly { descriptor: W2fReferenceTileDescriptor; parsed: ParsedTileId }[],
): { ok: true; tiles: W2fRasterTilePlan[] } | { ok: false; reason: string } {
  if (entries.length === 0) return { ok: false, reason: `${referenceId} has no raster tiles` };
  const bounds = renderNode.geometry.bounds;
  if (!(bounds.width > 0 && bounds.height > 0)) {
    return { ok: false, reason: `${renderNode.id} has non-positive raster boundary geometry` };
  }

  const viewportId = entries[0]?.descriptor.viewportId;
  const dpr = entries[0]?.descriptor.dpr;
  const cells = new Map<string, (typeof entries)[number]>();
  let maxRow = -1;
  let maxColumn = -1;
  for (const entry of entries) {
    const tile = entry.descriptor;
    if (tile.viewportId !== viewportId || !nearlyEqual(tile.dpr, dpr ?? tile.dpr)) {
      return { ok: false, reason: `${referenceId} mixes viewport or DPR evidence` };
    }
    if (!(tile.bounds.width > 0 && tile.bounds.height > 0)) {
      return { ok: false, reason: `${tile.id} has non-positive tile geometry` };
    }
    if (
      tile.bounds.x < bounds.x - EPSILON ||
      tile.bounds.y < bounds.y - EPSILON ||
      tile.bounds.x + tile.bounds.width > bounds.x + bounds.width + EPSILON ||
      tile.bounds.y + tile.bounds.height > bounds.y + bounds.height + EPSILON
    ) {
      return { ok: false, reason: `${tile.id} escapes raster boundary ${renderNode.id}` };
    }
    const key = `${entry.parsed.row}:${entry.parsed.column}`;
    if (cells.has(key)) return { ok: false, reason: `${referenceId} contains duplicate tile ${key}` };
    cells.set(key, entry);
    maxRow = Math.max(maxRow, entry.parsed.row);
    maxColumn = Math.max(maxColumn, entry.parsed.column);
  }

  for (let row = 0; row <= maxRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1) {
      if (!cells.has(`${row}:${column}`)) {
        return { ok: false, reason: `${referenceId} is missing raster tile r${row}:c${column}` };
      }
    }
  }

  for (let row = 0; row <= maxRow; row += 1) {
    let expectedX = bounds.x;
    for (let column = 0; column <= maxColumn; column += 1) {
      const tile = cells.get(`${row}:${column}`)?.descriptor;
      if (!tile) continue;
      if (!nearlyEqual(tile.bounds.x, expectedX)) {
        return { ok: false, reason: `${referenceId} has a horizontal tile gap or overlap` };
      }
      expectedX = tile.bounds.x + tile.bounds.width;
    }
    if (!nearlyEqual(expectedX, bounds.x + bounds.width)) {
      return { ok: false, reason: `${referenceId} does not cover the raster boundary width` };
    }
  }

  for (let column = 0; column <= maxColumn; column += 1) {
    let expectedY = bounds.y;
    for (let row = 0; row <= maxRow; row += 1) {
      const tile = cells.get(`${row}:${column}`)?.descriptor;
      if (!tile) continue;
      if (!nearlyEqual(tile.bounds.y, expectedY)) {
        return { ok: false, reason: `${referenceId} has a vertical tile gap or overlap` };
      }
      expectedY = tile.bounds.y + tile.bounds.height;
    }
    if (!nearlyEqual(expectedY, bounds.y + bounds.height)) {
      return { ok: false, reason: `${referenceId} does not cover the raster boundary height` };
    }
  }

  const plans = [...entries]
    .sort(
      (left, right) =>
        left.parsed.row - right.parsed.row || left.parsed.column - right.parsed.column,
    )
    .map(({ descriptor, parsed }): W2fRasterTilePlan => ({
      tileId: descriptor.id,
      path: descriptor.path,
      sha256: descriptor.sha256,
      viewportId: descriptor.viewportId,
      dpr: descriptor.dpr,
      row: parsed.row,
      column: parsed.column,
      localX: descriptor.bounds.x - bounds.x,
      localY: descriptor.bounds.y - bounds.y,
      width: descriptor.bounds.width,
      height: descriptor.bounds.height,
    }));
  return { ok: true, tiles: plans };
}

function planBoundary(
  renderNode: WtfRenderNode,
  descendantRenderNodeIds: readonly string[],
  grouped: ReadonlyMap<
    string,
    Array<{ descriptor: W2fReferenceTileDescriptor; parsed: ParsedTileId }>
  >,
): W2fRasterBoundaryPlan {
  const invalid: string[] = [];
  for (const sourceNodeId of renderNode.sourceNodeIds) {
    for (const referenceId of referenceIdsForSource(sourceNodeId)) {
      const entries = grouped.get(referenceId);
      if (!entries) continue;
      const coverage = validateCoverage(renderNode, referenceId, entries);
      if (coverage.ok) {
        return {
          state: "ready",
          renderNodeId: renderNode.id,
          sourceNodeId,
          referenceId,
          descendantRenderNodeIds,
          tiles: coverage.tiles,
        };
      }
      invalid.push(coverage.reason);
    }
  }
  return {
    state: "missing",
    renderNodeId: renderNode.id,
    descendantRenderNodeIds,
    reason:
      invalid.length > 0
        ? [...new Set(invalid)].sort().join("; ")
        : `No packaged local raster reference matched source node(s) for ${renderNode.id}`,
  };
}

export function createHybridRasterPlan(input: W2fHybridRasterPlannerInput): W2fHybridRasterPlan {
  const byId = new Map(input.renderTree.nodes.map((node) => [node.id, node]));
  const parents = parentMap(input.renderTree.nodes);
  const grouped = groupReferenceTiles(input.referenceTiles);
  const rasterRoots = input.renderTree.nodes.filter(
    (node) =>
      node.renderStrategy === "raster" && !hasRasterAncestor(node.id, parents, byId),
  );
  const boundaries = rasterRoots.map((node) =>
    planBoundary(node, descendants(node, byId), grouped),
  );
  const ready = boundaries.filter((boundary) => boundary.state === "ready");
  return {
    boundaries,
    readyBoundaryCount: ready.length,
    missingBoundaryCount: boundaries.length - ready.length,
    tileCount: ready.reduce((total, boundary) => total + boundary.tiles.length, 0),
  };
}
