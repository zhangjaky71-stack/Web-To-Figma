import {
  type W2fNode31CorpusSample,
  type W2fNode31Status,
  type W2fNode31SupportClass,
  type W2fNode31TestClass,
} from "./node31-types.js";

export const W2F_NODE31_MEASUREMENT_ARTIFACT_VERSION = "1.0.0" as const;

export const W2F_NODE31_MEASUREMENT_METHODS = {
  visualSimilarity: "pixel-ground-truth-normalized-rgb",
  geometryFidelity: "matched-node-geometry",
  textFidelity: "supported-font-text-run",
  assetFidelity: "asset-hash-presence",
  structureFidelity: "source-render-tree-structure",
  editableAreaRatio: "native-editable-area",
  responsiveFidelity: "deterministic-responsive-state",
  rasterAreaRatio: "raster-surface-area",
} as const;

export type W2fNode31MeasurementMetricId = keyof typeof W2F_NODE31_MEASUREMENT_METHODS;
export type W2fNode31MeasurementMethod =
  (typeof W2F_NODE31_MEASUREMENT_METHODS)[W2fNode31MeasurementMetricId];
export type W2fNode31MeasurementStageStatus = "PASS" | "FAIL" | "UNAVAILABLE";
export type W2fNode31FigmaHostKind = "figma-desktop" | "figma-host-simulator" | "memory-renderer";

export interface W2fNode31MeasurementStageEvidence {
  status: W2fNode31MeasurementStageStatus;
  artifact?: string;
  sha256?: string;
  reason?: string;
}

export interface W2fNode31FigmaRenderStageEvidence extends W2fNode31MeasurementStageEvidence {
  host: {
    kind: W2fNode31FigmaHostKind;
    version?: string;
    evidenceArtifact?: string;
  };
}

export interface W2fNode31MeasuredMetricEvidence {
  status: "MEASURED";
  value: number;
  method: W2fNode31MeasurementMethod;
  referenceArtifact: string;
  observedArtifact: string;
}

export interface W2fNode31UnavailableMetricEvidence {
  status: "UNAVAILABLE";
  reason: string;
}

export type W2fNode31MeasurementMetricEvidence =
  | W2fNode31MeasuredMetricEvidence
  | W2fNode31UnavailableMetricEvidence;

export interface W2fNode31MeasurementArtifact {
  version: typeof W2F_NODE31_MEASUREMENT_ARTIFACT_VERSION;
  evidenceType: "node31-fidelity-measurement";
  sample: {
    id: string;
    testClass: Exclude<W2fNode31TestClass, "C">;
    category: string;
    supportClass: W2fNode31SupportClass;
    standardHtmlCss: boolean;
    level?: 1 | 2 | 3;
    sourceArtifact: string;
    sourceSha256: string;
  };
  provenance: {
    branchHead: string;
    generatedAt: string;
    environmentFingerprint: string;
    ciRunId?: number;
  };
  pipeline: {
    browserCapture: W2fNode31MeasurementStageEvidence;
    wtfPackage: W2fNode31MeasurementStageEvidence;
    secureParse: W2fNode31MeasurementStageEvidence;
    figmaRender: W2fNode31FigmaRenderStageEvidence;
    figmaExport: W2fNode31MeasurementStageEvidence;
  };
  metrics: Partial<Record<W2fNode31MeasurementMetricId, W2fNode31MeasurementMetricEvidence>>;
  antiCheatingViolations: readonly string[];
  notes?: readonly string[];
}

