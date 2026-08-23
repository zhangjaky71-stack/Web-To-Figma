import { describe, expect, it } from "vitest";
import {
  analyzeBaseLayout,
  parseLayoutCssLength,
  summarizeBaseLayoutAnalysis,
  type LayoutNodeObservation,
} from "../src/index.js";

function node(
  sourceNodeId: string,
  style: LayoutNodeObservation["style"],
  patch: Partial<LayoutNodeObservation> = {},
): LayoutNodeObservation {
  return {
    sourceNodeId,
    childSourceNodeIds: [],
    kind: "element",
    bounds: { x: 0, y: 0, width: 960, height: 120 },
    parentBounds: { x: 0, y: 0, width: 1000, height: 800 },
    style,
    ...patch,
  };
}

describe("Base Layout Analyzer", () => {
  it("preserves authored CSS length semantics and computed pixel resolution", () => {
    expect(parseLayoutCssLength({ authored: "50%", computed: "480px" })).toEqual({
      semantic: { type: "percent", value: 50 },
      authoredValue: "50%",
      resolvedPx: 480,
    });
    expect(
      parseLayoutCssLength({ authored: "clamp(20rem, 50vw, 60rem)", computed: "800px" }),
    ).toEqual({
      semantic: { type: "expression", raw: "clamp(20rem, 50vw, 60rem)" },
      authoredValue: "clamp(20rem, 50vw, 60rem)",
      resolvedPx: 800,
    });
  });

  it("builds flex container semantics with editability-bearing sizing evidence", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("hero", {
          display: { authored: "flex", computed: "flex", sourceRef: "css:hero:display" },
          position: { computed: "relative" },
          width: { authored: "auto", computed: "960px", sourceRef: "css:hero:width" },
          height: { authored: "120px", computed: "120px" },
          paddingTop: { computed: "16px" },
          paddingRight: { computed: "24px" },
          paddingBottom: { computed: "16px" },
          paddingLeft: { computed: "24px" },
          rowGap: { computed: "8px" },
          columnGap: { computed: "20px" },
          flexDirection: { authored: "row", computed: "row" },
          flexWrap: { authored: "wrap", computed: "wrap" },
          justifyContent: { computed: "space-between" },
          alignItems: { computed: "center" },
          overflowX: { computed: "hidden" },
          overflowY: { computed: "visible" },
        }),
      ],
    });
    const layout = analysis.nodes[0]?.layout;
    expect(layout?.mode).toBe("flex");
    expect(layout?.sizing.width.mode).toBe("fill");
    expect(layout?.sizing.height.mode).toBe("fixed");
    expect(layout?.padding).toEqual({ top: 16, right: 24, bottom: 16, left: 24 });
    expect(layout?.effectiveGap).toEqual({ row: 8, column: 20 });
    expect(layout?.flexContainer?.wrap).toBe("wrap");
    expect(layout?.flexContainer?.justifyContent).toBe("space-between");
    expect(layout?.overflowX).toBe("hidden");
  });

  it("preserves grid tracks and item placement without flattening authored structure", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("grid", {
          display: { authored: "grid", computed: "grid" },
          position: { computed: "static" },
          width: { authored: "100%", computed: "1000px" },
          height: { authored: "auto", computed: "640px" },
          gridTemplateColumns: {
            authored: "repeat(3, minmax(0, 1fr))",
            computed: "320px 320px 320px",
          },
          gridTemplateRows: { authored: "auto 1fr", computed: "120px 520px" },
          gridAutoFlow: { computed: "row" },
          rowGap: { computed: "16px" },
          columnGap: { computed: "16px" },
        }),
        node("grid-item", {
          display: { computed: "block" },
          position: { computed: "static" },
          width: { authored: "auto", computed: "320px" },
          height: { authored: "auto", computed: "120px" },
          gridColumnStart: { authored: "2", computed: "2" },
          gridColumnEnd: { authored: "span 2", computed: "span 2" },
          gridRowStart: { authored: "1", computed: "1" },
        }),
      ],
    });
    const grid = analysis.nodes.find((item) => item.sourceNodeId === "grid")?.layout;
    const item = analysis.nodes.find((entry) => entry.sourceNodeId === "grid-item")?.layout;
    expect(grid?.mode).toBe("grid");
    expect(grid?.gridContainer?.columns.map((track) => track.authored)).toEqual([
      "repeat(3, minmax(0, 1fr))",
    ]);
    expect(grid?.gridContainer?.rows.map((track) => track.authored)).toEqual(["auto", "1fr"]);
    expect(item?.gridItem).toEqual({ columnStart: 2, columnEnd: "span 2", rowStart: 1 });
  });

  it("keeps absolute constraints and does not convert partial percentages into full Fill", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node(
          "badge",
          {
            display: { computed: "block" },
            position: { authored: "absolute", computed: "absolute" },
            width: { authored: "50%", computed: "200px" },
            height: { authored: "32px", computed: "32px" },
            left: { authored: "12px", computed: "12px" },
            top: { authored: "calc(50% - 16px)", computed: "84px" },
          },
          {
            bounds: { x: 12, y: 84, width: 200, height: 32 },
            parentBounds: { x: 0, y: 0, width: 400, height: 200 },
          },
        ),
      ],
    });
    const layout = analysis.nodes[0]?.layout;
    expect(layout?.mode).toBe("absolute");
    expect(layout?.sizing.width.mode).toBe("unknown");
    expect(layout?.sizing.height.mode).toBe("fixed");
    expect(layout?.absoluteConstraints?.left?.semantic).toEqual({ type: "px", value: 12 });
    expect(layout?.absoluteConstraints?.top?.semantic).toEqual({
      type: "expression",
      raw: "calc(50% - 16px)",
    });
  });

  it("defers table reconstruction and emits visible diagnostics", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("pricing-table", {
          display: { computed: "table" },
          position: { computed: "static" },
          width: { authored: "100%", computed: "1000px" },
          height: { authored: "auto", computed: "500px" },
        }),
      ],
    });
    expect(analysis.nodes[0]?.layout.mode).toBe("table");
    expect(analysis.diagnostics.some((item) => item.code === "LAYOUT_TABLE_DEFERRED")).toBe(true);
  });

  it("retains authored base sizing on responsive conflict and lowers confidence", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node(
          "card",
          {
            display: { computed: "block" },
            position: { computed: "static" },
            width: { authored: "320px", computed: "320px", sourceRef: "css:card:width" },
            height: { authored: "auto", computed: "180px" },
          },
          {
            responsiveSizing: {
              width: {
                mode: "fill",
                confidence: 0.9,
                reasons: ["width tracks parent across captured viewports"],
                sourceRefs: ["responsive:card"],
              },
            },
          },
        ),
      ],
    });
    const width = analysis.nodes[0]?.layout.sizing.width;
    expect(width?.mode).toBe("fixed");
    expect(width?.confidence).toBeLessThan(0.98);
    expect(width?.sourceRefs).toContain("responsive:card");
    expect(analysis.diagnostics.some((item) => item.code === "LAYOUT_SIZING_CONFLICT")).toBe(true);
  });

  it("is deterministic, rejects duplicate node observations and summarizes modes", () => {
    const first = node("b", { display: { computed: "block" }, position: { computed: "static" } });
    const second = node("a", { display: { computed: "flex" }, position: { computed: "static" } });
    const analysis = analyzeBaseLayout({ nodes: [first, second] });
    expect(analysis.nodes.map((item) => item.sourceNodeId)).toEqual(["a", "b"]);
    expect(summarizeBaseLayoutAnalysis(analysis).flexNodeCount).toBe(1);
    expect(() => analyzeBaseLayout({ nodes: [first, first] })).toThrow(
      /duplicate layout observation/,
    );
  });
});
