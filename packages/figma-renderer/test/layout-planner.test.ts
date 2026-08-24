import { describe, expect, it } from "vitest";
import type { WtfRenderNode } from "@w2f/w2f-ir";
import { createAutoLayoutPlan, createGridLayoutPlan } from "../src/layout/planner.js";

function node(id: string, overrides: Partial<WtfRenderNode> = {}): WtfRenderNode {
  return {
    id,
    childIds: [],
    sourceNodeIds: [`source-${id}`],
    sourceStableIds: [`stable-${id}`],
    kind: "container",
    name: id,
    geometry: { bounds: { x: 0, y: 0, width: 320, height: 120 } },
    layout: {
      mode: "flow",
      display: "block",
      position: "static",
      sizing: {
        width: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
        height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
      },
      decision: { confidence: 1, reasons: ["fixture"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
    ...overrides,
  };
}

function flexContainer(overrides: Partial<WtfRenderNode["layout"]> = {}): WtfRenderNode {
  const base = node("parent");
  return {
    ...base,
    childIds: ["a", "b"],
    layout: {
      ...base.layout,
      mode: "flex",
      display: "flex",
      padding: { top: 8, right: 16, bottom: 12, left: 20 },
      effectiveGap: { row: 12, column: 24 },
      flexContainer: {
        direction: "row",
        wrap: "nowrap",
        justifyContent: "space-between",
        alignItems: "center",
        rowGap: 12,
        columnGap: 24,
      },
      ...overrides,
    },
  };
}

function gridContainer(overrides: Partial<WtfRenderNode["layout"]> = {}): WtfRenderNode {
  const base = node("grid");
  return {
    ...base,
    childIds: ["a", "b"],
    layout: {
      ...base.layout,
      mode: "grid",
      display: "grid",
      effectiveGap: { row: 12, column: 16 },
      gridContainer: {
        columns: [
          { authored: "120px", resolvedPx: 120 },
          { authored: "2fr" },
        ],
        rows: [
          { authored: "80px", resolvedPx: 80 },
          { authored: "1fr" },
        ],
        rowGap: 12,
        columnGap: 16,
        autoFlow: "row",
      },
      ...overrides,
    },
  };
}

describe("NODE-27 auto-layout planner", () => {
  it("maps a native horizontal flex container without losing gap or padding", () => {
    const plan = createAutoLayoutPlan({
      container: flexContainer(),
      children: [node("a"), node("b")],
    });
    expect(plan?.container).toMatchObject({
      mode: "HORIZONTAL",
      wrap: "NO_WRAP",
      primaryAlign: "SPACE_BETWEEN",
      counterAlign: "CENTER",
      itemSpacing: 24,
      padding: { top: 8, right: 16, bottom: 12, left: 20 },
      nativeCompatible: true,
    });
  });

  it("keeps unsupported vertical wrapping on source geometry instead of writing invalid Figma layoutWrap", () => {
    const container = flexContainer({
      flexContainer: {
        direction: "column",
        wrap: "wrap",
        justifyContent: "flex-start",
        alignItems: "stretch",
        rowGap: 10,
        columnGap: 18,
      },
    });
    const plan = createAutoLayoutPlan({ container, children: [node("a"), node("b")] });
    expect(plan?.container).toMatchObject({
      mode: "VERTICAL",
      wrap: "NO_WRAP",
      nativeCompatible: false,
    });
    expect(plan?.container.reasons.join(" ")).toMatch(/vertical flex wrapping/);
  });

  it("maps flex-grow to fill on the primary axis and preserves explicit min/max sizes", () => {
    const child = node("a", {
      layout: {
        ...node("a").layout,
        flexItem: { grow: 1, shrink: 1, order: 2 },
        sizing: {
          width: {
            mode: "fixed",
            min: { semantic: { type: "px", value: 80 }, resolvedPx: 80 },
            max: { semantic: { type: "px", value: 240 }, resolvedPx: 240 },
            confidence: 1,
            reasons: ["fixture"],
          },
          height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
        },
      },
    });
    const plan = createAutoLayoutPlan({ container: flexContainer(), children: [child] });
    expect(plan?.children[0]).toMatchObject({
      horizontalSizing: "FILL",
      layoutGrow: 1,
      minWidth: 80,
      maxWidth: 240,
      order: 2,
    });
  });

  it("keeps absolute children out of fill/stretch behavior", () => {
    const child = node("a", {
      layout: {
        ...node("a").layout,
        position: "absolute",
        flexItem: { grow: 1, alignSelf: "stretch" },
      },
    });
    const plan = createAutoLayoutPlan({ container: flexContainer(), children: [child] });
    expect(plan?.children[0]).toMatchObject({
      absolutePositioned: true,
      counterAxisStretch: false,
      layoutGrow: 1,
    });
    expect(plan?.children[0]?.verticalSizing).not.toBe("FILL");
  });

  it("fails native compatibility instead of silently approximating unsupported flex semantics", () => {
    const container = flexContainer({
      flexContainer: {
        direction: "row-reverse",
        wrap: "wrap-reverse",
        justifyContent: "space-evenly",
        alignItems: "center",
      },
    });
    const plan = createAutoLayoutPlan({ container, children: [node("a"), node("b")] });
    expect(plan?.container.reverseChildren).toBe(true);
    expect(plan?.container.nativeCompatible).toBe(false);
    expect(plan?.container.reasons.join(" ")).toMatch(/wrap-reverse|space-evenly/);
  });

  it("returns null for non-flex containers", () => {
    expect(createAutoLayoutPlan({ container: node("plain"), children: [] })).toBeNull();
  });
});

describe("NODE-27 native Grid planner", () => {
  it("maps fixed/fr tracks, gaps and row auto-flow without inventing extra semantics", () => {
    const plan = createGridLayoutPlan({
      container: gridContainer(),
      children: [node("a"), node("b")],
    });
    expect(plan?.container).toMatchObject({
      rowGap: 12,
      columnGap: 16,
      itemsPositioning: "ROW_AUTO_FLOW",
      nativeCompatible: true,
      columns: [
        { type: "FIXED", value: 120, authored: "120px" },
        { type: "FLEX", value: 2, authored: "2fr" },
      ],
      rows: [
        { type: "FIXED", value: 80, authored: "80px" },
        { type: "FLEX", value: 1, authored: "1fr" },
      ],
    });
  });

  it("maps numeric CSS grid lines and spans to zero-based Figma placement", () => {
    const a = node("a", {
      layout: {
        ...node("a").layout,
        gridItem: { rowStart: 1, rowEnd: 3, columnStart: 2, columnEnd: "span 1" },
      },
    });
    const plan = createGridLayoutPlan({
      container: gridContainer(),
      children: [a, node("b")],
    });
    expect(plan?.container.itemsPositioning).toBe("MANUAL");
    expect(plan?.children[0]).toEqual({
      renderNodeId: "a",
      rowIndex: 0,
      columnIndex: 1,
      rowSpan: 2,
      columnSpan: 1,
    });
    expect(plan?.container.nativeCompatible).toBe(true);
  });

  it("supports minmax(0, Nfr) as a native flexible track", () => {
    const plan = createGridLayoutPlan({
      container: gridContainer({
        gridContainer: {
          columns: [{ authored: "minmax(0, 3fr)" }],
          rows: [{ authored: "1fr" }],
          autoFlow: "row",
        },
      }),
      children: [],
    });
    expect(plan?.container.columns[0]).toEqual({
      type: "FLEX",
      value: 3,
      authored: "minmax(0, 3fr)",
    });
    expect(plan?.container.nativeCompatible).toBe(true);
  });

  it("marks intrinsic/named/column-flow Grid semantics non-native instead of approximating them", () => {
    const child = node("a", {
      layout: {
        ...node("a").layout,
        gridItem: { rowStart: "header", columnStart: 1 },
      },
    });
    const plan = createGridLayoutPlan({
      container: gridContainer({
        gridContainer: {
          columns: [{ authored: "max-content", resolvedPx: 180 }],
          rows: [{ authored: "auto", resolvedPx: 40 }],
          autoFlow: "column",
        },
      }),
      children: [child],
    });
    expect(plan?.container.nativeCompatible).toBe(false);
    expect(plan?.container.reasons.join(" ")).toMatch(/track|grid-auto-flow|grid line|partial/);
  });

  it("returns null for non-grid containers", () => {
    expect(createGridLayoutPlan({ container: node("plain"), children: [] })).toBeNull();
  });
});
