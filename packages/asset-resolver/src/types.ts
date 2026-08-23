import type { WtfAssetRecord } from "@w2f/w2f-ir";

export const ASSET_CAPTURE_VERSION = "1.0.0" as const;

export type AssetCaptureVersion = typeof ASSET_CAPTURE_VERSION;
export type AssetCaptureAdapter = "standard" | "cdp";

export type AssetResourceSourceType =
  | "img"
  | "picture"
  | "css-background"
  | "css-mask"
  | "css-border"
  | "css-content"
  | "css-image"
  | "svg-inline"
  | "svg-external"
  | "data-url"
  | "blob"
  | "video-poster";

export interface AssetResourceProvenance {
  sourceType: AssetResourceSourceType;
  sourceNodeId?: string;
  sourceUrl?: string;
  originalUrl?: string;
  frameId?: string;
  frameOrigin?: string;
  stylesheetRef?: string;
  cssProperty?: string;
}

export interface AssetDomEvidence {
  sourceNodeId: string;
  frameId: string;
  frameOrigin?: string;
  tagName: string;
  authoredSrc?: string;
  currentSrc?: string;
  srcset?: string;
  inlineSvg?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
}

export interface AssetResourceCandidate {
  acquisitionId: string;
  locator?: string;
  inlineText?: string;
  mediaTypeHint?: string;
  currentSrc?: string;
  authoredSrc?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  provenance: AssetResourceProvenance;
}

export interface AssetDiscoveryResult {
  candidates: AssetResourceCandidate[];
  diagnostics: AssetCaptureDiagnostic[];
}

export interface AssetAcquiredResource {
  acquisitionId: string;
  bytes: number[];
  mediaTypeHint?: string;
  currentSrc?: string;
  authoredSrc?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  provenance: AssetResourceProvenance;
}

export interface ResolvedAssetResource {
  record: WtfAssetRecord;
  bytes: number[];
  provenances: AssetResourceProvenance[];
  sourceNodeIds: string[];
  acquisitionIds: string[];
}

export interface AssetCaptureDiagnostic {
  code:
    | "ASSET_FETCH_FAILED"
    | "ASSET_EMPTY_RESOURCE"
    | "ASSET_TOO_LARGE"
    | "ASSET_TOTAL_BUDGET_EXCEEDED"
    | "ASSET_COUNT_BUDGET_EXCEEDED"
    | "ASSET_UNSUPPORTED_MEDIA_TYPE"
    | "ASSET_HASH_FAILED"
    | "ASSET_SOURCE_NODE_UNRESOLVED"
    | "ASSET_SELECTOR_UNSUPPORTED"
    | "ASSET_REFERENCE_INVALID"
    | "ASSET_REFERENCE_UNSUPPORTED"
    | "ASSET_CSS_URL_INVALID"
    | "ASSET_INLINE_SVG_INVALID";
  message: string;
  acquisitionId?: string;
  sourceNodeId?: string;
  sourceUrl?: string;
}

export interface AssetAcquisitionResult {
  resources: AssetAcquiredResource[];
  diagnostics: AssetCaptureDiagnostic[];
}

export interface AssetCapture {
  version: AssetCaptureVersion;
  adapter: AssetCaptureAdapter;
  snapshotId: string;
  assets: ResolvedAssetResource[];
  diagnostics: AssetCaptureDiagnostic[];
}

export interface AssetCaptureSummary {
  version: AssetCaptureVersion;
  adapter: AssetCaptureAdapter;
  assetCount: number;
  uniqueByteCount: number;
  referenceCount: number;
  deduplicatedReferenceCount: number;
  diagnosticCount: number;
}

export type AssetHasher = (bytes: Uint8Array) => Promise<string>;

export interface BuildAssetCaptureInput {
  adapter: AssetCaptureAdapter;
  snapshotId: string;
  acquisition: AssetAcquisitionResult;
}

export interface AssetAcquisitionPolicy {
  maxAssets: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ASSET_ACQUISITION_POLICY: AssetAcquisitionPolicy = {
  maxAssets: 10_000,
  maxAssetBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
};
