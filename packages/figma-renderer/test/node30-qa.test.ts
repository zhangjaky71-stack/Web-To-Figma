import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  deterministicHash,
  evaluateDeterminismQa,
  evaluatePerformanceQa,
  evaluateResponsiveQa,
  performanceScaleBand,
  type W2fDeterminismRunInput,
  type W2fPerformanceSample,
} from "../src/qa/index.js";

const BENCHMARK_ENVIRONMENT = "ubuntu-24-node-24-node30-v1";

function deterministicRun(
  index: number,
  overrides: Partial<W2fDeterminismRunInput> = {},
): W2fDeterminismRunInput {
  return {
    runId: `run-${index}`,
    environmentFingerprint: BENCHMARK_ENVIRONMENT,
    assetHashes: ["asset-b", "asset-a"],
    sourceGraph: {
      revision: {
        documentId: "doc",
        captureId: `capture-${index}`,
        revisionId: `revision-${index}`,
        parentRevisionId: `parent-${index}`,
        sourceFingerprint: "source",
        capturedAt: `2026-08-25T00:00:${String(index).padStart(2, "0")}.000Z`,
      },
      nodes: [{ id: "stable", value: 1 }],
    },
    renderTree: { rootId: "root", nodes: [{ id: "root", decision: "native" }] },
    stableIdentityIds: ["stable-b", "stable-a"],
    layoutDecisions: { root: { mode: "flex", reasons: ["fixture"] } },
    ...overrides,
  };
}

function performanceSample(
  id: string,
  renderNodeCount: number,
  overrides: Partial<W2fPerformanceSample> = {},
): W2fPerformanceSample {
  return {
    id,
    benchmarkEnvironment: BENCHMARK_ENVIRONMENT,
    renderNodeCount,
    durationMs: renderNodeCount / 10,
    completed: true,
    crashed: false,
    chunkingSupported: true,
    progressSupported: true,
    userWarningShown: renderNodeCount >= 20_000,
    sectionOrSimplifiedStrategyOffered: renderNodeCount >= 20_000,
    explicitConfirmationObtained: renderNodeCount >= 50_000,
    ...overrides,
  };
}

describe("NODE-30 responsive QA", () => {
  it("passes a deterministic responsive fixture at or above the 90% composite contract", () => {
    const report = evaluateResponsiveQa({
      checks: [
        { id: "sizing", domain: "sizing", matched: 10, total: 10 },
        { id: "spacing", domain: "spacing", matched: 9, total: 10 },
        { id: "minmax", domain: "min-max", matched: 9, total: 10 },
        { id: "layout", domain: "layout", matched: 10, total: 10 },
        { id: "constraints", domain: "constraints", matched: 9, total: 10 },
        { id: "breakpoints", domain: "breakpoints", matched: 9, total: 10 },
      ],
      requiredDomains: [
        "sizing",
        "spacing",
        "min-max",
        "layout",
        "constraints",
        "breakpoints",
      ],
      structuralChanges: [
        {
          id: "mobile-grid-columns",
          expected: true,
          detected: true,
          executableInFigma: false,
          reportedWhenNotExecutable: true,
        },
      ],
    });
    expect(report.status).toBe("PASS");
    expect(report.compositeScore).toBeGreaterThanOrEqual(0.9);
  });

  it("uses equal active-domain weighting instead of an undeclared priority model", () => {
    const report = evaluateResponsiveQa({
      checks: [
        { id: "sizing", domain: "sizing", matched: 1, total: 1 },
        { id: "spacing", domain: "spacing", matched: 0, total: 1 },
      ],
    });
    expect(report.compositeScore).toBe(0.5);
    expect(report.status).toBe("FAIL");
  });

  it("fails when release-suite required domain evidence is missing", () => {
    const report = evaluateResponsiveQa({
      checks: [{ id: "sizing", domain: "sizing", matched: 1, total: 1 }],
      requiredDomains: ["sizing", "breakpoints"],
    });
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("breakpoints has no evidence");
  });

  it("fails an unreported structural breakpoint change even when Figma cannot execute it", () => {
    const report = evaluateResponsiveQa({
      checks: [{ id: "breakpoints", domain: "breakpoints", matched: 1, total: 1 }],
      structuralChanges: [
        {
          id: "direction-change",
          expected: true,
          detected: true,
          executableInFigma: false,
          reportedWhenNotExecutable: false,
        },
      ],
    });
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("detected but not reported");
  });
});

