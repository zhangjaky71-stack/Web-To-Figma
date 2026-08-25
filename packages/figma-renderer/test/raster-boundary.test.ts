import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import { renderBasicFigmaScene, type W2fBasicFigmaAdapter } from "../src/index.js";

function node(
  id: string,
  childIds: string[],
  options: { parentId?: string; strategy?: WtfRenderNode["renderStrategy"] } = {},
): WtfRenderNode {
  return {
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    childIds,
    sourceNodeIds: [`source-${id}`],
    kind: childIds.length > 0 ? "container" : "decoration",
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
    paint: { fills: [], opacity: 1 },
    renderStrategy: options.strategy ?? "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
  };
}

interface MockNode {
  type: "FRAME" | "RECTANGLE";
  children: MockNode[];
  pluginData: Record<string, string>;
}

class Adapter implements W2fBasicFigmaAdapter<MockNode> {
  createFrame(): MockNode {
    return { type: "FRAME", children: [], pluginData: {} };
  }
  createRectangle(): MockNode {
    return { type: "RECTANGLE", children: [], pluginData: {} };
  }
  appendChild(parent: MockNode, child: MockNode): void {
    parent.children.push(child);
  }
  setName(): void {}
  setGeometry(): void {}
  setPluginData(node: MockNode, key: string, value: string): void {
    node.pluginData[key] = value;
  }
  remove(): void {}
}

function tree(rootRaster = false): WtfRenderTree {
  return {
    rootId: "root",
    nodes: [
      node("root", ["fallback", "safe"], { strategy: rootRaster ? "raster" : "native" }),
      node("fallback", ["unsafe-child"], { parentId: "root", strategy: "raster" }),
      node("unsafe-child", [], { parentId: "fallback" }),
      node("safe", [], { parentId: "root" }),
    ],
    sections: [],
  };
}

describe("NODE-28 raster boundary transaction semantics", () => {
  it("materializes the raster boundary as a frame and suppresses only its native descendants", () => {
    const result = renderBasicFigmaScene(new Adapter(), {
      renderTree: tree(),
      profile: "balanced",
      tokenPolicy: "literal",
    });

    expect(result.createdNodeCount).toBe(3);
    expect(result.mappedRenderNodeIds).toEqual(["root", "fallback", "safe"]);
    expect(result.nodesByRenderNodeId.has("unsafe-child")).toBe(false);
    expect(result.nodesByRenderNodeId.get("fallback")?.type).toBe("FRAME");
    expect(result.nodesByRenderNodeId.get("safe")?.type).toBe("RECTANGLE");
  });

  it("suppresses the complete native subtree when the whole import root is the raster boundary", () => {
    const result = renderBasicFigmaScene(new Adapter(), {
      renderTree: tree(true),
      profile: "balanced",
      tokenPolicy: "literal",
    });

    expect(result.createdNodeCount).toBe(1);
    expect(result.mappedRenderNodeIds).toEqual(["root"]);
    expect(result.root.type).toBe("FRAME");
  });
});
