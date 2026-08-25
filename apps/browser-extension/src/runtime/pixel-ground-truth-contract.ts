import { planRasterTiles, type PixelGroundTruthCapture } from "@w2f/pixel-ground-truth";
import type { RawSnapshot } from "@w2f/capture-core";
import type { Rect, WtfReferenceTileDescriptor } from "@w2f/w2f-schema";

const EPSILON = 1e-9;

function sameBounds(left: Rect, right: Rect): boolean {
  return (
    Math.abs(left.x - right.x) <= EPSILON &&
    Math.abs(left.y - right.y) <= EPSILON &&
    Math.abs(left.width - right.width) <= EPSILON &&
    Math.abs(left.height - right.height) <= EPSILON
  );
}

function viewportBounds(snapshot: RawSnapshot): Rect {
  const visualViewport = snapshot.environment.layoutMetrics?.visualViewport;
  const layoutViewport = snapshot.environment.layoutMetrics?.layoutViewport;
  return {
    x: visualViewport?.pageX ?? layoutViewport?.pageX ?? 0,
    y: visualViewport?.pageY ?? layoutViewport?.pageY ?? 0,
    width: snapshot.environment.viewportWidth,
    height: snapshot.environment.viewportHeight,
  };
}

function fullPageBounds(snapshot: RawSnapshot): Rect {
  const content = snapshot.environment.layoutMetrics?.contentSize;
  if (content && content.width > 0 && content.height > 0) return { ...content };
  const root = snapshot.nodes.find((node) => node.captureNodeId === snapshot.rootCaptureNodeId);
  if (root?.geometry && root.geometry.bounds.width > 0 && root.geometry.bounds.height > 0) {
    return { ...root.geometry.bounds };
  }
  return viewportBounds(snapshot);
}

function tileResourceMap(
  capture: PixelGroundTruthCapture,
): Map<string, (typeof capture.tileResources)[number]> {
  const resources = new Map<string, (typeof capture.tileResources)[number]>();
  for (const resource of capture.tileResources) {
    if (resources.has(resource.path)) {
      throw new Error(`PixelGroundTruth duplicates tile resource path ${resource.path}`);
    }
    if (resource.bytes.length === 0) {
      throw new Error(`PixelGroundTruth tile resource ${resource.path} is empty`);
    }
    resources.set(resource.path, resource);
  }
  return resources;
}

function assertDescriptorResource(
  tile: WtfReferenceTileDescriptor,
  resources: Map<string, { sha256: string; path: string; bytes: number[] }>,
): void {
  const resource = resources.get(tile.path);
  if (!resource) throw new Error(`PixelGroundTruth tile ${tile.id} has no resource ${tile.path}`);
  if (resource.sha256 !== tile.sha256) {
    throw new Error(`PixelGroundTruth tile ${tile.id} checksum disagrees with ${tile.path}`);
  }
}

function requireReference(
  capture: PixelGroundTruthCapture,
  id: string,
  kind: "viewport" | "full-page",
  bounds: Rect,
  dpr: number,
  resources: Map<string, (typeof capture.tileResources)[number]>,
): void {
  const reference = capture.references.find((item) => item.id === id && item.kind === kind);
  if (!reference) throw new Error(`PixelGroundTruth requires ${kind} reference ${id}`);
  if (reference.viewportId !== "viewport:current") {
    throw new Error(`PixelGroundTruth ${id} must use viewport:current`);
  }
  if (!sameBounds(reference.bounds, bounds) || Math.abs(reference.dpr - dpr) > EPSILON) {
    throw new Error(`PixelGroundTruth ${id} geometry does not match the captured snapshot`);
  }

  const expected = planRasterTiles(id, bounds, dpr, capture.tileSizePx);
  const actualById = new Map(reference.tiles.map((tile) => [tile.id, tile]));
  if (actualById.size !== reference.tiles.length || reference.tiles.length !== expected.length) {
    throw new Error(`PixelGroundTruth ${id} tile inventory is incomplete`);
  }
  for (const plan of expected) {
    const tile = actualById.get(plan.id);
    if (!tile || !sameBounds(tile.bounds, plan.bounds) || Math.abs(tile.dpr - dpr) > EPSILON) {
      throw new Error(`PixelGroundTruth ${id} is missing deterministic tile ${plan.id}`);
    }
    assertDescriptorResource(tile, resources);
  }
  if (
    capture.diagnostics.some(
      (diagnostic) => diagnostic.code === "RASTER_TILE_MISSING" && diagnostic.referenceId === id,
    )
  ) {
    throw new Error(`PixelGroundTruth ${id} contains a missing-tile diagnostic`);
  }
}

export function assertProfileRequiredPixelGroundTruth(
  snapshot: RawSnapshot,
  capture: PixelGroundTruthCapture,
): void {
  if (capture.adapter !== snapshot.adapter) {
    throw new Error(
      `PixelGroundTruth adapter ${capture.adapter} does not match snapshot adapter ${snapshot.adapter}`,
    );
  }
  const expectedSnapshotId = `snapshot:${snapshot.capturedAt}`;
  if (capture.snapshotId !== expectedSnapshotId) {
    throw new Error(
      `PixelGroundTruth snapshotId ${capture.snapshotId} does not match ${expectedSnapshotId}`,
    );
  }

  const resources = tileResourceMap(capture);
  const referencedPaths = new Set<string>();
  for (const reference of capture.references) {
    for (const tile of reference.tiles) {
      assertDescriptorResource(tile, resources);
      referencedPaths.add(tile.path);
    }
  }
  for (const resource of capture.tileResources) {
    if (!referencedPaths.has(resource.path)) {
      throw new Error(`PixelGroundTruth contains unreferenced tile resource ${resource.path}`);
    }
  }

  const dpr = snapshot.environment.scale.context.devicePixelRatio;
  requireReference(
    capture,
    "viewport:current",
    "viewport",
    viewportBounds(snapshot),
    dpr,
    resources,
  );
  if (snapshot.adapter === "cdp" && snapshot.captureTarget.type === "document") {
    requireReference(
      capture,
      "full-page:current",
      "full-page",
      fullPageBounds(snapshot),
      dpr,
      resources,
    );
  }
}
