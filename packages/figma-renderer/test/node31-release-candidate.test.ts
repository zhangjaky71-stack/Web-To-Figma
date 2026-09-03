import { describe, expect, it } from "vitest";
import {
  W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES,
  W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES,
  W2F_NODE31_REQUIRED_SECURITY_FIXTURES,
  buildNode31CompatibilityMatrix,
  evaluateNode31ReleaseCandidate,
  type W2fNode31CorpusSample,
  type W2fNode31ReleaseCandidateInput,
} from "../src/qa/index.js";

function deterministicSample(id: string): W2fNode31CorpusSample {
  return {
    id,
    testClass: "A",
    category: "deterministic-standard",
    supportClass: "native-supported",
    standardHtmlCss: true,
    level: 1,
    behaviorStatus: "PASS",
    visualSimilarity: 0.995,
    geometryFidelity: 0.99,
    textFidelity: 0.98,
    assetFidelity: 1,
    structureFidelity: 0.97,
    responsiveFidelity: 0.95,
    rasterAreaRatio: 0,
    antiCheatingViolations: [],
  };
}

function realisticCorpus(): W2fNode31CorpusSample[] {
  return W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.map((category, index) => {
    const expectedFallback = category === "canvas" || category === "webgl";
    return {
      id: `realistic-${category}`,
      testClass: "B" as const,
      category,
      supportClass: expectedFallback
        ? ("expected-fallback" as const)
        : ("native-supported" as const),
      standardHtmlCss: !expectedFallback,
      behaviorStatus: "PASS" as const,
      ...(expectedFallback
        ? { fallbackOrDiagnostic: `${category} uses documented minimal local raster fallback` }
        : {}),
      visualSimilarity: 0.96 + (index % 2) * 0.01,
      ...(!expectedFallback ? { editableAreaRatio: 0.94, rasterAreaRatio: 0.08 } : {}),
      antiCheatingViolations: [],
    };
  });
}

function passingInput(): W2fNode31ReleaseCandidateInput {
  return {
    p0Items: [
      { id: "full-page", disposition: "complete" },
      { id: "region", disposition: "complete" },
      { id: "import", disposition: "complete" },
    ],
    corpus: [deterministicSample("deterministic-main"), ...realisticCorpus()],
    determinismStatus: "PASS",
    scaleStatus: "PASS",
    security: {
      knownCriticalBlockers: 0,
      knownHighBlockers: 0,
      fixtures: W2F_NODE31_REQUIRED_SECURITY_FIXTURES.map((id) => ({
        id,
        status: "PASS" as const,
      })),
    },
    schemaCompatibility: W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES.map((id) => ({
      id,
      status: "PASS" as const,
    })),
    knownLimitations: {
      documentCurrent: true,
      undocumentedLimitations: 0,
      silentSupportClaims: 0,
      p0Contradictions: 0,
    },
  };
}

