import { evaluateNode31EvidenceManifest } from "./evidence-manifest.js";
import {
  evaluateNode31MeasurementArtifact,
  type W2fNode31MeasurementArtifact,
} from "./measurement-artifact.js";

export interface W2fNode31MeasurementPromotionOptions {
  measurementArtifact: string;
  expectedBranchHead?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeArtifactPath(value: string): string {
  const path = value.trim();
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error("NODE31_E_PROMOTION_PATH: measurementArtifact must be a safe repository-relative path");
  }
  return path;
}

function assertFieldMatch(
  label: string,
  expected: unknown,
  observed: unknown,
): void {
  if (expected !== undefined && expected !== observed) {
    throw new Error(
      `NODE31_E_PROMOTION_MISMATCH: ${label} expected ${String(expected)} but measured ${String(observed)}`,
    );
  }
}

export function applyNode31MeasurementArtifactToManifest(
  input: unknown,
  artifact: W2fNode31MeasurementArtifact,
  options: W2fNode31MeasurementPromotionOptions,
): Record<string, unknown> {
  const manifestReport = evaluateNode31EvidenceManifest(input);
  if (manifestReport.failures.length > 0) {
    throw new Error(
      `NODE31_E_PROMOTION_MANIFEST: manifest is not promotable: ${manifestReport.failures.join("; ")}`,
    );
  }

  const measurementReport = evaluateNode31MeasurementArtifact(artifact);
  if (!measurementReport.releaseEligible) {
    const detail = [...measurementReport.failures, ...measurementReport.unavailable].join("; ");
    throw new Error(
      `NODE31_E_PROMOTION_MEASUREMENT: measurement is not release-eligible${detail ? `: ${detail}` : ""}`,
    );
  }

  const measurementArtifact = safeArtifactPath(options.measurementArtifact);
  if (
    options.expectedBranchHead !== undefined &&
    artifact.provenance.branchHead !== options.expectedBranchHead
  ) {
    throw new Error(
      `NODE31_E_PROMOTION_HEAD: measurement head ${artifact.provenance.branchHead} does not match expected head ${options.expectedBranchHead}`,
    );
  }

  if (!isRecord(input)) {
    throw new Error("NODE31_E_PROMOTION_MANIFEST: evidence manifest must be an object");
  }

  const bucketKey = artifact.sample.testClass === "A" ? "classA" : "classB";
  const bucket = Array.isArray(input[bucketKey]) ? input[bucketKey] : [];
  const matchIndexes = bucket.flatMap((entry, index) =>
    isRecord(entry) && stringValue(entry.id) === artifact.sample.id ? [index] : [],
  );
  if (matchIndexes.length !== 1) {
    throw new Error(
      `NODE31_E_PROMOTION_SAMPLE: expected exactly one ${bucketKey} manifest row for ${artifact.sample.id}; found ${matchIndexes.length}`,
    );
  }

  const matchIndex = matchIndexes[0] as number;
  const entry = bucket[matchIndex];
  if (!isRecord(entry)) {
    throw new Error(`NODE31_E_PROMOTION_SAMPLE: manifest row ${artifact.sample.id} is invalid`);
  }

  const sourceArtifact = stringValue(entry.sourceArtifact);
  if (sourceArtifact !== artifact.sample.sourceArtifact) {
    throw new Error(
      `NODE31_E_PROMOTION_SOURCE: ${artifact.sample.id} source ${artifact.sample.sourceArtifact} does not match manifest ${String(sourceArtifact)}`,
    );
  }

  if (artifact.sample.testClass === "A") {
    assertFieldMatch("level", entry.level, artifact.sample.level);
  } else {
    assertFieldMatch("category", entry.category, artifact.sample.category);
    assertFieldMatch("supportClass", entry.supportClass, artifact.sample.supportClass);
    assertFieldMatch("standardHtmlCss", entry.standardHtmlCss, artifact.sample.standardHtmlCss);
  }

  if (entry.measurementStatus === "PASS") {
    const existingArtifact = stringValue(entry.measurementArtifact);
    if (existingArtifact !== measurementArtifact) {
      throw new Error(
        `NODE31_E_PROMOTION_CONFLICT: ${artifact.sample.id} already points to ${String(existingArtifact)}`,
      );
    }
  }

  const updatedBucket = bucket.map((value, index) =>
    index === matchIndex
      ? {
          ...entry,
          measurementStatus: "PASS",
          measurementArtifact,
        }
      : value,
  );
  const updated: Record<string, unknown> = {
    ...input,
    [bucketKey]: updatedBucket,
  };
  const updatedReport = evaluateNode31EvidenceManifest(updated);
  if (updatedReport.failures.length > 0) {
    throw new Error(
      `NODE31_E_PROMOTION_RESULT: promoted manifest is invalid: ${updatedReport.failures.join("; ")}`,
    );
  }
  return updated;
}
