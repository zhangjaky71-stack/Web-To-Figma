import { describe, expect, it } from "vitest";
import type {
  WtfIrBundle,
  WtfRenderNode,
  WtfRenderTree,
} from "@w2f/w2f-ir";
import { createHybridRasterPlan } from "../src/hybrid/planner.js";

type Tile = WtfIrBundle["assets"]["referenceTiles"][number];

function node(
  id: string,
  bounds: { x: number; y: number; width: number; height: number },
  options: {
    parentId?: string;
    childIds?: string[];
    sourceNodeIds?: string[];
    renderStrategy?: WtfRenderNode["renderStrategy"];
  } = {},
): WtfRenderNode {
  return {
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    childIds: options.childIds ?? [],
    sourceNodeIds: options.sourceNodeIds ?? [`source-${id}`],
    kind: "container",
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

function tree(nodes: WtfRenderNode[], rootId = nodes[0]?.id ?? "root"): WtfRenderTree {
  return { rootId, nodes, sections: [] };
}

function tile(
  referenceId: string,
  row: number,
  column: number,
  bounds: { x: number; y: number; width: number; height: number },
): Tile {
  return {
    id: `${referenceId}:r${row}:c${column}`,
    path: `references/${referenceId.replace(/[^a-z0-9]/gi, "-")}-${row}-${column}.png`,
    viewportId: "viewport:current",
    bounds,
    dpr: 2,
    sha256: `${row}${column}`.padEnd(64, "a"),
  };
}

describe("NODE-28 hybrid raster planner", () => {
  it("maps an explicit raster boundary to its source-addressed packaged tile", () => {
    const raster = node(
      "fallback",
      { x: 10, y: 20, width: 100, height: 60 },
      { sourceNodeIds: ["capture:hero"], renderStrategy: "raster" },
    );
    const referenceId = `node-fallback:${encodeURIComponent("capture:hero")}`;
    const plan = createHybridRasterPlan({
      renderTree: tree([raster]),
      referenceTiles: [tile(referenceId, 0, 0, raster.geometry.bounds)],
    });

    expect(plan).toMatchObject({
      readyBoundaryCount: 1,
      missingBoundaryCount: 0,
      tileCount: 1,
    });
    expect(plan.boundaries[0]).toMatchObject({
      state: "ready",
      renderNodeId: "fallback",
      sourceNodeId: "capture:hero",
      referenceId,
      tiles: [{ row: 0, column: 0, localX: 0, localY: 0, width: 100, height: 60 }],
    });
  });

  it("reconstructs multi-tile boundaries in deterministic row-major local coordinates", () => {
    const raster = node(
      "fallback",
      { x: 100, y: 200, width: 120, height: 80 },
      { sourceNodeIds: ["source-grid"], renderStrategy: "raster" },
    );
    const referenceId = "node-fallback:source-grid";
    const plan = createHybridRasterPlan({
      renderTree: tree([raster]),
      referenceTiles: [
        tile(referenceId, 1, 1, { x: 160, y: 240, width: 60, height: 40 }),
        tile(referenceId, 0, 0, { x: 100, y: 200, width: 60, height: 40 }),
        tile(referenceId, 1, 0, { x: 100, y: 240, width: 60, height: 40 }),
        tile(referenceId, 0, 1, { x: 160, y: 200, width: 60, height: 40 }),
      ],
    });

    const boundary = plan.boundaries[0];
    expect(boundary?.state).toBe("ready");
    if (boundary?.state !== "ready") return;
    expect(
      boundary.tiles.map((item) => [item.row, item.column, item.localX, item.localY]),
    ).toEqual([
      [0, 0, 0, 0],
      [0, 1, 60, 0],
      [1, 0, 0, 40],
      [1, 1, 60, 40],
    ]);
  });

  it("matches URL-sensitive source ids through the browser capture reference convention", () => {
    const sourceNodeId = "frame:hero/card 1";
    const raster = node(
      "fallback",
      { x: 0, y: 0, width: 20, height: 20 },
      { sourceNodeIds: [sourceNodeId], renderStrategy: "raster" },
    );
    const referenceId = `node-fallback:${encodeURIComponent(sourceNodeId)}`;
    const plan = createHybridRasterPlan({
      renderTree: tree([raster]),
      referenceTiles: [tile(referenceId, 0, 0, raster.geometry.bounds)],
    });
    expect(plan.boundaries[0]).toMatchObject({
      state: "ready",
      sourceNodeId,
      referenceId,
    });
  });

  it("accepts canvas/video reference kinds without confusing viewport/full-page references", () => {
    const raster = node(
      "canvas",
      { x: 5, y: 7, width: 40, height: 30 },
      { sourceNodeIds: ["source-canvas"], renderStrategy: "raster" },
    );
    const plan = createHybridRasterPlan({
      renderTree: tree([raster]),
      referenceTiles: [
        tile("viewport:current", 0, 0, raster.geometry.bounds),
        tile("canvas:source-canvas", 0, 0, raster.geometry.bounds),
      ],
    });
    expect(plan.boundaries[0]).toMatchObject({
      state: "ready",
      referenceId: "canvas:source-canvas",
    });
  });

  it("keeps the native subtree when packaged raster evidence is incomplete", () => {
    const raster = node(
      "fallback",
      { x: 0, y: 0, width: 100, height: 40 },
      { sourceNodeIds: ["source-missing"], renderStrategy: "raster" },
    );
    const referenceId = "node-fallback:source-missing";
    const plan = createHybridRasterPlan({
      renderTree: tree([raster]),
      referenceTiles: [tile(referenceId, 0, 1, { x: 50, y: 0, width: 50, height: 40 })],
    });
    expect(plan).toMatchObject({
      readyBoundaryCount: 0,
      missingBoundaryCount: 1,
      tileCount: 0,
    });
    expect(plan.boundaries[0]).toMatchObject({
      state: "missing",
      renderNodeId: "fallback",
    });
  });

  it("suppresses nested raster roots because the outer NODE-20 boundary already owns the subtree", () => {
    const outer = node(
      "outer",
      { x: 0, y: 0, width: 100, height: 100 },
      {
        childIds: ["inner"],
        sourceNodeIds: ["source-outer"],
        renderStrategy: "raster",
      },
    );
    const inner = node(
      "inner",
      { x: 10, y: 10, width: 20, height: 20 },
      {
        parentId: "outer",
        sourceNodeIds: ["source-inner"],
        renderStrategy: "raster",
      },
    );
    const plan = createHybridRasterPlan({
      renderTree: tree([outer, inner]),
      referenceTiles: [tile("node-fallback:source-outer", 0, 0, outer.geometry.bounds)],
    });
    expect(plan.boundaries).toHaveLength(1);
    expect(plan.boundaries[0]).toMatchObject({
      renderNodeId: "outer",
      descendantRenderNodeIds: ["inner"],
    });
  });

  it("ignores native nodes even when a pixel reference exists", () => {
    const native = node("native", { x: 0, y: 0, width: 20, height: 20 });
    const plan = createHybridRasterPlan({
      renderTree: tree([native]),
      referenceTiles: [tile("node-fallback:source-native", 0, 0, native.geometry.bounds)],
    });
    expect(plan).toEqual({
      boundaries: [],
      readyBoundaryCount: 0,
      missingBoundaryCount: 0,
      tileCount: 0,
    });
  });
});
