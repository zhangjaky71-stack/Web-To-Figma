import { buildNode31CompatibilityMatrix } from "./compatibility.js";
import {
  W2F_NODE31_RC_VERSION,
  W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES,
  W2F_NODE31_REQUIRED_SECURITY_FIXTURES,
  W2F_NODE31_THRESHOLDS,
  type W2fNode31CorpusSample,
  type W2fNode31GateResult,
  type W2fNode31ReleaseCandidateInput,
  type W2fNode31ReleaseCandidateReport,
  type W2fNode31Status,
} from "./node31-types.js";

type MetricExtractor = (sample: W2fNode31CorpusSample) => number | undefined;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function unavailableGate(
  id: string,
  detail: string,
  target?: number | string,
): W2fNode31GateResult {
  return {
    id,
    status: "UNAVAILABLE",
    detail,
    ...(target === undefined ? {} : { target }),
  };
}

function metricValues(
  samples: readonly W2fNode31CorpusSample[],
  extractor: MetricExtractor,
): { values: number[]; invalidSampleIds: string[]; missingSampleIds: string[] } {
  const values: number[] = [];
  const invalidSampleIds: string[] = [];
  const missingSampleIds: string[] = [];
  for (const sample of samples) {
    const value = extractor(sample);
    if (value === undefined) {
      missingSampleIds.push(sample.id);
      continue;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      invalidSampleIds.push(sample.id);
      continue;
    }
    values.push(value);
  }
  return { values, invalidSampleIds, missingSampleIds };
}

function missingMetricGate(
  id: string,
  samples: readonly W2fNode31CorpusSample[],
  missingSampleIds: readonly string[],
  target: number,
): W2fNode31GateResult | null {
  if (samples.length === 0) {
    return unavailableGate(id, "Required metric evidence is missing", target);
  }
  if (missingSampleIds.length > 0) {
    return unavailableGate(
      id,
      `Required metric evidence is missing for samples: ${missingSampleIds.join(", ")}`,
      target,
    );
  }
  return null;
}

function allAtLeastGate(
  id: string,
  samples: readonly W2fNode31CorpusSample[],
  extractor: MetricExtractor,
  target: number,
): W2fNode31GateResult {
  const { values, invalidSampleIds, missingSampleIds } = metricValues(samples, extractor);
  if (invalidSampleIds.length > 0) {
    return {
      id,
      status: "FAIL",
      detail: `Invalid normalized evidence in samples: ${invalidSampleIds.join(", ")}`,
      target,
    };
  }
  const missing = missingMetricGate(id, samples, missingSampleIds, target);
  if (missing) return missing;
  const observed = Math.min(...values);
  return {
    id,
    status: observed >= target ? "PASS" : "FAIL",
    detail:
      observed >= target
        ? `All ${values.length} applicable samples meet the target`
        : `At least one applicable sample is below the target`,
    observed,
    target,
  };
}

function medianAtLeastGate(
  id: string,
  samples: readonly W2fNode31CorpusSample[],
  extractor: MetricExtractor,
  target: number,
): W2fNode31GateResult {
  const { values, invalidSampleIds, missingSampleIds } = metricValues(samples, extractor);
  if (invalidSampleIds.length > 0) {
    return {
      id,
      status: "FAIL",
      detail: `Invalid normalized evidence in samples: ${invalidSampleIds.join(", ")}`,
      target,
    };
  }
  const missing = missingMetricGate(id, samples, missingSampleIds, target);
  if (missing) return missing;
  const observed = median(values);
  if (observed === null) return unavailableGate(id, "Required median evidence is missing", target);
  return {
    id,
    status: observed >= target ? "PASS" : "FAIL",
    detail: `Median across ${values.length} applicable samples`,
    observed,
    target,
  };
}

function medianAtMostGate(
  id: string,
  samples: readonly W2fNode31CorpusSample[],
  extractor: MetricExtractor,
  target: number,
): W2fNode31GateResult {
  const { values, invalidSampleIds, missingSampleIds } = metricValues(samples, extractor);
  if (invalidSampleIds.length > 0) {
    return {
      id,
      status: "FAIL",
      detail: `Invalid normalized evidence in samples: ${invalidSampleIds.join(", ")}`,
      target,
    };
  }
  const missing = missingMetricGate(id, samples, missingSampleIds, target);
  if (missing) return missing;
  const observed = median(values);
  if (observed === null) return unavailableGate(id, "Required median evidence is missing", target);
  return {
    id,
    status: observed <= target ? "PASS" : "FAIL",
    detail: `Median across ${values.length} applicable samples`,
    observed,
    target,
  };
}

