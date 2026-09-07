import { readAssetCapture } from "./asset-store.js";
import { readCompositingAnalysis } from "./compositing-store.js";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readEnvironmentCapture } from "./environment-store.js";
import { readPixelGroundTruth } from "./pixel-ground-truth-store.js";
import { buildProfileCompliantWtfPackage } from "./profile-compliant-wtf-package.js";
import { readResponsiveCapture } from "./responsive-capture-store.js";
import { readResponsiveInference } from "./responsive-inference-store.js";
import { readRawSnapshot } from "./snapshot-store.js";
import type { WtfExportReceipt } from "./wtf-export-contract.js";
import { writeWtfPackage } from "./wtf-package-store.js";

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
  const result = await buildProfileCompliantWtfPackage({
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
