import type { WtfAssetRecord } from "@w2f/w2f-ir";
import {
  ASSET_CAPTURE_VERSION,
  type AssetAcquiredResource,
  type AssetCapture,
  type AssetCaptureDiagnostic,
  type AssetCaptureSummary,
  type AssetHasher,
  type AssetResourceProvenance,
  type BuildAssetCaptureInput,
  type ResolvedAssetResource,
} from "./types.js";

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
  const stripped = sample.replace(/^\uFEFF/, "").trimStart();
  return /^<\?xml[\s\S]*?<svg\b/i.test(stripped) || /^<svg\b/i.test(stripped);
}

export function sniffAssetMediaType(
  bytes: Uint8Array,
  mediaTypeHint?: string,
  sourceUrl?: string,
): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return "image/x-icon";
  }
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === "BM") return "image/bmp";
  if (looksLikeSvg(bytes)) return "image/svg+xml";

  const normalizedHint = mediaTypeHint?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalizedHint?.startsWith("image/")) return normalizedHint;

  const pathname = sourceUrl?.split(/[?#]/, 1)[0]?.toLowerCase();
  if (pathname?.endsWith(".svg") || pathname?.endsWith(".svgz")) return "image/svg+xml";
  return null;
}

export function extensionForMediaType(mediaType: string): string {
  switch (mediaType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    default:
      return "bin";
  }
}

function normalizedHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError("asset hash must be a lowercase-compatible SHA-256 hex digest");
  }
  return normalized;
}

function provenanceKey(value: AssetResourceProvenance): string {
  return [
    value.sourceType,
    value.sourceNodeId ?? "",
    value.sourceUrl ?? "",
    value.originalUrl ?? "",
    value.frameId ?? "",
    value.frameOrigin ?? "",
    value.stylesheetRef ?? "",
    value.cssProperty ?? "",
  ].join("\u001f");
}

function mergeProvenances(
  first: AssetResourceProvenance[],
  second: AssetResourceProvenance[],
): AssetResourceProvenance[] {
  const map = new Map<string, AssetResourceProvenance>();
  for (const item of [...first, ...second]) map.set(provenanceKey(item), item);
  return [...map.values()].sort((a, b) => provenanceKey(a).localeCompare(provenanceKey(b)));
}

function toRecord(
  resource: AssetAcquiredResource,
  sha256: string,
  mediaType: string,
): WtfAssetRecord {
  const provenance = resource.provenance;
  const sourceUrl = provenance.sourceUrl ?? resource.currentSrc;
  return {
    id: `asset:${sha256}`,
    kind: mediaType === "image/svg+xml" ? "svg" : "image",
    mediaType,
    sha256,
    embeddedPath: `assets/${sha256}.${extensionForMediaType(mediaType)}`,
    byteLength: resource.bytes.length,
    ...(resource.displayWidth === undefined ? {} : { width: resource.displayWidth }),
    ...(resource.displayHeight === undefined ? {} : { height: resource.displayHeight }),
    ...(resource.intrinsicWidth === undefined ? {} : { intrinsicWidth: resource.intrinsicWidth }),
    ...(resource.intrinsicHeight === undefined ? {} : { intrinsicHeight: resource.intrinsicHeight }),
    ...(resource.currentSrc ? { currentSrc: resource.currentSrc } : {}),
    ...(resource.authoredSrc ? { authoredSrc: resource.authoredSrc } : {}),
    provenance: {
      provider: provenance.sourceType,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(provenance.originalUrl ? { originalUrl: provenance.originalUrl } : {}),
      ...(provenance.stylesheetRef ? { stylesheetRef: provenance.stylesheetRef } : {}),
      ...(provenance.sourceNodeId ? { sourceNodeId: provenance.sourceNodeId } : {}),
    },
  };
}

function mergeRecord(existing: WtfAssetRecord, next: WtfAssetRecord): WtfAssetRecord {
  return {
    ...existing,
    ...(existing.width === undefined && next.width !== undefined ? { width: next.width } : {}),
    ...(existing.height === undefined && next.height !== undefined ? { height: next.height } : {}),
    ...(existing.intrinsicWidth === undefined && next.intrinsicWidth !== undefined
      ? { intrinsicWidth: next.intrinsicWidth }
      : {}),
    ...(existing.intrinsicHeight === undefined && next.intrinsicHeight !== undefined
      ? { intrinsicHeight: next.intrinsicHeight }
      : {}),
    ...(existing.currentSrc === undefined && next.currentSrc ? { currentSrc: next.currentSrc } : {}),
    ...(existing.authoredSrc === undefined && next.authoredSrc ? { authoredSrc: next.authoredSrc } : {}),
  };
}

function diagnosticSort(a: AssetCaptureDiagnostic, b: AssetCaptureDiagnostic): number {
  return (
    a.code.localeCompare(b.code) ||
    (a.sourceNodeId ?? "").localeCompare(b.sourceNodeId ?? "") ||
    (a.sourceUrl ?? "").localeCompare(b.sourceUrl ?? "") ||
    a.message.localeCompare(b.message)
  );
}

