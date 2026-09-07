import type {
  W2fNode31MeasurementArtifact,
  W2fNode31MeasurementMetricId,
  W2fResponsiveQaReport,
  W2fStructureQaReport,
  W2fVisualQaReport,
} from "@w2f/figma-renderer";
import {
  completeNode31DesktopMeasurement,
  type W2fNode31DesktopMeasurementCompletion,
} from "./node31-desktop-measurement.js";

export interface W2fNode31DesktopExportTile {
  tileId: string;
  pngBytes: Uint8Array;
}

export interface W2fNode31DesktopEvidenceInput {
  baseArtifact: W2fNode31MeasurementArtifact;
  host: {
    isDesktop: boolean;
    apiVersion: string;
    editorType: string;
    userAgent: string;
    platform: string;
  };
  intakeId: string;
  rootNodeId: string;
  createdNodeCount: number;
  mappedRenderNodeCount: number;
  importStartedAt: string;
  importCompletedAt: string;
  structureQa: W2fStructureQaReport;
  responsiveQa?: W2fResponsiveQaReport;
  visualQa: W2fVisualQaReport;
  referenceId: string;
  tiles: readonly W2fNode31DesktopExportTile[];
  additionalMetrics?: Partial<Record<W2fNode31MeasurementMetricId, number>>;
}

export interface W2fNode31DesktopEvidenceFile {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface W2fNode31DesktopEvidenceBundle {
  completion: W2fNode31DesktopMeasurementCompletion;
  files: readonly W2fNode31DesktopEvidenceFile[];
}

const encoder = new TextEncoder();

function safeName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "node31-sample";
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function evidenceFile(
  name: string,
  mediaType: string,
  bytes: Uint8Array,
): Promise<W2fNode31DesktopEvidenceFile> {
  return { name, mediaType, bytes, sha256: await sha256(bytes) };
}

function environmentFingerprint(input: W2fNode31DesktopEvidenceInput): string {
  return [
    "figma-desktop",
    input.host.apiVersion,
    input.host.editorType,
    input.host.platform,
    input.host.userAgent,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("|");
}

/**
 * Packages evidence emitted by the real Figma runtime into deterministic files
 * and completes the existing CI-produced partial measurement artifact. The
 * caller must explicitly prove it is running in Figma Desktop; browser/cloud
 * Plugin API execution is rejected instead of being relabeled as Desktop.
 */
export async function createNode31DesktopEvidenceBundle(
  input: W2fNode31DesktopEvidenceInput,
): Promise<W2fNode31DesktopEvidenceBundle> {
  if (!input.host.isDesktop) {
    throw new TypeError("NODE-31 release evidence requires the real Figma Desktop host");
  }
  if (input.visualQa.status === "UNAVAILABLE") {
    throw new TypeError("NODE-31 Desktop evidence requires an observed visual QA result");
  }
  if (input.tiles.length === 0) {
    throw new TypeError("NODE-31 Desktop evidence requires at least one exported PNG tile");
  }

  const sampleName = safeName(input.baseArtifact.sample.id);
  const renderName = `${sampleName}.figma-render.json`;
  const exportName = `${sampleName}.figma-export.json`;
  const measurementName = `${sampleName}.measurement.json`;

  const renderDocument = {
    version: "1.0.0",
    evidenceType: "node31-figma-desktop-render",
    sampleId: input.baseArtifact.sample.id,
    sourceSha256: input.baseArtifact.sample.sourceSha256,
    intakeId: input.intakeId,
    rootNodeId: input.rootNodeId,
    createdNodeCount: input.createdNodeCount,
    mappedRenderNodeCount: input.mappedRenderNodeCount,
    importStartedAt: input.importStartedAt,
    importCompletedAt: input.importCompletedAt,
    host: {
      kind: "figma-desktop",
      apiVersion: input.host.apiVersion,
      editorType: input.host.editorType,
      userAgent: input.host.userAgent,
      platform: input.host.platform,
    },
    structureQa: input.structureQa,
    ...(input.responsiveQa ? { responsiveQa: input.responsiveQa } : {}),
    visualQa: input.visualQa,
  };
  const renderFile = await evidenceFile(renderName, "application/json", jsonBytes(renderDocument));

  const tileFiles: W2fNode31DesktopEvidenceFile[] = [];
  for (const [index, tile] of input.tiles.entries()) {
    const tileName = `${sampleName}.figma-tile-${String(index + 1).padStart(2, "0")}-${safeName(tile.tileId)}.png`;
    tileFiles.push(await evidenceFile(tileName, "image/png", tile.pngBytes));
  }
  const exportDocument = {
    version: "1.0.0",
    evidenceType: "node31-figma-desktop-export",
    sampleId: input.baseArtifact.sample.id,
    sourceSha256: input.baseArtifact.sample.sourceSha256,
    referenceId: input.referenceId,
    tiles: tileFiles.map((file, index) => ({
      tileId: input.tiles[index]!.tileId,
      artifact: file.name,
      mediaType: file.mediaType,
      byteLength: file.bytes.byteLength,
      sha256: file.sha256,
    })),
  };
  const exportFile = await evidenceFile(exportName, "application/json", jsonBytes(exportDocument));

  const metrics: Partial<Record<W2fNode31MeasurementMetricId, number>> = {
    ...(input.additionalMetrics ?? {}),
    visualSimilarity: input.visualQa.metrics.normalizedSimilarity,
    structureFidelity: input.structureQa.metrics.structureScore,
    editableAreaRatio: input.structureQa.metrics.editableAreaRatio,
    rasterAreaRatio: input.structureQa.metrics.rasterAreaRatio,
  };
  const completion = completeNode31DesktopMeasurement(input.baseArtifact, {
    figmaHostVersion: input.host.apiVersion,
    environmentFingerprint: environmentFingerprint(input),
    render: { artifact: renderFile.name, sha256: renderFile.sha256 },
    export: { artifact: exportFile.name, sha256: exportFile.sha256 },
    metrics,
    notes: [
      "Figma render/export evidence was recorded by the plugin runtime and bound to the CI-produced browser/WTF source hashes.",
      "Export manifest binds each observed PNG tile by SHA-256; raw PNG evidence is emitted alongside the measurement artifact.",
      ...(input.responsiveQa
        ? [
            `Responsive QA used real Figma Desktop clones across ${input.responsiveQa.status === "UNAVAILABLE" ? 0 : "the parsed"} responsive viewports and the frozen NODE-30 property-level scorer.`,
          ]
        : []),
    ],
  });
  const measurementFile = await evidenceFile(
    measurementName,
    "application/json",
    jsonBytes(completion.artifact),
  );

  return {
    completion,
    files: [renderFile, exportFile, measurementFile, ...tileFiles],
  };
}