describe("NODE-31 Release Candidate evaluator", () => {
  it("passes only when every frozen release gate has evidence and the compatibility matrix is complete", () => {
    const report = evaluateNode31ReleaseCandidate(passingInput());
    expect(report.status).toBe("PASS");
    expect(report.releaseReady).toBe(true);
    expect(report.compatibilityMatrix.missingRealisticCategories).toEqual([]);
    expect(report.gates.find((gate) => gate.id === "deterministic-visual")?.target).toBe(0.99);
    expect(report.gates.find((gate) => gate.id === "realistic-visual-median")?.target).toBe(0.95);
    expect(report.gates.find((gate) => gate.id === "editable-area-median")?.target).toBe(0.9);
    expect(report.gates.find((gate) => gate.id === "raster-area-median")?.target).toBe(0.15);
  });

  it("does not let missing required realistic corpus categories disappear from the compatibility matrix", () => {
    const input = passingInput();
    input.corpus = input.corpus.filter((sample) => sample.category !== "ecommerce");
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.releaseReady).toBe(false);
    expect(report.status).toBe("FAIL");
    expect(report.compatibilityMatrix.missingRealisticCategories).toContain("ecommerce");
  });

  it("keeps expected fallback out of standard HTML/CSS editable and raster medians", () => {
    const input = passingInput();
    input.corpus = input.corpus.map((sample) =>
      sample.category === "webgl"
        ? { ...sample, editableAreaRatio: 0, rasterAreaRatio: 1, visualSimilarity: 0.97 }
        : sample,
    );
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.releaseReady).toBe(true);
    expect(report.gates.find((gate) => gate.id === "editable-area-median")?.observed).toBe(0.94);
    expect(report.gates.find((gate) => gate.id === "raster-area-median")?.observed).toBe(0.08);
  });

  it("fails undocumented fallback and anti-cheating violations instead of improving scores with rasterization", () => {
    const input = passingInput();
    input.corpus = input.corpus.map((sample) => {
      if (sample.category === "canvas") {
        const copy = { ...sample };
        delete copy.fallbackOrDiagnostic;
        return { ...copy, antiCheatingViolations: ["ordinary text replaced by a page screenshot"] };
      }
      return sample;
    });
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.status).toBe("FAIL");
    expect(report.releaseReady).toBe(false);
    expect(report.failures.join("\n")).toContain("documented fallback/diagnostic");
    expect(report.failures.join("\n")).toContain("ordinary text replaced by a page screenshot");
  });

  it("treats missing required metric evidence as UNAVAILABLE rather than PASS", () => {
    const input = passingInput();
    input.corpus = input.corpus.map((sample) => {
      if (sample.testClass !== "A") return sample;
      const copy = { ...sample };
      delete copy.textFidelity;
      return copy;
    });
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.releaseReady).toBe(false);
    expect(report.failures.join("\n")).toContain("text: Required metric evidence is missing");
  });

  it("does not silently skip one deterministic sample with missing metric evidence", () => {
    const input = passingInput();
    input.corpus = [deterministicSample("deterministic-secondary"), ...input.corpus].map(
      (sample) => {
        if (sample.id !== "deterministic-secondary") return sample;
        const copy = { ...sample };
        delete copy.textFidelity;
        return copy;
      },
    );
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.releaseReady).toBe(false);
    expect(report.failures.join("\n")).toContain(
      "text: Required metric evidence is missing for samples: deterministic-secondary",
    );
  });

  it("requires complete native Class B editable and raster evidence before computing medians", () => {
    const input = passingInput();
    input.corpus = input.corpus.map((sample) => {
      if (sample.category !== "ecommerce") return sample;
      const copy = { ...sample };
      delete copy.editableAreaRatio;
      delete copy.rasterAreaRatio;
      return copy;
    });
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.releaseReady).toBe(false);
    const failures = report.failures.join("\n");
    expect(failures).toContain(
      "editable-area-median: Required metric evidence is missing for samples: realistic-ecommerce",
    );
    expect(failures).toContain(
      "raster-area-median: Required metric evidence is missing for samples: realistic-ecommerce",
    );
  });

  it("keeps Class C live-site drift as a warning signal rather than the sole regression baseline", () => {
    const input = passingInput();
    input.corpus = [
      ...input.corpus,
      {
        id: "live-smoke",
        testClass: "C",
        category: "live-public-site",
        supportClass: "native-supported",
        standardHtmlCss: true,
        behaviorStatus: "FAIL",
      },
    ];
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.releaseReady).toBe(true);
    expect(report.status).toBe("WARNING");
    expect(report.warnings.join("\n")).toContain("Class C is not the sole regression baseline");
  });

  it("blocks release on security, schema/version, determinism, P0, or known-limitations failures", () => {
    const input = passingInput();
    input.p0Items = [{ id: "full-page", disposition: "missing" }];
    input.determinismStatus = "FAIL";
    input.security = { ...input.security, knownHighBlockers: 1 };
    input.schemaCompatibility = input.schemaCompatibility.filter(
      (entry) => entry.id !== "min-reader-enforced",
    );
    input.knownLimitations = { ...input.knownLimitations, silentSupportClaims: 1 };
    const report = evaluateNode31ReleaseCandidate(input);
    expect(report.releaseReady).toBe(false);
    expect(report.status).toBe("FAIL");
    const failures = report.failures.join("\n");
    expect(failures).toContain("p0-functional");
    expect(failures).toContain("determinism");
    expect(failures).toContain("security");
    expect(failures).toContain("min-reader-enforced");
    expect(failures).toContain("silent support claims=1");
  });
});

describe("NODE-31 compatibility matrix", () => {
  it("requires documented fallback/diagnostic evidence for non-native Class B rows", () => {
    const corpus = realisticCorpus();
    const matrix = buildNode31CompatibilityMatrix(
      corpus.map((sample) => {
        if (sample.category !== "webgl") return sample;
        const copy = { ...sample };
        delete copy.fallbackOrDiagnostic;
        return copy;
      }),
    );
    expect(matrix.status).toBe("FAIL");
    expect(matrix.failures.join("\n")).toContain("webgl");
  });
});
