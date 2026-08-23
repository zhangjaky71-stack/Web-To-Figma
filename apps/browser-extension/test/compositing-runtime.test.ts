import type { WtfRenderTree } from "@w2f/w2f-ir";
import { describe, expect, it } from "vitest";
import { analyzeCapturedCompositing } from "../src/runtime/compositing-runtime.js";

function tree(): WtfRenderTree {
  const layout = {
    mode: "flow" as const,
    display: "block",
    position: "static",
    sizing: {
      width: { mode: "fixed" as const, confidence: 1, reasons: ["fixture"] },
      height: { mode: "fixed" as const, confidence: 1, reasons: ["fixture"] },
    },
    decision: { confidence: 1, reasons: ["fixture"] },
  };
  return {
    rootId: "root",
    sections: [],
    nodes: [
      {
        id: "root",
        childIds: ["canvas"],
        sourceNodeIds: ["source-root"],
        kind: "document",
        name: "root",
        geometry: { bounds: { x: 0, y: 0, width: 800, height: 600 } },
        layout,
        paint: { fills: [], opacity: 1 },
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: ["fixture"] },
      },
      {
        id: "canvas",
        parentId: "root",
        childIds: [],
        sourceNodeIds: ["source-canvas"],
        kind: "canvas",
        name: "canvas",
        geometry: { bounds: { x: 10, y: 10, width: 200, height: 100 } },
        layout,
        paint: { fills: [], opacity: 1 },
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: ["fixture"] },
      },
    ],
  };
}

describe("Browser compositing runtime", () => {
  it("consumes a persisted Render Tree shape and emits a local fallback boundary", () => {
    const result = analyzeCapturedCompositing(tree());
    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("canvas");
    expect(result.tree.nodes.find((node) => node.id === "canvas")?.renderStrategy).toBe("raster");
  });
});
