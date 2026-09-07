import {
  W2F_NODE31_RC_VERSION,
  W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES,
  type W2fNode31CompatibilityMatrix,
  type W2fNode31CompatibilityMatrixRow,
  type W2fNode31CorpusSample,
  type W2fNode31Status,
} from "./node31-types.js";

function rowFromSample(sample: W2fNode31CorpusSample): W2fNode31CompatibilityMatrixRow {
  return {
    id: sample.id,
    testClass: sample.testClass,
    category: sample.category,
    supportClass: sample.supportClass,
    status: sample.behaviorStatus,
    ...(sample.fallbackOrDiagnostic ? { fallbackOrDiagnostic: sample.fallbackOrDiagnostic } : {}),
    ...(sample.knownLimitationId ? { knownLimitationId: sample.knownLimitationId } : {}),
  };
}

export function buildNode31CompatibilityMatrix(
  corpus: readonly W2fNode31CorpusSample[],
): W2fNode31CompatibilityMatrix {
  const rows = corpus.map(rowFromSample);
  const failures: string[] = [];
  const warnings: string[] = [];
  const realisticCategories = new Set(
    corpus.filter((sample) => sample.testClass === "B").map((sample) => sample.category),
  );
  const missingRealisticCategories = W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.filter(
    (category) => !realisticCategories.has(category),
  );

  for (const category of missingRealisticCategories) {
    failures.push(`Versioned realistic corpus is missing required category ${category}`);
  }

  for (const sample of corpus) {
    if (sample.testClass === "B") {
      if (sample.behaviorStatus === "FAIL" || sample.behaviorStatus === "UNAVAILABLE") {
        failures.push(`Realistic corpus sample ${sample.id} is ${sample.behaviorStatus}`);
      }
      if (sample.supportClass !== "native-supported" && !sample.fallbackOrDiagnostic?.trim()) {
        failures.push(
          `Realistic non-native sample ${sample.id} is missing a documented fallback/diagnostic`,
        );
      }
    }

    if (sample.testClass === "C") {
      if (sample.behaviorStatus === "FAIL" || sample.behaviorStatus === "UNAVAILABLE") {
        warnings.push(
          `Live compatibility signal ${sample.id} is ${sample.behaviorStatus}; Class C is not the sole regression baseline`,
        );
      } else if (sample.behaviorStatus === "WARNING") {
        warnings.push(`Live compatibility signal ${sample.id} reported a warning`);
      }
    }

    if (sample.p0Contradiction) {
      failures.push(`Compatibility sample ${sample.id} contradicts a P0 requirement`);
    }
  }

  let status: W2fNode31Status;
  if (corpus.length === 0) status = "UNAVAILABLE";
  else if (failures.length > 0) status = "FAIL";
  else if (warnings.length > 0) status = "WARNING";
  else status = "PASS";

  return {
    version: W2F_NODE31_RC_VERSION,
    status,
    rows,
    missingRealisticCategories,
    failures,
    warnings,
  };
}
