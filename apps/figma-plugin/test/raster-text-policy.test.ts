import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import { evaluateRasterTextPolicy } from "../src/raster-text-policy.js";

function node(id: string, parentId: string | undefined, childIds: string[], options: { kind?: WtfRenderNode["kind"]; strategy?: WtfRenderNode["renderStrategy"]; reasons?: string[] } = {}): WtfRenderNode {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    childIds,
    sourceNodeIds: [`source-${id}`],
    kind: options.kind ?? "container",
    name: id,
    geometry: { bounds: { x: 0, y: 0, width: 100, height: 40 } },
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
    renderStrategy: options.strategy ?? "native",
    renderDecision: { confidence: 1, reasons: options.reasons ?? ["fixture"] },
  };
}

function tree(boundaryReasons: string[], includeText = true): WtfRenderTree {
  return {
    rootId: "root",
    sections: [],
    nodes: [
      node("root", undefined, ["boundary"]),
      node("boundary", "root", includeText ? ["label"] : [], { strategy: "raster", reasons: boundaryReasons }),
      ...(includeText ? [node("label", "boundary", [], { kind: "text" })] : []),
    ],
  };
}

describe("NODE-31 raster text authorization policy", () => {
  it("is not applicable when a raster boundary has no ordinary text", () => {
    expect(evaluateRasterTextPolicy(tree(["canvas fallback"], false), "boundary", "balanced")).toMatchObject({ status: "not-applicable", textRenderNodeIds: [] });
  });

  it.each(["balanced", "high-fidelity"] as const)("authorizes text carried by a mix-blend compositing boundary in %s", (profile) => {
    const decision = evaluateRasterTextPolicy(tree(["mix-blend-mode depends on sibling/ancestor backdrop pixels"]), "boundary", profile);
    expect(decision.status).toBe("raster-authorized");
    expect(decision.textRenderNodeIds).toEqual(["label"]);
    expect(decision.visualJustifications).toHaveLength(1);
  });

  it("preserves ordinary text in design-friendly profile even with a visual dependency", () => {
    const decision = evaluateRasterTextPolicy(tree(["backdrop-filter samples pixels behind the filtered node"]), "boundary", "design-friendly");
    expect(decision.status).toBe("native-preserved");
    expect(decision.visualJustifications).toHaveLength(1);
  });

  it("does not authorize raster text for font, geometry or pixel-score reasons alone", () => {
    const decision = evaluateRasterTextPolicy(tree(["font substitution mismatch", "geometry correction drift remains above tolerance", "pixel similarity score improved by raster"]), "boundary", "high-fidelity");
    expect(decision.status).toBe("native-preserved");
    expect(decision.visualJustifications).toEqual([]);
    expect(decision.ignoredTextQualityReasons).toHaveLength(3);
  });

  it("does not mistake an unsupported font reason for an unsupported visual dependency", () => {
    const decision = evaluateRasterTextPolicy(tree(["unsupported font family requested by source text"]), "boundary", "high-fidelity");
    expect(decision.status).toBe("native-preserved");
    expect(decision.visualJustifications).toEqual([]);
  });

  it("uses the visual cause, not a font diagnostic, when both are present", () => {
    const decision = evaluateRasterTextPolicy(tree(["unsupported blend effect requires visual fallback", "font substitution mismatch"]), "boundary", "balanced");
    expect(decision.status).toBe("raster-authorized");
    expect(decision.visualJustifications).toEqual(["unsupported blend effect requires visual fallback"]);
    expect(decision.ignoredTextQualityReasons).toEqual(["font substitution mismatch"]);
  });

  it("authorizes a promoted mask group when flattening is required for compositing", () => {
    const decision = evaluateRasterTextPolicy(tree(["mask requires the affected subtree to be flattened as one compositing group"]), "boundary", "high-fidelity");
    expect(decision.status).toBe("raster-authorized");
  });
});