function p0Gate(input: W2fNode31ReleaseCandidateInput): W2fNode31GateResult {
  if (input.p0Items.length === 0)
    return unavailableGate("p0-functional", "P0 checklist evidence is missing");
  const invalid = input.p0Items.filter(
    (item) =>
      item.disposition === "missing" ||
      (item.disposition === "approved-adr" && !item.adrId?.trim()),
  );
  return {
    id: "p0-functional",
    status: invalid.length === 0 ? "PASS" : "FAIL",
    detail:
      invalid.length === 0
        ? `${input.p0Items.length} P0 items are complete or moved by approved ADR`
        : `Incomplete/unapproved P0 items: ${invalid.map((item) => item.id).join(", ")}`,
  };
}

function antiCheatingGate(corpus: readonly W2fNode31CorpusSample[]): W2fNode31GateResult {
  if (corpus.length === 0) return unavailableGate("anti-cheating", "Corpus evidence is missing");
  const violations = corpus.flatMap((sample) =>
    (sample.antiCheatingViolations ?? []).map((violation) => `${sample.id}: ${violation}`),
  );
  return {
    id: "anti-cheating",
    status: violations.length === 0 ? "PASS" : "FAIL",
    detail:
      violations.length === 0 ? "No anti-cheating violations reported" : violations.join("; "),
  };
}

function severeVisualRegressionGate(corpus: readonly W2fNode31CorpusSample[]): W2fNode31GateResult {
  const severe = corpus.filter((sample) => sample.severeLocalRegression);
  return {
    id: "severe-local-visual-regression",
    status: severe.length === 0 ? "PASS" : "FAIL",
    detail:
      severe.length === 0
        ? "No severe local visual regression reported"
        : `Severe local regressions: ${severe.map((sample) => sample.id).join(", ")}`,
  };
}

function securityGate(input: W2fNode31ReleaseCandidateInput): W2fNode31GateResult {
  const failures: string[] = [];
  if (
    !Number.isSafeInteger(input.security.knownCriticalBlockers) ||
    input.security.knownCriticalBlockers < 0 ||
    !Number.isSafeInteger(input.security.knownHighBlockers) ||
    input.security.knownHighBlockers < 0
  ) {
    failures.push("security blocker counts must be non-negative safe integers");
  }
  if (input.security.knownCriticalBlockers > 0 || input.security.knownHighBlockers > 0) {
    failures.push(
      `known blockers critical=${input.security.knownCriticalBlockers} high=${input.security.knownHighBlockers}`,
    );
  }
  const byId = new Map(input.security.fixtures.map((fixture) => [fixture.id, fixture.status]));
  for (const id of W2F_NODE31_REQUIRED_SECURITY_FIXTURES) {
    const status = byId.get(id);
    if (!status) failures.push(`missing security fixture ${id}`);
    else if (status !== "PASS") failures.push(`security fixture ${id} is ${status}`);
  }
  return {
    id: "security",
    status: failures.length === 0 ? "PASS" : "FAIL",
    detail:
      failures.length === 0
        ? "Zero known critical/high blockers and all required fixtures pass"
        : failures.join("; "),
    observed: `${input.security.knownCriticalBlockers} critical / ${input.security.knownHighBlockers} high`,
    target: "0 critical / 0 high",
  };
}

function schemaCompatibilityGate(input: W2fNode31ReleaseCandidateInput): W2fNode31GateResult {
  const failures: string[] = [];
  const byId = new Map(input.schemaCompatibility.map((entry) => [entry.id, entry.status]));
  for (const id of W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES) {
    const status = byId.get(id);
    if (!status) failures.push(`missing schema/version compatibility case ${id}`);
    else if (status !== "PASS")
      failures.push(`schema/version compatibility case ${id} is ${status}`);
  }
  return {
    id: "wtf-schema-version-compatibility",
    status: failures.length === 0 ? "PASS" : "FAIL",
    detail:
      failures.length === 0
        ? "All required schema/version compatibility cases pass"
        : failures.join("; "),
  };
}

function knownLimitationsGate(input: W2fNode31ReleaseCandidateInput): W2fNode31GateResult {
  const evidence = input.knownLimitations;
  const failures: string[] = [];
  if (!evidence.documentCurrent) failures.push("docs/KNOWN_LIMITATIONS.md is not current");
  for (const [label, count] of [
    ["undocumented limitations", evidence.undocumentedLimitations],
    ["silent support claims", evidence.silentSupportClaims],
    ["P0 contradictions", evidence.p0Contradictions],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0) failures.push(`${label} count is invalid`);
    else if (count > 0) failures.push(`${label}=${count}`);
  }
  return {
    id: "known-limitations",
    status: failures.length === 0 ? "PASS" : "FAIL",
    detail:
      failures.length === 0
        ? "Known limitations are current and compatible with the P0 contract"
        : failures.join("; "),
  };
}

