import { describe, expect, it } from "vitest";
import {
  buildPixelGroundTruth,
  isPixelGroundTruth,
  planRasterTiles,
  summarizePixelGroundTruth,
  toWtfReferenceTileDescriptors,
  type RasterCapturedTileInput,
  type RasterHasher,
  type RasterTilePlan,
} from "../src/index.js";

const hashBytes: RasterHasher = async (bytes) => {
  const seed = [...bytes].reduce((total, value) => (total + value) % 16, 0).toString(16);
  return seed.repeat(64);
};

function captured(plan: RasterTilePlan, bytes: number[]): RasterCapturedTileInput {
  return { ...plan, bounds: { ...plan.bounds }, bytes, mediaType: "image/png" };
}

describe("pixel ground truth", () => {
  it("plans deterministic 2048 device-pixel tiles at DPR 2", () => {
    const tiles = planRasterTiles("viewport:main", { x: 0, y: 0, width: 1200, height: 900 }, 2);

    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toEqual({
      id: "viewport:main:r0:c0",
      row: 0,
      column: 0,
      bounds: { x: 0, y: 0, width: 1024, height: 900 },
      pixelWidth: 2048,
      pixelHeight: 1800,
    });
    expect(tiles[1]).toEqual({
      id: "viewport:main:r0:c1",
      row: 0,
      column: 1,
      bounds: { x: 1024, y: 0, width: 176, height: 900 },
      pixelWidth: 352,
      pixelHeight: 1800,
    });
  });

  it("tiles large full-page references in stable row-major order", () => {
    const tiles = planRasterTiles("full:main", { x: 0, y: 0, width: 4096, height: 3072 }, 1);

    expect(tiles.map((tile) => tile.id)).toEqual([
      "full:main:r0:c0",
      "full:main:r0:c1",
      "full:main:r1:c0",
      "full:main:r1:c1",
    ]);
    expect(tiles[3]?.bounds).toEqual({ x: 2048, y: 2048, width: 2048, height: 1024 });
  });

  it("deduplicates identical tile bytes while preserving reference descriptors", async () => {
    const viewportPlan = planRasterTiles(
      "viewport:main",
      { x: 0, y: 0, width: 100, height: 100 },
      1,
    )[0]!;
    const fallbackPlan = planRasterTiles(
      "fallback:hero",
      { x: 10, y: 20, width: 100, height: 100 },
      1,
    )[0]!;

    const capture = await buildPixelGroundTruth(
      {
        adapter: "cdp",
        snapshotId: "snapshot:2026-08-23T00:00:00.000Z",
        references: [
          {
            id: "viewport:main",
            kind: "viewport",
            viewportId: "viewport:main",
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            dpr: 1,
            tiles: [captured(viewportPlan, [1, 2, 3])],
          },
          {
            id: "fallback:hero",
            kind: "node-fallback",
            viewportId: "viewport:main",
            sourceNodeId: "node:hero",
            reason: "asset-bytes-unavailable",
            bounds: { x: 10, y: 20, width: 100, height: 100 },
            dpr: 1,
            tiles: [captured(fallbackPlan, [1, 2, 3])],
          },
        ],
      },
      hashBytes,
    );

    expect(isPixelGroundTruth(capture)).toBe(true);
    expect(capture.tileResources).toHaveLength(1);
    expect(capture.references).toHaveLength(2);
    expect(capture.references[0]?.tiles[0]?.path).toBe(capture.references[1]?.tiles[0]?.path);
    expect(capture.tileResources[0]?.path).toMatch(/^references\/[a-f0-9]{64}\.png$/);

    const summary = summarizePixelGroundTruth(capture);
    expect(summary.referenceCount).toBe(2);
    expect(summary.viewportReferenceCount).toBe(1);
    expect(summary.fallbackReferenceCount).toBe(1);
    expect(summary.tileReferenceCount).toBe(2);
    expect(summary.uniqueTileCount).toBe(1);
    expect(toWtfReferenceTileDescriptors(capture)).toHaveLength(2);
  });

  it("rejects captured tiles that drift from the deterministic plan", async () => {
    const plan = planRasterTiles("viewport:main", { x: 0, y: 0, width: 100, height: 100 }, 1)[0]!;
    const drifted = captured(plan, [9, 9, 9]);
    drifted.bounds = { ...drifted.bounds, width: 99 };

    const capture = await buildPixelGroundTruth(
      {
        adapter: "standard",
        snapshotId: "snapshot:test",
        references: [
          {
            id: "viewport:main",
            kind: "viewport",
            viewportId: "viewport:main",
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            dpr: 1,
            tiles: [drifted],
          },
        ],
      },
      hashBytes,
    );

    expect(capture.references[0]?.tiles).toEqual([]);
    expect(capture.diagnostics.some((item) => item.code === "RASTER_TILE_INVALID")).toBe(true);
  });
});