export async function buildAssetCapture(
  input: BuildAssetCaptureInput,
  hashBytes: AssetHasher,
): Promise<AssetCapture> {
  const snapshotId = nonEmpty(input.snapshotId, "snapshotId");
  const diagnostics = [...input.acquisition.diagnostics];
  const byHash = new Map<string, ResolvedAssetResource>();

  for (const resource of input.acquisition.resources) {
    const acquisitionId = nonEmpty(resource.acquisitionId, "acquisitionId");
    if (!resource.bytes.length) {
      diagnostics.push({
        code: "ASSET_EMPTY_RESOURCE",
        message: "Resolved asset contained no bytes.",
        acquisitionId,
        ...(resource.provenance.sourceNodeId
          ? { sourceNodeId: resource.provenance.sourceNodeId }
          : {}),
        ...(resource.provenance.sourceUrl ? { sourceUrl: resource.provenance.sourceUrl } : {}),
      });
      continue;
    }

    const bytes = Uint8Array.from(resource.bytes);
    const mediaType = sniffAssetMediaType(
      bytes,
      resource.mediaTypeHint,
      resource.provenance.sourceUrl ?? resource.currentSrc,
    );
    if (!mediaType) {
      diagnostics.push({
        code: "ASSET_UNSUPPORTED_MEDIA_TYPE",
        message: "Asset bytes could not be identified as a supported image or SVG resource.",
        acquisitionId,
        ...(resource.provenance.sourceNodeId
          ? { sourceNodeId: resource.provenance.sourceNodeId }
          : {}),
        ...(resource.provenance.sourceUrl ? { sourceUrl: resource.provenance.sourceUrl } : {}),
      });
      continue;
    }

    let sha256: string;
    try {
      sha256 = normalizedHash(await hashBytes(bytes));
    } catch (error) {
      diagnostics.push({
        code: "ASSET_HASH_FAILED",
        message: `SHA-256 failed: ${error instanceof Error ? error.message : String(error)}`,
        acquisitionId,
        ...(resource.provenance.sourceNodeId
          ? { sourceNodeId: resource.provenance.sourceNodeId }
          : {}),
        ...(resource.provenance.sourceUrl ? { sourceUrl: resource.provenance.sourceUrl } : {}),
      });
      continue;
    }

    const nextRecord = toRecord(resource, sha256, mediaType);
    const existing = byHash.get(sha256);
    if (existing) {
      existing.record = mergeRecord(existing.record, nextRecord);
      existing.provenances = mergeProvenances(existing.provenances, [resource.provenance]);
      existing.sourceNodeIds = uniqueSorted([
        ...existing.sourceNodeIds,
        ...(resource.provenance.sourceNodeId ? [resource.provenance.sourceNodeId] : []),
      ]);
      existing.acquisitionIds = uniqueSorted([...existing.acquisitionIds, acquisitionId]);
      continue;
    }

    byHash.set(sha256, {
      record: nextRecord,
      bytes: [...resource.bytes],
      provenances: [resource.provenance],
      sourceNodeIds: resource.provenance.sourceNodeId ? [resource.provenance.sourceNodeId] : [],
      acquisitionIds: [acquisitionId],
    });
  }

  return {
    version: ASSET_CAPTURE_VERSION,
    adapter: input.adapter,
    snapshotId,
    assets: [...byHash.values()].sort((a, b) => a.record.id.localeCompare(b.record.id)),
    diagnostics: diagnostics.sort(diagnosticSort),
  };
}

export function summarizeAssetCapture(capture: AssetCapture): AssetCaptureSummary {
  const referenceCount = capture.assets.reduce(
    (total, item) => total + item.acquisitionIds.length,
    0,
  );
  return {
    version: capture.version,
    adapter: capture.adapter,
    assetCount: capture.assets.length,
    uniqueByteCount: capture.assets.reduce((total, item) => total + item.bytes.length, 0),
    referenceCount,
    deduplicatedReferenceCount: Math.max(0, referenceCount - capture.assets.length),
    diagnosticCount: capture.diagnostics.length,
  };
}

export function toWtfAssetRecords(capture: AssetCapture): WtfAssetRecord[] {
  return capture.assets.map((item) => ({
    ...item.record,
    ...(item.record.provenance ? { provenance: { ...item.record.provenance } } : {}),
  }));
}

export function isAssetCapture(value: unknown): value is AssetCapture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.version !== ASSET_CAPTURE_VERSION ||
    (record.adapter !== "standard" && record.adapter !== "cdp") ||
    typeof record.snapshotId !== "string" ||
    !record.snapshotId ||
    !Array.isArray(record.assets) ||
    !Array.isArray(record.diagnostics)
  ) {
    return false;
  }
  for (const asset of record.assets) {
    if (typeof asset !== "object" || asset === null || Array.isArray(asset)) return false;
    const item = asset as Record<string, unknown>;
    if (
      typeof item.record !== "object" ||
      item.record === null ||
      !Array.isArray(item.bytes) ||
      !item.bytes.every(
        (byte) => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255,
      ) ||
      !Array.isArray(item.provenances) ||
      !Array.isArray(item.sourceNodeIds) ||
      !Array.isArray(item.acquisitionIds)
    ) {
      return false;
    }
  }
  return true;
}
