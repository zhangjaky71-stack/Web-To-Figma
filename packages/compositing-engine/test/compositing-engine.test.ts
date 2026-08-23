import { describe, expect, it } from "vitest";
import type { WtfPaintModel, WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import { analyzeCompositing, summarizeCompositingAnalysis } from "../src/index.js";

function paint(overrides: Partial<WtfPaintModel> = {}): WtfPaintModel {
  return { fills: [], opacity: 1, ...overrides };
}

function node(
  id: string,
  parentId: string | undefined,
  childIds: string[],
  options: {
    kind?: WtfRenderNode["kind"];
    strategy?: WtfRenderNode["renderStrategy"];
    paint?: Partial<WtfPaintModel>;
  } = {},
): WtfRenderNode {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    childIds,
    sourceNodeIds: [`source-${id}`],
    kind: options.kind ?? "container",
    name: id,
    geometry: { bounds: { x: 0, y: 0, width: 100, height: 100 } },
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
    paint: paint(options.paint),
    renderStrategy: options.strategy ?? "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
  };
}

function tree(nodes: WtfRenderNode[], rootId = "root"): WtfRenderTree {
  return { rootId, nodes, sections: [] };
}

describe("Compositing Engine", () => {
  it("keeps an independent canvas fallback local", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["hero"]),
        node("hero", "root", ["canvas", "title"]),
        node("canvas", "hero", [], { kind: "canvas" }),
        node("title", "hero", [], { kind: "text" }),
      ]),
    });
    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0]).toMatchObject({
      rootRenderNodeId: "canvas",
      triggerRenderNodeIds: ["canvas"],
      promoted: false,
    });
    expect(result.tree.nodes.find((item) => item.id === "canvas")?.renderStrategy).toBe("raster");
    expect(result.tree.nodes.find((item) => item.id === "hero")?.renderStrategy).toBe("native");
  });

  it("promotes mix-blend fallback to the sibling backdrop container", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["hero"]),
        node("hero", "root", ["background", "blend"]),
        node("background", "hero", []),
        node("blend", "hero", [], { paint: { blendMode: "multiply" } }),
      ]),
    });
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("hero");
    expect(result.boundaries[0]?.triggerRenderNodeIds).toEqual(["blend"]);
    expect(result.boundaries[0]?.reasons.join(" ")).toMatch(/backdrop/);
    expect(result.tree.nodes.find((item) => item.id === "hero")?.renderStrategy).toBe("raster");
  });

  it("promotes backdrop-filter to a painted ancestor when intermediate wrappers have no backdrop", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["background", "wrapper"]),
        node("background", "root", []),
        node("wrapper", "root", ["glass"]),
        node("glass", "wrapper", [], { paint: { backdropFilter: "blur(12px)" } }),
      ]),
    });
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("root");
    expect(result.boundaries[0]?.promoted).toBe(true);
  });

  it("promotes a descendant raster seed through filter, mask and multi-child opacity groups", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["filter"]),
        node("filter", "root", ["mask"], { paint: { filter: "blur(2px)" } }),
        node("mask", "filter", ["opacity"], { paint: { maskImage: "linear-gradient(black, transparent)" } }),
        node("opacity", "mask", ["canvas", "label"], { paint: { opacity: 0.5 } }),
        node("canvas", "opacity", [], { kind: "canvas" }),
        node("label", "opacity", [], { kind: "text" }),
      ]),
    });
    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("filter");
    expect(result.boundaries[0]?.effects).toEqual(
      expect.arrayContaining(["filter", "mask", "opacity-group", "canvas"]),
    );
    expect(result.boundaries[0]?.promoted).toBe(true);
  });

  it("uses isolation as the safe backdrop dependency boundary", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["isolated"]),
        node("isolated", "root", ["background", "wrap"], { paint: { isolation: "isolate" } }),
        node("background", "isolated", []),
        node("wrap", "isolated", ["blend"]),
        node("blend", "wrap", [], { paint: { blendMode: "screen" } }),
      ]),
    });
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("isolated");
    expect(result.boundaries[0]?.effects).toContain("isolation");
    expect(result.boundaries[0]?.rootRenderNodeId).not.toBe("root");
  });

  it("merges a nested local seed into an outer promoted fallback boundary", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["hero"]),
        node("hero", "root", ["canvas", "blend"]),
        node("canvas", "hero", [], { kind: "canvas" }),
        node("blend", "hero", [], { paint: { blendMode: "multiply" } }),
      ]),
    });
    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0]?.rootRenderNodeId).toBe("hero");
    expect(result.boundaries[0]?.triggerRenderNodeIds).toEqual(["blend", "canvas"]);
    expect(result.diagnostics.some((item) => item.code === "COMPOSITING_BOUNDARY_MERGED")).toBe(true);
  });

  it("does not rasterize filter or opacity groups without a fallback dependency seed", () => {
    const result = analyzeCompositing({
      tree: tree([
        node("root", undefined, ["filter"]),
        node("filter", "root", ["a", "b"], { paint: { filter: "blur(1px)", opacity: 0.8 } }),
        node("a", "filter", []),
        node("b", "filter", []),
      ]),
    });
    expect(result.boundaries).toEqual([]);
    expect(result.tree.nodes.every((item) => item.renderStrategy === "native")).toBe(true);
  });

  it("is deterministic and reports summary metrics", () => {
    const input = {
      tree: tree([
        node("root", undefined, ["canvas"]),
        node("canvas", "root", [], { kind: "canvas" }),
      ]),
    };
    const first = analyzeCompositing(input);
    const second = analyzeCompositing(input);
    expect(second).toEqual(first);
    expect(summarizeCompositingAnalysis(first)).toMatchObject({
      renderNodeCount: 2,
      fallbackBoundaryCount: 1,
      fallbackMemberNodeCount: 1,
      fallbackTriggerNodeCount: 1,
      promotedBoundaryCount: 0,
    });
  });
});
