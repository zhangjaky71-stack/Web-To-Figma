import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";
import {
  W2F_NODE30_RESPONSIVE_DOMAINS,
  evaluatePerformanceQa,
  evaluateResponsiveQa,
  measurePerformanceBenchmark,
  renderBasicFigmaScene,
  responsiveChecksFromFixture,
  type W2fBasicFigmaAdapter,
  type W2fBasicGeometry,
  type W2fBasicRendererInput,
} from "../src/index.js";

interface BenchmarkNode {
  id: string;
  type: "FRAME" | "RECTANGLE";
  name: string;
  geometry: W2fBasicGeometry | null;
  pluginData: Record<string, string>;
  children: BenchmarkNode[];
  removed: boolean;
}

class BenchmarkAdapter implements W2fBasicFigmaAdapter<BenchmarkNode> {
  private nextId = 1;

  createFrame(): BenchmarkNode {
    return this.create("FRAME");
  }

  createRectangle(): BenchmarkNode {
    return this.create("RECTANGLE");
  }

  appendChild(parent: BenchmarkNode, child: BenchmarkNode): void {
    parent.children.push(child);
  }

  setName(node: BenchmarkNode, name: string): void {
    node.name = name;
  }

  setGeometry(node: BenchmarkNode, geometry: W2fBasicGeometry): void {
    node.geometry = { ...geometry };
  }

  setPluginData(node: BenchmarkNode, key: string, value: string): void {
    node.pluginData[key] = value;
  }

  remove(node: BenchmarkNode): void {
    node.removed = true;
  }

  setSelection(nodes: readonly BenchmarkNode[]): void {
    void nodes;
  }

  focusNodes(nodes: readonly BenchmarkNode[]): void {
    void nodes;
  }

  private create(type: BenchmarkNode["type"]): BenchmarkNode {
    const node: BenchmarkNode = {
      id: `benchmark-${this.nextId}`,
      type,
      name: "",
      geometry: null,
      pluginData: {},
      children: [],
      removed: false,
    };
    this.nextId += 1;
    return node;
  }
}