describe("NODE-30 deterministic canonicalization", () => {
  it("sorts object keys while preserving array order", () => {
    expect(canonicalJson({ b: 2, a: [2, 1] })).toBe('{"a":[2,1],"b":2}');
    expect(deterministicHash({ b: 2, a: 1 })).toBe(deterministicHash({ a: 1, b: 2 }));
  });

  it("passes ten identical semantic captures in one declared environment", () => {
    const report = evaluateDeterminismQa(
      Array.from({ length: 10 }, (_, index) => deterministicRun(index)),
    );
    expect(report.status).toBe("PASS");
    expect(report.environmentFingerprint).toBe(BENCHMARK_ENVIRONMENT);
    expect(new Set(report.fingerprints.map((entry) => entry.sourceGraphHash)).size).toBe(1);
    expect(new Set(report.fingerprints.map((entry) => entry.renderTreeHash)).size).toBe(1);
  });

  it("does not silently pass fewer than ten runs", () => {
    const report = evaluateDeterminismQa(
      Array.from({ length: 9 }, (_, index) => deterministicRun(index)),
    );
    expect(report.status).toBe("UNAVAILABLE");
  });

  it("fails when one repeat run comes from a different environment", () => {
    const runs = Array.from({ length: 10 }, (_, index) =>
      deterministicRun(index, {
        environmentFingerprint: index === 9 ? "different-environment" : BENCHMARK_ENVIRONMENT,
      }),
    );
    const report = evaluateDeterminismQa(runs);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("different environment fingerprint");
  });

  it("fails when layout decisions randomly change", () => {
    const runs = Array.from({ length: 10 }, (_, index) =>
      deterministicRun(index, {
        layoutDecisions: {
          root: { mode: index === 9 ? "grid" : "flex", reasons: ["fixture"] },
        },
      }),
    );
    const report = evaluateDeterminismQa(runs);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("layoutDecisionHash");
  });
});

describe("NODE-30 performance scale QA", () => {
  it("classifies the frozen scale bands", () => {
    expect(performanceScaleBand(1_999)).toBe("lt-2k");
    expect(performanceScaleBand(2_000)).toBe("2k-5k");
    expect(performanceScaleBand(5_000)).toBe("5k-10k");
    expect(performanceScaleBand(10_000)).toBe("10k-20k");
    expect(performanceScaleBand(20_000)).toBe("20k-50k");
    expect(performanceScaleBand(50_000)).toBe("gt-50k");
  });

  it("passes the frozen functional scale behavior without inventing a hard millisecond budget", () => {
    const report = evaluatePerformanceQa([
      performanceSample("small", 1_000),
      performanceSample("medium", 4_000),
      performanceSample("chunked", 8_000),
      performanceSample("large", 15_000),
      performanceSample("warn", 25_000),
      performanceSample("confirm", 55_000),
    ]);
    expect(report.status).toBe("PASS");
    expect(report.benchmarkEnvironment).toBe(BENCHMARK_ENVIRONMENT);
    expect(report.calibratedHardBudgetMs).toBeNull();
    expect(report.p95DurationMs).not.toBeNull();
  });

  it("fails performance aggregation across mixed benchmark environments", () => {
    const report = evaluatePerformanceQa([
      performanceSample("first", 1_000),
      performanceSample("second", 2_000, { benchmarkEnvironment: "different-environment" }),
    ]);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("one declared benchmark environment");
  });

  it("fails a crashing 10k benchmark and missing large-page safeguards", () => {
    const report = evaluatePerformanceQa([
      performanceSample("10k-crash", 10_000, { completed: false, crashed: true }),
      performanceSample("25k-no-warning", 25_000, {
        userWarningShown: false,
        sectionOrSimplifiedStrategyOffered: false,
      }),
      performanceSample("55k-no-confirm", 55_000, {
        explicitConfirmationObtained: false,
        sectionOrSimplifiedStrategyOffered: false,
      }),
    ]);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("must complete without a fatal crash");
    expect(report.failures.join("\n")).toContain("must show a user warning");
    expect(report.failures.join("\n")).toContain("requires explicit confirmation");
  });
});
