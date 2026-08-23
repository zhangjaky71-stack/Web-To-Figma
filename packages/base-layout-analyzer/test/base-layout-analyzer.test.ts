import { describe, expect, it } from "vitest";
import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture, CssCascadePropertyTrace } from "@w2f/css-cascade";
import { analyzeBaseLayout, summarizeBaseLayout } from "../src/index.js";

function trace(property: string, computedValue: string, authoredValue?: string): CssCascadePropertyTrace {
  return {
    property,
    computedValue,
    candidates:
      authoredValue === undefined
        ? []
        : [{ property, authoredValue, important: false, inherited: false, status: "winner", sourceOrder: 1, source: { type: "inline" } }],
  };
}

function cascade(nodes: Record<string, Array<[string, string, string?]>>): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "standard",
    cascade: {
      version: "1.0.0",
      nodes: Object.entries(nodes).map(([sourceNodeId, definitions]) => ({
        sourceNodeId,
        traces: definitions.map(([property, computedValue, authoredValue]) => trace(property, computedValue, authoredValue)),
        customProperties: {},
      })),
    },
    styles: [],
    tokens: { version: "1.0.0", definitions: [], usages: [], aliases: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  } as unknown as CssCascadeCapture;
}

function rawNode(
  captureNodeId: string,
  bounds: { x: number; y: number; width: number; height: number },
  childCaptureNodeIds: string[] = [],
  tagName = "div",
): RawNode {
  return {
    captureNodeId,
    kind: "element",
    relationships: {} as RawNode["relationships"],
    childCaptureNodeIds,
    frameContext: {} as RawNode["frameContext"],
    source: { tagName },
    geometry: { bounds },
    visibility: { display: "block", visibility: "visible", opacity: 1, hiddenAttribute: false, rendered: true },
  };
}