function requiredStatusGate(
  id: string,
  status: W2fNode31Status,
  allowWarning: boolean,
): W2fNode31GateResult {
  if (status === "UNAVAILABLE") return unavailableGate(id, `${id} evidence is unavailable`);
  const passes = status === "PASS" || (allowWarning && status === "WARNING");
  return {
    id,
    status: passes ? status : "FAIL",
    detail: passes
      ? `${id} gate is ${status}`
      : `${id} gate requires ${allowWarning ? "PASS/WARNING" : "PASS"}; observed ${status}`,
  };
}

export function evaluateNode31ReleaseCandidate(
  input: W2fNode31ReleaseCandidateInput,
): W2fNode31ReleaseCandidateReport {
  const deterministicLevel12 = input.corpus.filter(
    (sample) =>
      sample.testClass === "A" &&
      (sample.level === 1 || sample.level === 2) &&
      sample.supportClass !== "unsupported-blocked",
  );
  const deterministicSupported = input.corpus.filter(
    (sample) => sample.testClass === "A" && sample.supportClass !== "unsupported-blocked",
  );
  const realisticSupported = input.corpus.filter(
    (sample) => sample.testClass === "B" && sample.supportClass !== "unsupported-blocked",
  );
  const realisticStandardNative = input.corpus.filter(
    (sample) =>
      sample.testClass === "B" &&
      sample.standardHtmlCss &&
      sample.supportClass === "native-supported",
  );

  const compatibilityMatrix = buildNode31CompatibilityMatrix(input.corpus);
  const gates: W2fNode31GateResult[] = [
    p0Gate(input),
    allAtLeastGate(
      "deterministic-visual",
      deterministicLevel12,
      (sample) => sample.visualSimilarity,
      W2F_NODE31_THRESHOLDS.deterministicVisualSimilarity,
    ),
    medianAtLeastGate(
      "realistic-visual-median",
      realisticSupported,
      (sample) => sample.visualSimilarity,
      W2F_NODE31_THRESHOLDS.realisticVisualMedian,
    ),
    severeVisualRegressionGate(input.corpus),
    allAtLeastGate(
      "geometry",
      deterministicSupported,
      (sample) => sample.geometryFidelity,
      W2F_NODE31_THRESHOLDS.geometryFidelity,
    ),
    allAtLeastGate(
      "text",
      deterministicSupported,
      (sample) => sample.textFidelity,
      W2F_NODE31_THRESHOLDS.textFidelity,
    ),
    allAtLeastGate(
      "assets",
      deterministicSupported,
      (sample) => sample.assetFidelity,
      W2F_NODE31_THRESHOLDS.assetFidelity,
    ),
    allAtLeastGate(
      "structure",
      deterministicSupported,
      (sample) => sample.structureFidelity,
      W2F_NODE31_THRESHOLDS.structureFidelity,
    ),
    medianAtLeastGate(
      "editable-area-median",
      realisticStandardNative,
      (sample) => sample.editableAreaRatio,
      W2F_NODE31_THRESHOLDS.editableAreaMedian,
    ),
    allAtLeastGate(
      "responsive",
      deterministicSupported,
      (sample) => sample.responsiveFidelity,
      W2F_NODE31_THRESHOLDS.responsiveFidelity,
    ),
    medianAtMostGate(
      "raster-area-median",
      realisticStandardNative,
      (sample) => sample.rasterAreaRatio,
      W2F_NODE31_THRESHOLDS.rasterAreaMedianMax,
    ),
    antiCheatingGate(input.corpus),
    requiredStatusGate("determinism", input.determinismStatus, false),
    securityGate(input),
    requiredStatusGate("scale", input.scaleStatus, true),
    {
      id: "compatibility-matrix",
      status: compatibilityMatrix.status,
      detail:
        compatibilityMatrix.failures.length === 0
          ? `${compatibilityMatrix.rows.length} compatibility rows generated`
          : compatibilityMatrix.failures.join("; "),
    },
    knownLimitationsGate(input),
    schemaCompatibilityGate(input),
  ];

  const failures = gates
    .filter((gate) => gate.status === "FAIL")
    .map((gate) => `${gate.id}: ${gate.detail}`);
  const unavailable = gates
    .filter((gate) => gate.status === "UNAVAILABLE")
    .map((gate) => `${gate.id}: ${gate.detail}`);
  const warnings = [
    ...gates
      .filter((gate) => gate.status === "WARNING")
      .map((gate) => `${gate.id}: ${gate.detail}`),
    ...compatibilityMatrix.warnings,
  ];
  const releaseReady = failures.length === 0 && unavailable.length === 0;
  const status: W2fNode31Status =
    failures.length > 0
      ? "FAIL"
      : unavailable.length > 0
        ? "UNAVAILABLE"
        : warnings.length > 0
          ? "WARNING"
          : "PASS";

  return {
    version: W2F_NODE31_RC_VERSION,
    status,
    releaseReady,
    gates,
    compatibilityMatrix,
    failures: [...failures, ...unavailable],
    warnings,
  };
}
