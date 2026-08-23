import type { Rect, WtfReferenceTileDescriptor } from "@w2f/w2f-schema";

export const PIXEL_GROUND_TRUTH_VERSION = "1.0.0" as const;
export const DEFAULT_RASTER_TILE_SIZE_PX = 2048 as const;

export type PixelGroundTruthVersion = typeof PIXEL_GROUND_TRUTH_VERSION;
export type PixelCaptureAdapter = "standard" | "cdp";
export type RasterReferenceKind =
  "viewport" | "full-page" | "node-fallback" | "canvas" | "webgl" | "video-frame";

export interface RasterTilePlan {
  id: string;
  row: number;
  column: number;
  bounds: Rect;
  pixelWidth: number;
  pixelHeight: number;
}

export interface RasterCapturedTileInput extends RasterTilePlan {
  bytes: number[];
  mediaType?: "image/png";
}

export interface RasterReferenceInput {
  id: string;
  kind: RasterReferenceKind;
  viewportId: string;
  bounds: Rect;
  dpr: number;
  sourceNodeId?: string;
  reason?: string;
  tiles: RasterCapturedTileInput[];
}

export interface RasterReferenceEvidence {
  id: string;
  kind: RasterReferenceKind;
  viewportId: string;
  bounds: Rect;
  dpr: number;
  sourceNodeId?: string;
  reason?: string;
  tiles: WtfReferenceTileDescriptor[];
}

export interface RasterTileResource {
  sha256: string;
  path: string;
  mediaType: "image/png";
  bytes: number[];
}

export interface PixelGroundTruthDiagnostic {
  code:
    | "RASTER_REFERENCE_INVALID"
    | "RASTER_TILE_INVALID"
    | "RASTER_TILE_MISSING"
    | "RASTER_TILE_EMPTY"
    | "RASTER_TILE_HASH_FAILED"
    | "RASTER_TILE_COUNT_EXCEEDED"
    | "RASTER_TOTAL_BYTES_EXCEEDED"
    | "RASTER_CAPTURE_FAILED"
    | "RASTER_SOURCE_NODE_UNRESOLVED"
    | "RASTER_UNSUPPORTED_SOURCE";
  message: string;
  referenceId?: string;
  sourceNodeId?: string;
  tileId?: string;
}

export interface PixelGroundTruthCapture {
  version: PixelGroundTruthVersion;
  adapter: PixelCaptureAdapter;
  snapshotId: string;
  tileSizePx: number;
  references: RasterReferenceEvidence[];
  tileResources: RasterTileResource[];
  diagnostics: PixelGroundTruthDiagnostic[];
}

export interface PixelGroundTruthSummary {
  version: PixelGroundTruthVersion;
  adapter: PixelCaptureAdapter;
  referenceCount: number;
  viewportReferenceCount: number;
  fullPageReferenceCount: number;
  fallbackReferenceCount: number;
  tileReferenceCount: number;
  uniqueTileCount: number;
  uniqueByteCount: number;
  diagnosticCount: number;
}

export type RasterHasher = (bytes: Uint8Array) => Promise<string>;

export interface BuildPixelGroundTruthInput {
  adapter: PixelCaptureAdapter;
  snapshotId: string;
  tileSizePx?: number;
  references: RasterReferenceInput[];
  diagnostics?: PixelGroundTruthDiagnostic[];
  maxTiles?: number;
  maxTotalBytes?: number;
}
