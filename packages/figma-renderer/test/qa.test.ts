import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import { compareRgbaPixels, evaluateStructureAndEditabilityQa, evaluateVisualQa } from "../src/qa/index.js";
import type { W2fFigmaQaNodeSnapshot } from "../src/qa/types.js";

function renderNode(
  id: string,
  kind: WtfRenderNode["kind"],
  bounds: { x: number; y: number; width: number; height: number },
  options: {
    parentId?: string;
    childIds?: string[];
    renderStrategy?: WtfRenderNode["renderStrategy"];
  } = {},
): WtfRenderNode {
  return {
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    childIds: options.childIds ?? [],
    sourceNodeIds: [`source-${id}`],
    kind,
    name: id,
    geometry: { bounds },
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
    renderStrategy: options.renderStrategy ?? "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
  };
}

function snapshot(
  renderNodeId: string,
  editableClass: W2fFigmaQaNodeSnapshot["editableClass"],
  options: {
    parentRenderNodeId?: string;
    siblingIndex?: number;
    renderStrategy?: WtfRenderNode["renderStrategy"];
    rasterMode?: string;
  } = {},
): W2fFigmaQaNodeSnapshot {
  const renderStrategy = options.renderStrategy ?? "native";
  return {
    figmaNodeId: `figma-${renderNodeId}`,
    renderNodeId,
    ...(options.parentRenderNodeId ? { parentRenderNodeId: options.parentRenderNodeId } : {}),
    siblingIndex: options.siblingIndex ?? 0,
    name: renderNodeId,
    nodeType: editableClass === "text" ? "TEXT" : "FRAME",
    editableClass,
    visible: true,
    width: 100,
    height: 100,
    pluginData: {
      "w2f.nodeId": renderNodeId,
      "w2f.renderStrategy": renderStrategy,
      ...(options.rasterMode ? { "w2f.raster.mode": options.rasterMode } : {}),
    },
  };
}

function tree(nodes: WtfRenderNode[], rootId = nodes[0]!.id): WtfRenderTree {
  return { rootId, nodes, sections: [] };
}

describe("NODE-29 structure and editability QA", () => {
  it("passes a fully mapped editable native hierarchy", () => {
    const root = renderNode("root", "container", { x: 0, y: 0, width: 400, height: 200 }, {
      childIds: ["text", "vector"],
    });
    const text = renderNode("text", "text", { x: 0, y: 0, width: 200, height: 200 }, {
      parentId: "root",
    });
    const vector = renderNode("vector", "vector", { x: 200, y: 0, width: 200, height: 200 }, {
      parentId: "root",
    });
    const report = evaluateStructureAndEditabilityQa({
      renderTree: tree([root, text, vector]),
      sceneNodes: [
        snapshot("root", "container"),
        snapshot("text", "text", { parentRenderNodeId: "root", siblingIndex: 0 }),
        snapshot("vector", "vector", { parentRenderNodeId: "root", siblingIndex: 1 }),
      ],
    });
    expect(report.status).toBe("PASS");
    expect(report.metrics.structureScore).toBe(1);
    expect(report.metrics.editableAreaRatio).toBe(1);
    expect(report.metrics.rasterAreaRatio).toBe(0);
  });

  it("suppresses descendants only behind an explicit minimal raster boundary", () => {
    const root = renderNode("root", "container", { x: 0, y: 0, width: 400, height: 250 }, {
      childIds: ["fallback", "native-text"],
    });
    const fallback = renderNode(
      "fallback",
      "fallback",
      { x: 0, y: 0, width: 100, height: 100 },
      { parentId: "root", childIds: ["hidden-text"], renderStrategy: "raster" },
    );
    const hiddenText = renderNode("hidden-text", "text", { x: 0, y: 0, width: 100, height: 100 }, {
      parentId: "fallback",
    });
    const nativeText = renderNode("native-text", "text", { x: 100, y: 0, width: 300, height: 300 }, {
      parentId: "root",
    });
    const report = evaluateStructureAndEditabilityQa({
      renderTree: tree([root, fallback, hiddenText, nativeText]),
      sceneNodes: [
        snapshot("root", "container"),
        snapshot("fallback", "raster", {
          parentRenderNodeId: "root",
          siblingIndex: 0,
          renderStrategy: "raster",
          rasterMode: "minimal-local-fallback",
        }),
        snapshot("native-text", "text", { parentRenderNodeId: "root", siblingIndex: 1 }),
      ],
    });
    expect(report.status).toBe("PASS");
    expect(report.metrics.suppressedRasterDescendantCount).toBe(1);
    expect(report.metrics.rasterAreaRatio).toBeCloseTo(0.1, 5);
    expect(report.metrics.editableAreaRatio).toBeCloseTo(0.9, 5);
  });

  it("fails native text that was rasterized to improve pixel similarity", () => {
    const text = renderNode("text", "text", { x: 0, y: 0, width: 100, height: 40 });
    const report = evaluateStructureAndEditabilityQa({
      renderTree: tree([text]),
      sceneNodes: [snapshot("text", "raster", { rasterMode: "minimal-local-fallback" })],
    });
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("Unauthorized rasterization");
    expect(report.failures.join("\n")).toContain("Editability mismatch");
  });
});

describe("NODE-29 pixel QA", () => {
  it("returns 100% similarity for identical RGBA pixels", () => {
    const pixels = Uint8Array.from([10, 20, 30, 255, 100, 120, 140, 255]);
    const metrics = compareRgbaPixels(pixels, pixels);
    expect(metrics.normalizedSimilarity).toBe(1);
    expect(metrics.changedPixelRatio).toBe(0);
    expect(evaluateVisualQa(metrics).status).toBe("PASS");
  });

  it("reports deterministic visual regressions below the 99% contract", () => {
    const expected = Uint8Array.from([0, 0, 0, 255]);
    const actual = Uint8Array.from([30, 30, 30, 255]);
    const metrics = compareRgbaPixels(expected, actual);
    expect(metrics.normalizedSimilarity).toBeLessThan(0.99);
    expect(metrics.changedPixelRatio).toBe(1);
    expect(evaluateVisualQa(metrics, "deterministic").status).toBe("FAIL");
  });
});
