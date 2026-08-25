import { describe, expect, it } from "vitest";
import type { WtfAssetRecord, WtfRenderNode, WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";
import {
  createDeterminismRunFromIr,
  evaluateDeterminismQa,
  evaluateResponsiveQa,
  measurePerformanceBenchmark,
  responsiveChecksFromFixture,
} from "../src/qa/index.js";

const BENCHMARK_ENVIRONMENT = "ubuntu-24-node-24-node30-v1";

function renderNode(): WtfRenderNode {
  return {
    id: "root",
    childIds: [],
    sourceNodeIds: ["source-root"],
    sourceStableIds: ["stable-root"],
    kind: "container",
    name: "Root",
    geometry: { bounds: { x: 0, y: 0, width: 800, height: 600 } },
    layout: {
      mode: "flex",
      display: "flex",
      position: "static",
      sizing: {
        width: { mode: "fill", confidence: 1, reasons: ["fixture"] },
        height: { mode: "hug", confidence: 1, reasons: ["fixture"] },
      },
      flexContainer: {
        direction: "row",
        wrap: "nowrap",
        justifyContent: "start",
        alignItems: "center",
        rowGap: 0,
        columnGap: 16,
      },
      decision: { confidence: 1, reasons: ["fixture"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
  };
}

function sourceGraph(run: number): WtfSourceGraph {
  return {
    rootCaptureNodeId: "source-root",
    nodes: [
      {
        captureNodeId: "source-root",
        stableIdentity: { id: "stable-root", confidence: 1, evidence: ["fixture"] },
        kind: "element",
        relationships: {},
        childCaptureNodeIds: [],
      },
    ],
    scrollContainers: [],
    revision: {
      documentId: "doc",
      captureId: `capture-${run}`,
      revisionId: `revision-${run}`,
      sourceFingerprint: "source-fingerprint",
      capturedAt: `2026-08-25T00:00:${String(run).padStart(2, "0")}.000Z`,
    },
  };
}

function tree(): WtfRenderTree {
  return { rootId: "root", nodes: [renderNode()], sections: [] };
}

function assets(): WtfAssetRecord[] {
  return [
    {
      id: "asset-1",
      kind: "image",
      mediaType: "image/png",
      sha256: "a".repeat(64),
    },
  ];
}

describe("NODE-30 responsive fixture adapter", () => {
  it("derives property-level responsive checks across desktop and mobile viewports", () => {
    const expected = [
      {
        viewportId: "desktop",
        nodeId: "root",
        visible: true,
        horizontalSizing: "FILL" as const,
        verticalSizing: "HUG" as const,
        layoutMode: "HORIZONTAL" as const,
        columnGap: 16,
        paddingLeft: 24,
        containerQuerySignature: "container:min-width:700",
      },
      {
        viewportId: "mobile",
        nodeId: "root",
        visible: true,
        horizontalSizing: "FILL" as const,
        verticalSizing: "HUG" as const,
        layoutMode: "VERTICAL" as const,
        columnGap: 8,
        paddingLeft: 16,
        containerQuerySignature: "container:max-width:699",
      },
    ];
    const report = evaluateResponsiveQa(
      responsiveChecksFromFixture({ expected, observed: expected.map((state) => ({ ...state })) }),
    );
    expect(report.status).toBe("PASS");
    expect(report.compositeScore).toBe(1);
    expect(report.domainScores.breakpoints).toBe(1);
  });

  it("counts an incorrect breakpoint layout mode against the responsive score", () => {
    const expected = [
      {
        viewportId: "mobile",
        nodeId: "root",
        visible: true,
        layoutMode: "VERTICAL" as const,
      },
    ];
    const observed = [{ ...expected[0]!, layoutMode: "HORIZONTAL" as const }];
    const report = evaluateResponsiveQa(responsiveChecksFromFixture({ expected, observed }));
    expect(report.status).toBe("FAIL");
    expect(report.compositeScore).toBeLessThan(0.9);
  });
});

describe("NODE-30 IR determinism adapter", () => {
  it("builds ten comparable runs from real W2F IR and ignores only declared revision metadata", () => {
    const runs = Array.from({ length: 10 }, (_, index) =>
      createDeterminismRunFromIr({
        runId: `run-${index}`,
        environmentFingerprint: BENCHMARK_ENVIRONMENT,
        assets: assets(),
        sourceGraph: sourceGraph(index),
        renderTree: tree(),
        expectedStableCaptureNodeIds: ["source-root"],
      }),
    );
    const report = evaluateDeterminismQa(runs);
    expect(report.status).toBe("PASS");
    expect(report.environmentFingerprint).toBe(BENCHMARK_ENVIRONMENT);
  });

  it("rejects benchmark evidence that omits an asset hash", () => {
    const unhashed = [{ ...assets()[0]!, sha256: undefined }];
    expect(() =>
      createDeterminismRunFromIr({
        runId: "bad",
        environmentFingerprint: BENCHMARK_ENVIRONMENT,
        assets: unhashed,
        sourceGraph: sourceGraph(0),
        renderTree: tree(),
      }),
    ).toThrow("requires asset hashes");
  });
});

describe("NODE-30 performance benchmark instrumentation", () => {
  it("measures a real benchmark task without applying a synthetic millisecond pass threshold", async () => {
    const times = [100, 145];
    let cursor = 0;
    const result = await measurePerformanceBenchmark(
      {
        id: "10k-import",
        benchmarkEnvironment: BENCHMARK_ENVIRONMENT,
        renderNodeCount: 10_000,
        chunkingSupported: true,
        progressSupported: true,
        userWarningShown: false,
        sectionOrSimplifiedStrategyOffered: false,
        explicitConfirmationObtained: false,
      },
      () => undefined,
      { now: () => times[cursor++] ?? 145 },
    );
    expect(result.sample).toMatchObject({
      benchmarkEnvironment: BENCHMARK_ENVIRONMENT,
      durationMs: 45,
      completed: true,
      crashed: false,
    });
  });

  it("records a thrown benchmark task as a crash sample instead of losing the evidence", async () => {
    const times = [10, 20];
    let cursor = 0;
    const result = await measurePerformanceBenchmark(
      {
        id: "crash",
        benchmarkEnvironment: BENCHMARK_ENVIRONMENT,
        renderNodeCount: 10_000,
        chunkingSupported: true,
        progressSupported: true,
        userWarningShown: false,
        sectionOrSimplifiedStrategyOffered: false,
        explicitConfirmationObtained: false,
      },
      () => {
        throw new Error("fixture crash");
      },
      { now: () => times[cursor++] ?? 20 },
    );
    expect(result.sample.crashed).toBe(true);
    expect(result.errorMessage).toBe("fixture crash");
  });
});
