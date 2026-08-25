import {
  W2F_NODE30_QA_VERSION,
  type W2fNode30QaStatus,
  type W2fPerformanceQaReport,
  type W2fPerformanceQaSampleResult,
  type W2fPerformanceSample,
  type W2fPerformanceScaleBand,
} from "./node30-types.js";

export function performanceScaleBand(renderNodeCount: number): W2fPerformanceScaleBand {
  if (renderNodeCount < 2_000) return "lt-2k";
  if (renderNodeCount < 5_000) return "2k-5k";
  if (renderNodeCount < 10_000) return "5k-10k";
  if (renderNodeCount < 20_000) return "10k-20k";
  if (renderNodeCount < 50_000) return "20k-50k";
  return "gt-50k";
}

function percentile(values: readonly number[], probability: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1));
  return sorted[index] ?? null;
}

function sampleResult(sample: W2fPerformanceSample): W2fPerformanceQaSampleResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const band = performanceScaleBand(sample.renderNodeCount);

  if (!sample.benchmarkEnvironment.trim()) {
    failures.push("benchmarkEnvironment must be non-empty");
  }
  if (!Number.isSafeInteger(sample.renderNodeCount) || sample.renderNodeCount < 0) {
    failures.push("renderNodeCount must be a non-negative safe integer");
  }
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
    failures.push("durationMs must be a finite non-negative number");
  }

  if (sample.renderNodeCount < 20_000 && (sample.crashed || !sample.completed)) {
    failures.push(`${band} benchmark must complete without a fatal crash`);
  }

  if (band === "5k-10k" && !sample.chunkingSupported && !sample.progressSupported) {
    failures.push("5k-10k path must be chunking- or progress-capable");
  }

  if (band === "10k-20k" && sample.completed && !sample.crashed) {
    if (!sample.chunkingSupported && !sample.progressSupported) {
      warnings.push("10k-20k completed, but chunking/progress capability was not observed");
    }
  }

  if (band === "20k-50k") {
    if (!sample.userWarningShown) failures.push("20k-50k path must show a user warning");
    if (!sample.sectionOrSimplifiedStrategyOffered) {
      failures.push("20k-50k path must recommend section or simplified import");
    }
  }

  if (band === "gt-50k") {
    if (!sample.explicitConfirmationObtained && !sample.sectionOrSimplifiedStrategyOffered) {
      failures.push(">50k path requires explicit confirmation or a section/simplified strategy");
    }
  }

  const status: W2fNode30QaStatus =
    failures.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS";
  return { id: sample.id, band, status, failures, warnings };
}

export function evaluatePerformanceQa(
  samples: readonly W2fPerformanceSample[],
): W2fPerformanceQaReport {
  const sampleResults = samples.map(sampleResult);
  const failures = sampleResults.flatMap((result) =>
    result.failures.map((failure) => `${result.id}: ${failure}`),
  );
  const warnings = sampleResults.flatMap((result) =>
    result.warnings.map((warning) => `${result.id}: ${warning}`),
  );
  const benchmarkEnvironment = samples[0]?.benchmarkEnvironment.trim() || null;
  const environments = new Set(
    samples.map((sample) => sample.benchmarkEnvironment.trim()).filter((value) => value.length > 0),
  );
  if (environments.size > 1) {
    failures.push("Performance samples must use one declared benchmark environment");
  }
  const durations = samples
    .filter((sample) => Number.isFinite(sample.durationMs) && sample.durationMs >= 0)
    .map((sample) => sample.durationMs);

  const status: W2fNode30QaStatus =
    samples.length === 0
      ? "UNAVAILABLE"
      : failures.length > 0
        ? "FAIL"
        : warnings.length > 0
          ? "WARNING"
          : "PASS";

  return {
    version: W2F_NODE30_QA_VERSION,
    status,
    benchmarkEnvironment,
    sampleResults,
    medianDurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    calibratedHardBudgetMs: null,
    failures,
    warnings:
      samples.length === 0 ? ["No performance samples were available", ...warnings] : warnings,
  };
}
