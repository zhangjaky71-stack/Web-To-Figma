import type { Rect, WtfReferenceTileDescriptor } from "@w2f/w2f-schema";
import {
  DEFAULT_RASTER_TILE_SIZE_PX,
  PIXEL_GROUND_TRUTH_VERSION,
  type BuildPixelGroundTruthInput,
  type PixelGroundTruthCapture,
  type PixelGroundTruthDiagnostic,
  type PixelGroundTruthSummary,
  type RasterCapturedTileInput,
  type RasterHasher,
  type RasterReferenceEvidence,
  type RasterReferenceInput,
  type RasterTilePlan,
  type RasterTileResource,
} from "./types.js";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new TypeError(`${label} must be positive`);
  return value;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must be non-empty`);
  return normalized;
}

function normalizeRect(value: Rect, label: string): Rect {
  const x = finite(value.x, `${label}.x`);
  const y = finite(value.y, `${label}.y`);
  const width = positive(value.width, `${label}.width`);
  const height = positive(value.height, `${label}.height`);
  return { x, y, width, height };
}

function normalizedTileSize(value: number | undefined): number {
  const tileSize = value ?? DEFAULT_RASTER_TILE_SIZE_PX;
  if (!Number.isSafeInteger(tileSize) || tileSize <= 0 || tileSize > 8192) {
    throw new TypeError("tileSizePx must be an integer between 1 and 8192");
  }
  return tileSize;
}

export function planRasterTiles(
  referenceId: string,
  bounds: Rect,
  dpr: number,
  tileSizePx: number = DEFAULT_RASTER_TILE_SIZE_PX,
): RasterTilePlan[] {
  const id = nonEmpty(referenceId, "referenceId");
  const normalizedBounds = normalizeRect(bounds, "bounds");
  const normalizedDpr = positive(dpr, "dpr");
  const tileSize = normalizedTileSize(tileSizePx);
  const totalPixelWidth = Math.max(1, Math.ceil(normalizedBounds.width * normalizedDpr));
  const totalPixelHeight = Math.max(1, Math.ceil(normalizedBounds.height * normalizedDpr));
  const columns = Math.ceil(totalPixelWidth / tileSize);
  const rows = Math.ceil(totalPixelHeight / tileSize);
  const plans: RasterTilePlan[] = [];

  for (let row = 0; row < rows; row += 1) {
    const pixelY = row * tileSize;
    const pixelHeight = Math.min(tileSize, totalPixelHeight - pixelY);
    const y = normalizedBounds.y + pixelY / normalizedDpr;
    const height =
      row === rows - 1
        ? normalizedBounds.y + normalizedBounds.height - y
        : pixelHeight / normalizedDpr;
    for (let column = 0; column < columns; column += 1) {
      const pixelX = column * tileSize;
      const pixelWidth = Math.min(tileSize, totalPixelWidth - pixelX);
      const x = normalizedBounds.x + pixelX / normalizedDpr;
      const width =
        column === columns - 1
          ? normalizedBounds.x + normalizedBounds.width - x
          : pixelWidth / normalizedDpr;
      plans.push({
        id: `${id}:r${row}:c${column}`,
        row,
        column,
        bounds: { x, y, width, height },
        pixelWidth,
        pixelHeight,
      });
    }
  }

  return plans;
}

function normalizedHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError("raster hash must be a SHA-256 hex digest");
  }
  return normalized;
}

function tilePath(sha256: string): string {
  return `references/${sha256}.png`;
}

function diagnosticSort(
  left: PixelGroundTruthDiagnostic,
  right: PixelGroundTruthDiagnostic,
): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.referenceId ?? "").localeCompare(right.referenceId ?? "") ||
    (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") ||
    (left.tileId ?? "").localeCompare(right.tileId ?? "") ||
    left.message.localeCompare(right.message)
  );
}

function sameBounds(left: Rect, right: Rect): boolean {
  const epsilon = 1e-9;
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.width - right.width) <= epsilon &&
    Math.abs(left.height - right.height) <= epsilon
  );
}

function findPlan(
  plans: RasterTilePlan[],
  tile: RasterCapturedTileInput,
): RasterTilePlan | undefined {
  return plans.find(
    (plan) =>
      plan.id === tile.id &&
      plan.row === tile.row &&
      plan.column === tile.column &&
      plan.pixelWidth === tile.pixelWidth &&
      plan.pixelHeight === tile.pixelHeight &&
      sameBounds(plan.bounds, tile.bounds),
  );
}

async function normalizeReference(
  reference: RasterReferenceInput,
  tileSizePx: number,
  hashBytes: RasterHasher,
  resources: Map<string, RasterTileResource>,
  diagnostics: PixelGroundTruthDiagnostic[],
  budget: { count: number; bytes: number; maxTiles: number; maxTotalBytes: number },
): Promise<RasterReferenceEvidence | null> {
  let id: string;
  let viewportId: string;
  let bounds: Rect;
  let dpr: number;
  try {
    id = nonEmpty(reference.id, "reference.id");
    viewportId = nonEmpty(reference.viewportId, "reference.viewportId");
    bounds = normalizeRect(reference.bounds, "reference.bounds");
    dpr = positive(reference.dpr, "reference.dpr");
  } catch (error) {
    diagnostics.push({
      code: "RASTER_REFERENCE_INVALID",
      message: error instanceof Error ? error.message : String(error),
      ...(reference.id.trim() ? { referenceId: reference.id.trim() } : {}),
      ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
    });
    return null;
  }

  const expected = planRasterTiles(id, bounds, dpr, tileSizePx);
  const seen = new Set<string>();
  const accepted = new Set<string>();
  const descriptors: WtfReferenceTileDescriptor[] = [];

  for (const tile of reference.tiles) {
    if (budget.count >= budget.maxTiles) {
      diagnostics.push({
        code: "RASTER_TILE_COUNT_EXCEEDED",
        message: `Raster capture exceeded the configured ${budget.maxTiles} tile budget.`,
        referenceId: id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      break;
    }
    if (seen.has(tile.id) || !findPlan(expected, tile)) {
      diagnostics.push({
        code: "RASTER_TILE_INVALID",
        message: "Captured tile does not match the deterministic tile plan.",
        referenceId: id,
        tileId: tile.id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      continue;
    }
    seen.add(tile.id);
    if (tile.bytes.length === 0) {
      diagnostics.push({
        code: "RASTER_TILE_EMPTY",
        message: "Captured raster tile contained no PNG bytes.",
        referenceId: id,
        tileId: tile.id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      continue;
    }
    if (budget.bytes + tile.bytes.length > budget.maxTotalBytes) {
      diagnostics.push({
        code: "RASTER_TOTAL_BYTES_EXCEEDED",
        message: `Raster bytes exceed the configured ${budget.maxTotalBytes} byte budget.`,
        referenceId: id,
        tileId: tile.id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      break;
    }

    let sha256: string;
    try {
      sha256 = normalizedHash(await hashBytes(Uint8Array.from(tile.bytes)));
    } catch (error) {
      diagnostics.push({
        code: "RASTER_TILE_HASH_FAILED",
        message: `Raster tile SHA-256 failed: ${error instanceof Error ? error.message : String(error)}`,
        referenceId: id,
        tileId: tile.id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      continue;
    }

    const path = tilePath(sha256);
    if (!resources.has(sha256)) {
      resources.set(sha256, {
        sha256,
        path,
        mediaType: "image/png",
        bytes: [...tile.bytes],
      });
      budget.bytes += tile.bytes.length;
    }
    budget.count += 1;
    accepted.add(tile.id);
    descriptors.push({
      id: tile.id,
      path,
      viewportId,
      bounds: { ...tile.bounds },
      dpr,
      sha256,
    });
  }

  for (const plan of expected) {
    if (accepted.has(plan.id)) continue;
    diagnostics.push({
      code: "RASTER_TILE_MISSING",
      message: "Raster reference is missing a required tile from the deterministic plan.",
      referenceId: id,
      tileId: plan.id,
      ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
    });
  }

  descriptors.sort(
    (left, right) =>
      left.bounds.y - right.bounds.y ||
      left.bounds.x - right.bounds.x ||
      left.id.localeCompare(right.id),
  );
  return {
    id,
    kind: reference.kind,
    viewportId,
    bounds,
    dpr,
    ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
    ...(reference.reason ? { reason: reference.reason } : {}),
    tiles: descriptors,
  };
}

export async function buildPixelGroundTruth(
  input: BuildPixelGroundTruthInput,
  hashBytes: RasterHasher,
): Promise<PixelGroundTruthCapture> {
  const snapshotId = nonEmpty(input.snapshotId, "snapshotId");
  const tileSizePx = normalizedTileSize(input.tileSizePx);
  const maxTiles = Math.max(1, Math.min(input.maxTiles ?? 20_000, 100_000));
  const maxTotalBytes = Math.max(
    1024,
    Math.min(input.maxTotalBytes ?? 512 * 1024 * 1024, 1024 * 1024 * 1024),
  );
  const diagnostics = [...(input.diagnostics ?? [])];
  const resources = new Map<string, RasterTileResource>();
  const references: RasterReferenceEvidence[] = [];
  const seenReferenceIds = new Set<string>();
  const budget = { count: 0, bytes: 0, maxTiles, maxTotalBytes };

  for (const reference of input.references) {
    if (seenReferenceIds.has(reference.id)) {
      diagnostics.push({
        code: "RASTER_REFERENCE_INVALID",
        message: "Raster reference id must be unique within one capture.",
        referenceId: reference.id,
        ...(reference.sourceNodeId ? { sourceNodeId: reference.sourceNodeId } : {}),
      });
      continue;
    }
    seenReferenceIds.add(reference.id);
    const normalized = await normalizeReference(
      reference,
      tileSizePx,
      hashBytes,
      resources,
      diagnostics,
      budget,
    );
    if (normalized) references.push(normalized);
  }

  references.sort((left, right) => left.id.localeCompare(right.id));
  return {
    version: PIXEL_GROUND_TRUTH_VERSION,
    adapter: input.adapter,
    snapshotId,
    tileSizePx,
    references,
    tileResources: [...resources.values()].sort((left, right) =>
      left.sha256.localeCompare(right.sha256),
    ),
    diagnostics: diagnostics.sort(diagnosticSort),
  };
}

export function summarizePixelGroundTruth(
  capture: PixelGroundTruthCapture,
): PixelGroundTruthSummary {
  const fallbackKinds = new Set(["node-fallback", "canvas", "webgl", "video-frame"]);
  return {
    version: capture.version,
    adapter: capture.adapter,
    referenceCount: capture.references.length,
    viewportReferenceCount: capture.references.filter((item) => item.kind === "viewport").length,
    fullPageReferenceCount: capture.references.filter((item) => item.kind === "full-page").length,
    fallbackReferenceCount: capture.references.filter((item) => fallbackKinds.has(item.kind))
      .length,
    tileReferenceCount: capture.references.reduce((total, item) => total + item.tiles.length, 0),
    uniqueTileCount: capture.tileResources.length,
    uniqueByteCount: capture.tileResources.reduce((total, item) => total + item.bytes.length, 0),
    diagnosticCount: capture.diagnostics.length,
  };
}

export function toWtfReferenceTileDescriptors(
  capture: PixelGroundTruthCapture,
): WtfReferenceTileDescriptor[] {
  return capture.references.flatMap((reference) =>
    reference.tiles.map((tile) => ({ ...tile, bounds: { ...tile.bounds } })),
  );
}

export function isPixelGroundTruth(value: unknown): value is PixelGroundTruthCapture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.version !== PIXEL_GROUND_TRUTH_VERSION ||
    (record.adapter !== "standard" && record.adapter !== "cdp") ||
    typeof record.snapshotId !== "string" ||
    record.snapshotId.length === 0 ||
    typeof record.tileSizePx !== "number" ||
    !Number.isSafeInteger(record.tileSizePx) ||
    Number(record.tileSizePx) <= 0 ||
    !Array.isArray(record.references) ||
    !Array.isArray(record.tileResources) ||
    !Array.isArray(record.diagnostics)
  ) {
    return false;
  }
  for (const resource of record.tileResources) {
    if (typeof resource !== "object" || resource === null || Array.isArray(resource)) return false;
    const item = resource as Record<string, unknown>;
    if (
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      typeof item.path !== "string" ||
      item.mediaType !== "image/png" ||
      !Array.isArray(item.bytes) ||
      !item.bytes.every(
        (byte) => typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255,
      )
    ) {
      return false;
    }
  }
  return true;
}
