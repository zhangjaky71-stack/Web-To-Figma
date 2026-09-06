import {
  evaluateNode31MeasurementArtifact,
  W2F_NODE31_MEASUREMENT_METHODS,
  type W2fNode31MeasurementArtifact,
  type W2fNode31MeasurementArtifactReport,
  type W2fNode31MeasurementMetricId,
} from "@w2f/figma-renderer";

export interface W2fNode31DesktopStageArtifact {
  artifact: string;
  sha256: string;
}

export interface W2fNode31DesktopMeasurementObservation {
  figmaHostVersion: string;
  environmentFingerprint: string;
  render: W2fNode31DesktopStageArtifact;
  export: W2fNode31DesktopStageArtifact;
  metrics: Partial<Record<W2fNode31MeasurementMetricId, number>>;
  notes?: readonly string[];
}

export interface W2fNode31DesktopMeasurementCompletion {
  artifact: W2fNode31MeasurementArtifact;
  report: W2fNode31MeasurementArtifactReport;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} is required`);
}

function assertSha256(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256`);
  }
}

function assertNormalized(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be a normalized finite value between 0 and 1`);
  }
}

function measuredMetric(
  id: W2fNode31MeasurementMetricId,
  value: number,
  referenceArtifact: string,
  observedArtifact: string,
) {
  assertNormalized(value, id);
  return {
    status: "MEASURED" as const,
    value,
    method: W2F_NODE31_MEASUREMENT_METHODS[id],
    referenceArtifact,
    observedArtifact,
  };
}

function assertBasePipeline(base: W2fNode31MeasurementArtifact): void {
  for (const [label, stage] of [
    ["browserCapture", base.pipeline.browserCapture],
    ["wtfPackage", base.pipeline.wtfPackage],
    ["secureParse", base.pipeline.secureParse],
  ] as const) {
    if (stage.status !== "PASS") {
      throw new TypeError(`${label} must be PASS before Figma Desktop completion`);
    }
    assertNonEmpty(stage.artifact ?? "", `${label}.artifact`);
    assertSha256(stage.sha256 ?? "", `${label}.sha256`);
  }
}

/**
 * Completes a NODE-31 partial measurement with observations produced by the real
 * Figma Desktop plugin runtime. This helper deliberately does not invent absent
 * metrics: Class A remains UNAVAILABLE until geometry/text/asset/structure/
 * responsive evidence has actually been measured.
 */
export function completeNode31DesktopMeasurement(
  base: W2fNode31MeasurementArtifact,
  observation: W2fNode31DesktopMeasurementObservation,
): W2fNode31DesktopMeasurementCompletion {
  const baseReport = evaluateNode31MeasurementArtifact(base);
  if (baseReport.failures.length > 0) {
    throw new TypeError(`base measurement has contract failures: ${baseReport.failures.join("; ")}`);
  }
  assertBasePipeline(base);
  assertNonEmpty(observation.figmaHostVersion, "figmaHostVersion");
  assertNonEmpty(observation.environmentFingerprint, "environmentFingerprint");
  assertNonEmpty(observation.render.artifact, "render.artifact");
  assertSha256(observation.render.sha256, "render.sha256");
  assertNonEmpty(observation.export.artifact, "export.artifact");
  assertSha256(observation.export.sha256, "export.sha256");

  const referenceArtifact = base.pipeline.browserCapture.artifact!;
  const observedArtifact = observation.export.artifact;
  const metrics: W2fNode31MeasurementArtifact["metrics"] = { ...base.metrics };
  for (const id of Object.keys(observation.metrics) as W2fNode31MeasurementMetricId[]) {
    const value = observation.metrics[id];
    if (value === undefined) continue;
    metrics[id] = measuredMetric(id, value, referenceArtifact, observedArtifact);
  }

  const artifact: W2fNode31MeasurementArtifact = {
    ...base,
    provenance: {
      ...base.provenance,
      generatedAt: new Date().toISOString(),
      environmentFingerprint: observation.environmentFingerprint,
    },
    pipeline: {
      ...base.pipeline,
      figmaRender: {
        status: "PASS",
        artifact: observation.render.artifact,
        sha256: observation.render.sha256,
        host: {
          kind: "figma-desktop",
          version: observation.figmaHostVersion,
          evidenceArtifact: observation.render.artifact,
        },
      },
      figmaExport: {
        status: "PASS",
        artifact: observation.export.artifact,
        sha256: observation.export.sha256,
      },
    },
    metrics,
    notes: [...(base.notes ?? []), ...(observation.notes ?? [])],
  };

  return {
    artifact,
    report: evaluateNode31MeasurementArtifact(artifact),
  };
}