function snapshot(nodes: RawNode[]): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T00:00:00.000Z",
    url: "https://example.test/",
    title: "fixture",
    rootCaptureNodeId: nodes[0]?.captureNodeId ?? "root",
    captureTarget: { type: "document" },
    environment: { viewportWidth: 1440, viewportHeight: 900, scale: {} as RawSnapshot["environment"]["scale"] },
    nodes,
    frames: [],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("Base Layout Analyzer", () => {
  it("preserves flex semantics, item sizing, box model and effective gaps", () => {
    const result = analyzeBaseLayout({
      snapshot: snapshot([
        rawNode("root", { x: 0, y: 0, width: 600, height: 200 }, ["a", "b"]),
        rawNode("a", { x: 20, y: 10, width: 260, height: 80 }),
        rawNode("b", { x: 300, y: 10, width: 280, height: 80 }),
      ]),
      cascade: cascade({
        root: [
          ["display", "flex", "flex"], ["position", "static"], ["flex-direction", "row", "row"],
          ["flex-wrap", "nowrap", "nowrap"], ["justify-content", "space-between", "space-between"],
          ["align-items", "center", "center"], ["row-gap", "0px", "0"], ["column-gap", "20px", "20px"],
          ["padding-top", "10px", "10px"], ["padding-right", "20px", "20px"],
          ["padding-bottom", "10px", "10px"], ["padding-left", "20px", "20px"],
          ["border-top-width", "1px"], ["border-right-width", "1px"], ["border-bottom-width", "1px"],
          ["border-left-width", "1px"], ["width", "600px", "600px"], ["height", "200px", "200px"],
        ],
        a: [
          ["display", "block"], ["position", "static"], ["width", "260px", "auto"], ["height", "80px", "80px"],
          ["flex-grow", "1", "1"], ["flex-shrink", "1", "1"], ["flex-basis", "0px", "0px"],
          ["min-width", "120px", "120px"], ["max-width", "400px", "400px"],
        ],
        b: [["display", "block"], ["position", "static"], ["width", "280px", "100%"], ["height", "80px", "80px"], ["flex-grow", "1", "1"]],
      }),
    });
    const root = result.nodes.find((node) => node.sourceNodeId === "root");
    const a = result.nodes.find((node) => node.sourceNodeId === "a");
    expect(root?.layout.mode).toBe("flex");
    expect(root?.layout.flexContainer?.direction).toBe("row");
    expect(root?.layout.effectiveGap).toEqual({ row: 0, column: 20 });
    expect(root?.layout.padding).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(root?.boxModel?.contentBox).toEqual({ x: 21, y: 11, width: 558, height: 178 });
    expect(a?.layout.flexItem?.grow).toBe(1);
    expect(a?.layout.sizing.width.mode).toBe("content");
    expect(a?.layout.sizing.width.min?.resolvedPx).toBe(120);
    expect(a?.layout.sizing.width.max?.resolvedPx).toBe(400);
  });

  it("preserves grid tracks and item placement", () => {
    const result = analyzeBaseLayout({
      snapshot: snapshot([rawNode("grid", { x: 0, y: 0, width: 900, height: 500 }, ["card"]), rawNode("card", { x: 10, y: 10, width: 280, height: 200 })]),
      cascade: cascade({
        grid: [["display", "grid", "grid"], ["position", "static"], ["grid-template-columns", "280px 280px 280px", "repeat(3, minmax(0, 1fr))"], ["grid-template-rows", "200px 200px", "auto auto"], ["grid-auto-flow", "row", "row"], ["row-gap", "24px", "24px"], ["column-gap", "30px", "30px"]],
        card: [["display", "block"], ["position", "static"], ["grid-column-start", "2", "2"], ["grid-column-end", "4", "4"], ["grid-row-start", "1", "1"], ["grid-row-end", "span 2", "span 2"]],
      }),
    });
    const grid = result.nodes.find((node) => node.sourceNodeId === "grid");
    const card = result.nodes.find((node) => node.sourceNodeId === "card");
    expect(grid?.layout.mode).toBe("grid");
    expect(grid?.layout.gridContainer?.columns[0]?.authored).toBe("repeat(3, minmax(0, 1fr))");
    expect(grid?.layout.gridContainer?.rowGap).toBe(24);
    expect(card?.layout.gridItem).toMatchObject({ columnStart: 2, columnEnd: 4, rowStart: 1, rowEnd: "span 2" });
  });

  it("preserves absolute constraints and defers tables to NODE-18", () => {
    const result = analyzeBaseLayout({
      snapshot: snapshot([rawNode("root", { x: 0, y: 0, width: 800, height: 600 }, ["badge", "table"]), rawNode("badge", { x: 730, y: 20, width: 50, height: 24 }), rawNode("table", { x: 0, y: 100, width: 800, height: 300 })]),
      cascade: cascade({
        root: [["display", "block", "block"]],
        badge: [["display", "block"], ["position", "absolute", "absolute"], ["right", "20px", "20px"], ["top", "20px", "20px"], ["width", "50px", "50px"], ["height", "24px", "24px"]],
        table: [["display", "table", "table"]],
      }),
    });
    const badge = result.nodes.find((node) => node.sourceNodeId === "badge");
    const table = result.nodes.find((node) => node.sourceNodeId === "table");
    expect(badge?.layout.mode).toBe("absolute");
    expect(badge?.layout.absoluteConstraints?.right?.resolvedPx).toBe(20);
    expect(badge?.layout.absoluteConstraints?.top?.semantic).toEqual({ type: "px", value: 20 });
    expect(table?.layout.mode).toBe("unknown");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "BASE_LAYOUT_TABLE_DEFERRED")).toBe(true);
  });

  it("is deterministic and reports summary counts", () => {
    const input = { snapshot: snapshot([rawNode("root", { x: 0, y: 0, width: 320, height: 100 })]), cascade: cascade({ root: [["display", "block", "block"]] }) };
    const first = analyzeBaseLayout(input);
    expect(analyzeBaseLayout(input)).toEqual(first);
    expect(summarizeBaseLayout(first)).toMatchObject({ nodeCount: 1, flowCount: 1, diagnosticCount: 0 });
  });
});
