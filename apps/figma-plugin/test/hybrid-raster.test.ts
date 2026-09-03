import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import {
  createHybridRasterPlan,
  effectiveSelectedRootIds,
  renderTreeForNativePass,
  W2fHybridRasterError,
} from "../src/figma-hybrid-renderer.js";
import { isW2fRasterReferenceEvidence, type W2fRasterReferenceEvidence } from "../src/protocol.js";

function renderNode(
  id: string,
  bounds: { x: number; y: number; width: number; height: number },
  childIds: string[],
  options: {
    parentId?: string;
    strategy?: WtfRenderNode["renderStrategy"];
    sourceNodeId?: string;
  } = {},
): WtfRenderNode {
  return {
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    childIds,
    sourceNodeIds: [options.sourceNodeId ?? `source-${id}`],
    kind: childIds.length > 0 ? "container" : "decoration",
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
    renderStrategy: options.strategy ?? "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
    assetRefs: [`asset-${id}`],
  };
}

function tree(): WtfRenderTree {
  return {
    rootId: "root",
    nodes: [
      renderNode("root", { x: 0, y: 0, width: 500, height: 500 }, ["fallback"]),
      renderNode("fallback", { x: 100, y: 120, width: 200, height: 160 }, ["child"], {
        parentId: "root",
        strategy: "raster",
        sourceNodeId: "source-fallback",
      }),
      renderNode("child", { x: 110, y: 130, width: 20, height: 20 }, [], {
        parentId: "fallback",
      }),
    ],
    sections: [],
  };
}

function reference(
  overrides: Partial<W2fRasterReferenceEvidence> = {},
): W2fRasterReferenceEvidence {
  return {
    id: "ref-fallback",
    kind: "node-fallback",
    viewportId: "viewport-1",
    bounds: { x: 100, y: 120, width: 200, height: 160 },
    dpr: 2,
    sourceNodeId: "source-fallback",
    reason: "unsupported blend boundary",
    tiles: [
      {
        id: "tile-1",
        path: "references/tiles/tile-1.png",
        viewportId: "viewport-1",
        bounds: { x: 100, y: 120, width: 200, height: 160 },
        dpr: 2,
        sha256: "a".repeat(64),
      },
    ],
    ...overrides,
  };
}

describe("NODE-28 hybrid raster planning", () => {
  it("escalates a selected descendant to the nearest minimal raster boundary", () => {
    expect(effectiveSelectedRootIds(tree(), "selected-roots", ["child"])).toEqual(["fallback"]);
  });

  it("strips text/assets only when a balanced raster boundary has an explicit visual dependency", () => {
    const source = tree();
    const fallback = source.nodes.find((item) => item.id === "fallback")!;
    fallback.text = { value: "unsafe", runs: [], fragments: [] };
    fallback.renderDecision.reasons = [
      "mix-blend-mode depends on sibling/ancestor backdrop pixels",
    ];
    const nativePass = renderTreeForNativePass(source, "balanced");
    const sanitized = nativePass.nodes.find((item) => item.id === "fallback")!;
    expect(sanitized.text).toBeUndefined();
    expect(sanitized.assetRefs).toEqual([]);
    expect(source.nodes.find((item) => item.id === "fallback")?.assetRefs).toEqual([
      "asset-fallback",
    ]);
  });

  it("preserves text natively and omits the raster surface when only text-quality reasons exist", () => {
    const source = tree();
    const fallback = source.nodes.find((item) => item.id === "fallback")!;
    fallback.text = { value: "editable", runs: [], fragments: [] };
    fallback.renderDecision.reasons = [
      "font substitution mismatch",
      "pixel similarity score improved by raster",
    ];

    const nativePass = renderTreeForNativePass(source, "high-fidelity");
    const preserved = nativePass.nodes.find((item) => item.id === "fallback")!;
    expect(preserved.text?.value).toBe("editable");
    expect(preserved.renderStrategy).toBe("native");
    expect(preserved.assetRefs).toEqual(["asset-fallback"]);

    const plan = createHybridRasterPlan(
      source,
      ["root", "fallback"],
      {
        references: [reference()],
        tilePayloadsByPath: { "references/tiles/tile-1.png": new Uint8Array([1, 2, 3]) },
      },
      "high-fidelity",
    );
    expect(plan.surfaces).toEqual([]);
    expect(plan.nativePreserved).toHaveLength(1);
    expect(plan.nativePreserved[0]).toMatchObject({
      boundaryRenderNodeId: "fallback",
      status: "native-preserved",
      profile: "high-fidelity",
    });
  });

  it("binds a raster render node to source-scoped local evidence and verified tile bytes", () => {
    const plan = createHybridRasterPlan(tree(), ["root", "fallback"], {
      references: [reference()],
      tilePayloadsByPath: { "references/tiles/tile-1.png": new Uint8Array([1, 2, 3]) },
    });
    expect(plan.surfaces).toHaveLength(1);
    expect(plan.surfaces[0]?.renderNodeId).toBe("fallback");
    expect(plan.surfaces[0]?.reference.kind).toBe("node-fallback");
    expect(plan.surfaces[0]?.tiles[0]?.id).toBe("tile-1");
  });

  it("fails closed when local evidence does not cover the fallback boundary", () => {
    expect(() =>
      createHybridRasterPlan(tree(), ["root", "fallback"], {
        references: [reference({ bounds: { x: 100, y: 120, width: 40, height: 40 } })],
        tilePayloadsByPath: { "references/tiles/tile-1.png": new Uint8Array([1]) },
      }),
    ).toThrowError(W2fHybridRasterError);
  });

  it("rejects full-page evidence at the protocol boundary", () => {
    expect(
      isW2fRasterReferenceEvidence({
        ...reference(),
        kind: "full-page",
      }),
    ).toBe(false);
  });
});
