import { readAssetCapture } from "./asset-store.js";
import { readCompositingAnalysis } from "./compositing-store.js";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readEnvironmentCapture } from "./environment-store.js";
import { readPixelGroundTruth } from "./pixel-ground-truth-store.js";
import { readResponsiveCapture } from "./responsive-capture-store.js";
import { readResponsiveInference } from "./responsive-inference-store.js";
import { readRawSnapshot } from "./snapshot-store.js";
import { buildWtfPackage } from "./wtf-package-builder.js";
import { writeWtfPackage } from "./wtf-package-store.js";

export interface WtfExportReceipt {
  storageKey: string;
  jobId: string;
  artifactId: string;
  filename: string;
  mimeType: "application/x-wtf";
  archiveByteCount: number;
  archiveSha256: string;
  payloadCount: number;
  archiveEntryCount: number;
  responsiveSnapshotCount: number;
}

async function primaryArtifactId(jobId: string): Promise<{
  artifactId: string;
  responsiveSnapshotCount: number;
}> {
  const capture = await readResponsiveCapture(jobId);
  if (!capture) return { artifactId: jobId, responsiveSnapshotCount: 0 };
  const first = capture.snapshots[0];
  if (!first) throw new Error("responsive capture contains no persisted snapshots");
  return { artifactId: first.artifactId, responsiveSnapshotCount: capture.snapshots.length };
}

function requireEvidence<T>(value: T | null, label: string, artifactId: string): T {
  if (value === null) throw new Error(`cannot export .wtf: missing ${label} for ${artifactId}`);
  return value;
}

export async function persistWtfExport(jobId: string): Promise<WtfExportReceipt> {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  const primary = await primaryArtifactId(normalized);
  const artifactId = primary.artifactId;
  const [snapshot, css, environment, assets, pixel, compositing, responsive] = await Promise.all([
    readRawSnapshot(artifactId),
    readCssCascadeCapture(artifactId),
    readEnvironmentCapture(artifactId),
    readAssetCapture(artifactId),
    readPixelGroundTruth(artifactId),
    readCompositingAnalysis(artifactId),
    readResponsiveInference(normalized),
  ]);
  const result = await buildWtfPackage({
    jobId: normalized,
    snapshot: requireEvidence(snapshot, "RawSnapshot", artifactId),
    css: requireEvidence(css, "CssCascadeCapture", artifactId),
    environment: requireEvidence(environment, "EnvironmentCapture", artifactId),
    assets: requireEvidence(assets, "AssetCapture", artifactId),
    pixel: requireEvidence(pixel, "PixelGroundTruthCapture", artifactId),
    compositing: requireEvidence(compositing, "CompositingAnalysisResult", artifactId),
    ...(responsive ? { responsive } : {}),
  });
  const storageKey = await writeWtfPackage(normalized, result);
  return {
    storageKey,
    jobId: normalized,
    artifactId,
    filename: result.filename,
    mimeType: result.mimeType,
    archiveByteCount: result.bytes.byteLength,
    archiveSha256: result.sha256,
    payloadCount: result.files.length,
    archiveEntryCount: result.entries.length,
    responsiveSnapshotCount: primary.responsiveSnapshotCount,
  };
}

export function isWtfExportReceipt(value: unknown): value is WtfExportReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.storageKey === "string" &&
    typeof record.jobId === "string" &&
    typeof record.artifactId === "string" &&
    typeof record.filename === "string" &&
    record.filename.toLowerCase().endsWith(".wtf") &&
    record.mimeType === "application/x-wtf" &&
    typeof record.archiveByteCount === "number" &&
    Number.isSafeInteger(record.archiveByteCount) &&
    record.archiveByteCount > 0 &&
    typeof record.archiveSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.archiveSha256) &&
    typeof record.payloadCount === "number" &&
    Number.isSafeInteger(record.payloadCount) &&
    typeof record.archiveEntryCount === "number" &&
    Number.isSafeInteger(record.archiveEntryCount) &&
    typeof record.responsiveSnapshotCount === "number" &&
    Number.isSafeInteger(record.responsiveSnapshotCount)
  );
}
