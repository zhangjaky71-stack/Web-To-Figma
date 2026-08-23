import { describe, expect, it } from "vitest";
import { analyzeBaseLayout, type LayoutNodeObservation } from "../src/index.js";

function node(
  sourceNodeId: string,
  bounds: { x: number; y: number; width: number; height: number },
  childSourceNodeIds: string[] = [],
  style: LayoutNodeObservation["style"] = {},
): LayoutNodeObservation {
  return { sourceNodeId, childSourceNodeIds, kind: "element", bounds, style };
}

describe("NODE-17 resolved geometry", () => {
  it("normalizes Browser border-box geometry into padding/content boxes and margin extents", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 200, height: 100 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
          borderTopWidth: { computed: "2px" },
          borderRightWidth: { computed: "2px" },
          borderBottomWidth: { computed: "2px" },
          borderLeftWidth: { computed: "2px" },
          paddingTop: { computed: "10px" },
          paddingRight: { computed: "10px" },
          paddingBottom: { computed: "10px" },
          paddingLeft: { computed: "10px" },
          marginTop: { computed: "-5px" },
          marginRight: { computed: "4px" },
          marginBottom: { computed: "8px" },
          marginLeft: { computed: "4px" },
        }),
      ],
    });
    expect(analysis.nodes[0]?.boxModel).toEqual({
      borderBox: { x: 0, y: 0, width: 200, height: 100 },
      paddingBox: { x: 2, y: 2, width: 196, height: 96 },
      contentBox: { x: 12, y: 12, width: 176, height: 76 },
      margin: { top: -5, right: 4, bottom: 8, left: 4 },
    });
  });

  it("uses resolved child geometry for normal-flow spacing, including negative overlap", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 300, height: 200 }, ["a", "b"], {
          display: { computed: "block" },
          position: { computed: "static" },
          rowGap: { computed: "0px" },
        }),
        node("a", { x: 0, y: 20, width: 100, height: 50 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
        }),
        node("b", { x: 0, y: 60, width: 100, height: 40 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
        }),
      ],
    });
    expect(
      analysis.nodes.find((item) => item.sourceNodeId === "root")?.layout.effectiveGap,
    ).toEqual({ row: -10, column: 0 });
  });

  it("captures distributed flex spacing from resolved geometry", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 300, height: 100 }, ["a", "b"], {
          display: { computed: "flex", authored: "flex" },
          position: { computed: "static" },
          flexDirection: { computed: "row" },
          flexWrap: { computed: "nowrap" },
          justifyContent: { computed: "space-between" },
          columnGap: { computed: "0px" },
        }),
        node("a", { x: 0, y: 0, width: 50, height: 40 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
        }),
        node("b", { x: 250, y: 0, width: 50, height: 40 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
        }),
      ],
    });
    expect(
      analysis.nodes.find((item) => item.sourceNodeId === "root")?.layout.effectiveGap,
    ).toEqual({ row: 0, column: 200 });
  });
});
