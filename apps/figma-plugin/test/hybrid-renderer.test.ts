import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import { rasterSafeLayoutTree } from "../src/figma-hybrid-renderer.js";

function node(id: string, parentId?: string): WtfRenderNode {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    childIds: [],
    sourceNodeIds: [`source-${id}`],
    kind: "container",
    name: id,
    geometry: { bounds: { x: 0, y: 0, width: 100, height: 40 } },
    layout: {
      mode: "flex",
      display: "flex",
      position: "static",
      sizing: {
        width: { mode: "fill", confidence: 1, reasons: ["fixture"] },
        height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
      },
      flexContainer: {
        direction: "row",
        wrap: "nowrap",
        justifyContent: "flex-start",
        alignItems: "stretch",
      },
      decision: { confidence: 1, reasons: ["fixture"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "raster",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
  };
}

describe("NODE-28 raster-safe layout tree", () => {
  it("turns only successfully rasterized boundaries into layout leaves while preserving parent sizing evidence", () => {
    const raster = node("raster", "parent");
    const native = { ...node("native", "parent"), renderStrategy: "native" as const };
    const parent = {
      ...node("parent"),
      renderStrategy: "native" as const,
      childIds: ["raster", "native"],
    };
    const renderTree: WtfRenderTree = { rootId: "parent", nodes: [parent, raster, native], sections: [] };
    const safe = rasterSafeLayoutTree(renderTree, ["raster"]);
    const safeRaster = safe.nodes.find((item) => item.id === "raster");
    const safeNative = safe.nodes.find((item) => item.id === "native");

    expect(safeRaster?.layout.mode).toBe("none");
    expect(safeRaster?.layout.display).toBe("block");
    expect(safeRaster?.layout.sizing.width.mode).toBe("fill");
    expect(safeNative?.layout.mode).toBe("flex");
    expect(renderTree.nodes.find((item) => item.id === "raster")?.layout.mode).toBe("flex");
  });
});