function benchmarkRenderNode(
  id: string,
  parentId: string | undefined,
  childIds: string[],
  index: number,
): WtfRenderNode {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    childIds,
    sourceNodeIds: [`source-${id}`],
    sourceStableIds: [`stable-${id}`],
    kind: parentId ? "decoration" : "document",
    name: id,
    geometry: {
      bounds: parentId
        ? { x: (index % 100) * 10, y: Math.floor(index / 100) * 10, width: 8, height: 8 }
        : { x: 0, y: 0, width: 1_000, height: 1_000 },
    },
    layout: {
      mode: "flow",
      display: "block",
      position: "static",
      sizing: {
        width: { mode: "fixed", confidence: 1, reasons: ["node30-benchmark"] },
        height: { mode: "fixed", confidence: 1, reasons: ["node30-benchmark"] },
      },
      decision: { confidence: 1, reasons: ["node30-benchmark"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["node30-benchmark"] },
  };
}

function tenThousandNodeInput(): W2fBasicRendererInput {
  const childIds = Array.from({ length: 9_999 }, (_, index) => `node-${index + 1}`);
  const renderTree: WtfRenderTree = {
    rootId: "root",
    nodes: [
      benchmarkRenderNode("root", undefined, childIds, 0),
      ...childIds.map((id, index) => benchmarkRenderNode(id, "root", [], index + 1)),
    ],
    sections: [],
  };
  const sourceGraph: WtfSourceGraph = {
    rootCaptureNodeId: "source-root",
    nodes: [
      {
        captureNodeId: "source-root",
        stableIdentity: { id: "stable-root", confidence: 1, evidence: ["node30-benchmark"] },
        kind: "document",
        relationships: {},
        childCaptureNodeIds: childIds.map((id) => `source-${id}`),
      },
      ...childIds.map((id) => ({
        captureNodeId: `source-${id}`,
        stableIdentity: {
          id: `stable-${id}`,
          confidence: 1,
          evidence: ["node30-benchmark"],
        },
        kind: "element" as const,
        relationships: { sourceParentId: "source-root" },
        childCaptureNodeIds: [],
      })),
    ],
    scrollContainers: [],
    revision: {
      documentId: "node30-10k",
      captureId: "node30-10k-capture",
      revisionId: "node30-10k-revision",
      sourceFingerprint: "node30-10k-source",
      capturedAt: "2026-08-25T00:00:00.000Z",
    },
  };
  return { renderTree, sourceGraph, profile: "balanced", tokenPolicy: "literal" };
}

const BENCHMARK_ENVIRONMENT = `${process.platform}-${process.arch}-node-${process.versions.node}-memory-figma-v1`;

describe("NODE-30 required responsive fixture corpus", () => {
  it("covers every contract domain including breakpoint, grid and container-query changes", () => {
    const expected = [
      {
        viewportId: "desktop",
        nodeId: "root",
        visible: true,
        horizontalSizing: "FILL" as const,
        verticalSizing: "HUG" as const,
        layoutMode: "HORIZONTAL" as const,
        columnGap: 24,
        paddingLeft: 32,
        minWidth: 768,
        maxWidth: 1_440,
        constraintSignature: "LEFT_RIGHT/TOP",
        containerQuerySignature: "container:min-width:900",
      },
      {
        viewportId: "desktop",
        nodeId: "nested",
        visible: true,
        horizontalSizing: "HUG" as const,
        verticalSizing: "HUG" as const,
        layoutMode: "VERTICAL" as const,
        rowGap: 12,
      },
      {
        viewportId: "desktop",
        nodeId: "fixed",
        visible: true,
        horizontalSizing: "FIXED" as const,
        verticalSizing: "FIXED" as const,
        order: 0,
      },
      {
        viewportId: "desktop",
        nodeId: "grid",
        visible: true,
        layoutMode: "GRID" as const,
        gridColumnCount: 4,
      },
      { viewportId: "desktop", nodeId: "promo", visible: true },
      {
        viewportId: "mobile",
        nodeId: "root",
        visible: true,
        horizontalSizing: "FILL" as const,
        verticalSizing: "HUG" as const,
        layoutMode: "VERTICAL" as const,
        rowGap: 16,
        paddingLeft: 16,
        minWidth: 320,
        maxWidth: 767,
        constraintSignature: "LEFT_RIGHT/TOP",
        containerQuerySignature: "container:max-width:899",
      },
      {
        viewportId: "mobile",
        nodeId: "grid",
        visible: true,
        layoutMode: "GRID" as const,
        gridColumnCount: 1,
        order: 1,
      },
      { viewportId: "mobile", nodeId: "promo", visible: false },
    ];
    const fixture = responsiveChecksFromFixture({
      expected,
      observed: expected.map((state) => ({ ...state })),
    });
    const report = evaluateResponsiveQa({
      ...fixture,
      requiredDomains: W2F_NODE30_RESPONSIVE_DOMAINS,
      structuralChanges: [
        {
          id: "desktop-to-mobile-direction-order-grid-visibility",
          expected: true,
          detected: true,
          executableInFigma: false,
          reportedWhenNotExecutable: true,
        },
      ],
    });
    expect(report.status).toBe("PASS");
    expect(report.compositeScore).toBe(1);
    expect(Object.keys(report.domainScores).sort()).toEqual(
      [...W2F_NODE30_RESPONSIVE_DOMAINS].sort(),
    );
  });
});

describe("NODE-30 10k renderer scale benchmark", () => {
  it("completes five measured 10k renderer runs without a fatal crash", async () => {
    const input = tenThousandNodeInput();
    const warmup = renderBasicFigmaScene(new BenchmarkAdapter(), input);
    expect(warmup.createdNodeCount).toBe(10_000);

    const samples = [];
    for (let run = 0; run < 5; run += 1) {
      const result = await measurePerformanceBenchmark(
        {
          id: `10k-render-${run + 1}`,
          benchmarkEnvironment: BENCHMARK_ENVIRONMENT,
          renderNodeCount: 10_000,
          chunkingSupported: false,
          progressSupported: false,
          userWarningShown: false,
          sectionOrSimplifiedStrategyOffered: false,
          explicitConfirmationObtained: false,
        },
        () => {
          const rendered = renderBasicFigmaScene(new BenchmarkAdapter(), input);
          if (rendered.createdNodeCount !== 10_000) {
            throw new Error(`expected 10000 rendered nodes, received ${rendered.createdNodeCount}`);
          }
        },
      );
      samples.push(result.sample);
    }

    const report = evaluatePerformanceQa(samples);
    expect(report.status).not.toBe("FAIL");
    expect(report.benchmarkEnvironment).toBe(BENCHMARK_ENVIRONMENT);
    expect(report.medianDurationMs).not.toBeNull();
    expect(report.p95DurationMs).not.toBeNull();
    expect(samples.every((sample) => sample.completed && !sample.crashed)).toBe(true);
    console.info(
      `NODE-30 10k renderer benchmark: env=${BENCHMARK_ENVIRONMENT} median=${report.medianDurationMs?.toFixed(2)}ms p95=${report.p95DurationMs?.toFixed(2)}ms`,
    );
  });
});