export interface W2fNode31MeasurementArtifactReport {
  version: typeof W2F_NODE31_MEASUREMENT_ARTIFACT_VERSION;
  status: W2fNode31Status;
  releaseEligible: boolean;
  sampleId: string;
  corpusSample?: W2fNode31CorpusSample;
  failures: readonly string[];
  unavailable: readonly string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function requiredMetricIds(artifact: W2fNode31MeasurementArtifact): W2fNode31MeasurementMetricId[] {
  if (artifact.sample.testClass === "A") {
    return [
      "visualSimilarity",
      "geometryFidelity",
      "textFidelity",
      "assetFidelity",
      "structureFidelity",
      "responsiveFidelity",
    ];
  }
  if (artifact.sample.standardHtmlCss && artifact.sample.supportClass === "native-supported") {
    return ["visualSimilarity", "editableAreaRatio", "rasterAreaRatio"];
  }
  return ["visualSimilarity"];
}

function validateStage(
  label: string,
  stage: W2fNode31MeasurementStageEvidence,
  failures: string[],
  unavailable: string[],
): void {
  if (stage.status === "FAIL") {
    failures.push(`${label} failed${stage.reason?.trim() ? `: ${stage.reason}` : ""}`);
    return;
  }
  if (stage.status === "UNAVAILABLE") {
    unavailable.push(
      `${label} is unavailable${stage.reason?.trim() ? `: ${stage.reason}` : ""}`,
    );
    return;
  }
  if (!stage.artifact?.trim()) failures.push(`${label} PASS requires an artifact`);
  if (!stage.sha256 || !SHA256_PATTERN.test(stage.sha256)) {
    failures.push(`${label} PASS requires a lowercase SHA-256`);
  }
}

function metricValue(
  artifact: W2fNode31MeasurementArtifact,
  id: W2fNode31MeasurementMetricId,
  failures: string[],
  unavailable: string[],
): number | undefined {
  const evidence = artifact.metrics[id];
  if (!evidence) {
    unavailable.push(`${id} evidence is missing`);
    return undefined;
  }
  if (evidence.status === "UNAVAILABLE") {
    unavailable.push(`${id} is unavailable: ${evidence.reason}`);
    return undefined;
  }
  if (!Number.isFinite(evidence.value) || evidence.value < 0 || evidence.value > 1) {
    failures.push(`${id} must be a normalized finite value between 0 and 1`);
    return undefined;
  }
  const requiredMethod = W2F_NODE31_MEASUREMENT_METHODS[id];
  if (evidence.method !== requiredMethod) {
    failures.push(`${id} must use measurement method ${requiredMethod}`);
  }
  if (!evidence.referenceArtifact.trim()) failures.push(`${id} requires a reference artifact`);
  if (!evidence.observedArtifact.trim()) failures.push(`${id} requires an observed artifact`);
  return evidence.value;
}

export function evaluateNode31MeasurementArtifact(
  artifact: W2fNode31MeasurementArtifact,
): W2fNode31MeasurementArtifactReport {
  const failures: string[] = [];
  const unavailable: string[] = [];

  if (artifact.version !== W2F_NODE31_MEASUREMENT_ARTIFACT_VERSION) {
    failures.push(`unsupported measurement artifact version ${artifact.version}`);
  }
  if (artifact.evidenceType !== "node31-fidelity-measurement") {
    failures.push("measurement artifact evidenceType mismatch");
  }
  if (!artifact.sample.id.trim()) failures.push("sample id is required");
  if (!artifact.sample.category.trim()) failures.push("sample category is required");
  if (!artifact.sample.sourceArtifact.trim()) failures.push("sample sourceArtifact is required");
  if (!SHA256_PATTERN.test(artifact.sample.sourceSha256)) {
    failures.push("sample sourceSha256 must be a lowercase SHA-256");
  }
  if (!COMMIT_PATTERN.test(artifact.provenance.branchHead)) {
    failures.push("provenance branchHead must be a 40-character lowercase commit SHA");
  }
  if (!artifact.provenance.environmentFingerprint.trim()) {
    failures.push("provenance environmentFingerprint is required");
  }
  if (Number.isNaN(Date.parse(artifact.provenance.generatedAt))) {
    failures.push("provenance generatedAt must be an ISO-compatible timestamp");
  }
  if (
    artifact.provenance.ciRunId !== undefined &&
    (!Number.isSafeInteger(artifact.provenance.ciRunId) || artifact.provenance.ciRunId <= 0)
  ) {
    failures.push("provenance ciRunId must be a positive safe integer when supplied");
  }

  validateStage("browserCapture", artifact.pipeline.browserCapture, failures, unavailable);
  validateStage("wtfPackage", artifact.pipeline.wtfPackage, failures, unavailable);
  validateStage("secureParse", artifact.pipeline.secureParse, failures, unavailable);
  validateStage("figmaRender", artifact.pipeline.figmaRender, failures, unavailable);
  validateStage("figmaExport", artifact.pipeline.figmaExport, failures, unavailable);

  if (artifact.pipeline.figmaRender.host.kind !== "figma-desktop") {
    unavailable.push(
      `release fidelity measurement requires figma-desktop host; observed ${artifact.pipeline.figmaRender.host.kind}`,
    );
  } else if (!artifact.pipeline.figmaRender.host.evidenceArtifact?.trim()) {
    failures.push("figma-desktop render evidence requires host.evidenceArtifact");
  }

  if (artifact.antiCheatingViolations.length > 0) {
    failures.push(`anti-cheating violations: ${artifact.antiCheatingViolations.join("; ")}`);
  }

  const measuredValues = new Map<W2fNode31MeasurementMetricId, number>();
  for (const id of requiredMetricIds(artifact)) {
    const value = metricValue(artifact, id, failures, unavailable);
    if (value !== undefined) measuredValues.set(id, value);
  }

  const status: W2fNode31Status =
    failures.length > 0 ? "FAIL" : unavailable.length > 0 ? "UNAVAILABLE" : "PASS";
  const releaseEligible = status === "PASS";

  let corpusSample: W2fNode31CorpusSample | undefined;
  if (releaseEligible) {
    const sample: W2fNode31CorpusSample = {
      id: artifact.sample.id,
      testClass: artifact.sample.testClass,
      category: artifact.sample.category,
      supportClass: artifact.sample.supportClass,
      standardHtmlCss: artifact.sample.standardHtmlCss,
      behaviorStatus: "PASS",
      antiCheatingViolations: [],
    };
    if (artifact.sample.level !== undefined) sample.level = artifact.sample.level;

    const visualSimilarity = measuredValues.get("visualSimilarity");
    if (visualSimilarity !== undefined) sample.visualSimilarity = visualSimilarity;
    const geometryFidelity = measuredValues.get("geometryFidelity");
    if (geometryFidelity !== undefined) sample.geometryFidelity = geometryFidelity;
    const textFidelity = measuredValues.get("textFidelity");
    if (textFidelity !== undefined) sample.textFidelity = textFidelity;
    const assetFidelity = measuredValues.get("assetFidelity");
    if (assetFidelity !== undefined) sample.assetFidelity = assetFidelity;
    const structureFidelity = measuredValues.get("structureFidelity");
    if (structureFidelity !== undefined) sample.structureFidelity = structureFidelity;
    const editableAreaRatio = measuredValues.get("editableAreaRatio");
    if (editableAreaRatio !== undefined) sample.editableAreaRatio = editableAreaRatio;
    const responsiveFidelity = measuredValues.get("responsiveFidelity");
    if (responsiveFidelity !== undefined) sample.responsiveFidelity = responsiveFidelity;
    const rasterAreaRatio = measuredValues.get("rasterAreaRatio");
    if (rasterAreaRatio !== undefined) sample.rasterAreaRatio = rasterAreaRatio;

    corpusSample = sample;
  }

  return {
    version: W2F_NODE31_MEASUREMENT_ARTIFACT_VERSION,
    status,
    releaseEligible,
    sampleId: artifact.sample.id,
    ...(corpusSample === undefined ? {} : { corpusSample }),
    failures,
    unavailable,
  };
}
