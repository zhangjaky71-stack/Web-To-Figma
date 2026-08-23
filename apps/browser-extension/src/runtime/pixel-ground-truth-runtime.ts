import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import {
  buildPixelGroundTruth,
  isPixelGroundTruth,
  planRasterTiles,
  type PixelGroundTruthCapture,
  type PixelGroundTruthDiagnostic,
  type RasterCapturedTileInput,
  type RasterHasher,
  type RasterReferenceInput,
  type RasterReferenceKind,
  type RasterTilePlan,
} from "@w2f/pixel-ground-truth";
import type { Rect } from "@w2f/w2f-schema";
import { captureHighFidelityRasterTiles } from "./cdp-runtime.js";

const MAX_RUNTIME_TILES = 20_000;

export interface RasterFallbackRequest {
  sourceNodeId: string;
  reason: string;
}

export function pixelGroundTruthSnapshotId(snapshot: RawSnapshot): string {
  return `snapshot:${snapshot.capturedAt}`;
}

export const sha256RasterBytes: RasterHasher = async (bytes) => {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

export function viewportReferenceBounds(snapshot: RawSnapshot): Rect {
  const visualViewport = snapshot.environment.layoutMetrics?.visualViewport;
  const layoutViewport = snapshot.environment.layoutMetrics?.layoutViewport;
  return {
    x: visualViewport?.pageX ?? layoutViewport?.pageX ?? 0,
    y: visualViewport?.pageY ?? layoutViewport?.pageY ?? 0,
    width: snapshot.environment.viewportWidth,
    height: snapshot.environment.viewportHeight,
  };
}

export function fullPageReferenceBounds(snapshot: RawSnapshot): Rect {
  const content = snapshot.environment.layoutMetrics?.contentSize;
  if (content && content.width > 0 && content.height > 0) return { ...content };
  const root = snapshot.nodes.find((node) => node.captureNodeId === snapshot.rootCaptureNodeId);
  if (root?.geometry && root.geometry.bounds.width > 0 && root.geometry.bounds.height > 0) {
    return { ...root.geometry.bounds };
  }
  return viewportReferenceBounds(snapshot);
}

function decodePngDataUrl(value: string): Uint8Array {
  const marker = ";base64,";
  const boundary = value.indexOf(marker);
  if (!value.startsWith("data:image/png") || boundary < 0) {
    throw new TypeError("captureVisibleTab must return a base64 PNG data URL");
  }
  const binary = atob(value.slice(boundary + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

async function openScreenshotBitmap(dataUrl: string): Promise<ImageBitmap> {
  const bytes = decodePngDataUrl(dataUrl);
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}

async function cropBitmapToPlans(
  bitmap: ImageBitmap,
  screenshotBounds: Rect,
  plans: RasterTilePlan[],
  dpr: number,
): Promise<RasterCapturedTileInput[]> {
  const captured: RasterCapturedTileInput[] = [];
  for (const plan of plans) {
    const sourceX = Math.max(0, Math.round((plan.bounds.x - screenshotBounds.x) * dpr));
    const sourceY = Math.max(0, Math.round((plan.bounds.y - screenshotBounds.y) * dpr));
    const canvas = new OffscreenCanvas(plan.pixelWidth, plan.pixelHeight);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("OffscreenCanvas 2D context unavailable for raster tiling");
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      plan.pixelWidth,
      plan.pixelHeight,
      0,
      0,
      plan.pixelWidth,
      plan.pixelHeight,
    );
    const tileBlob = await canvas.convertToBlob({ type: "image/png" });
    captured.push({
      ...plan,
      bounds: { ...plan.bounds },
      bytes: await blobBytes(tileBlob),
      mediaType: "image/png",
    });
  }
  return captured;
}

function boundedPlan(referenceId: string, bounds: Rect, dpr: number): RasterTilePlan[] {
  const plans = planRasterTiles(referenceId, bounds, dpr);
  if (plans.length > MAX_RUNTIME_TILES) {
    throw new Error(`raster reference ${referenceId} exceeds ${MAX_RUNTIME_TILES} tiles`);
  }
  return plans;
}

function containsRect(container: Rect, candidate: Rect): boolean {
  const epsilon = 1e-6;
  return (
    candidate.x >= container.x - epsilon &&
    candidate.y >= container.y - epsilon &&
    candidate.x + candidate.width <= container.x + container.width + epsilon &&
    candidate.y + candidate.height <= container.y + container.height + epsilon
  );
}

function sourceReferenceKind(node: RawNode): RasterReferenceKind {
  const tagName = node.source.tagName?.toLowerCase();
  if (tagName === "canvas") return "canvas";
  if (tagName === "video") return "video-frame";
  return "node-fallback";
}

function collectFallbackRequests(
  snapshot: RawSnapshot,
  requested: RasterFallbackRequest[],
): Array<{ node: RawNode; kind: RasterReferenceKind; reason: string }> {
  const reasons = new Map<string, string[]>();
  for (const request of requested) {
    const sourceNodeId = request.sourceNodeId.trim();
    const reason = request.reason.trim();
    if (!sourceNodeId || !reason) continue;
    reasons.set(sourceNodeId, [...(reasons.get(sourceNodeId) ?? []), reason]);
  }
  for (const node of snapshot.nodes) {
    const tagName = node.source.tagName?.toLowerCase();
    if (tagName !== "canvas" && tagName !== "video") continue;
    const reason = tagName === "canvas" ? "canvas-or-webgl-render-surface" : "video-current-frame";
    reasons.set(node.captureNodeId, [...(reasons.get(node.captureNodeId) ?? []), reason]);
  }

  const nodeById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  return [...reasons.entries()]
    .flatMap(([sourceNodeId, nodeReasons]) => {
      const node = nodeById.get(sourceNodeId);
      if (!node) return [];
      return [
        {
          node,
          kind: sourceReferenceKind(node),
          reason: [...new Set(nodeReasons)].sort().join(";"),
        },
      ];
    })
    .sort((left, right) => left.node.captureNodeId.localeCompare(right.node.captureNodeId));
}

function sourceBounds(
  sourceNodeId: string,
  node: RawNode,
  diagnostics: PixelGroundTruthDiagnostic[],
): Rect | null {
  const bounds = node.geometry?.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    diagnostics.push({
      code: "RASTER_SOURCE_NODE_UNRESOLVED",
      message: "Raster source node has no positive captured geometry.",
      sourceNodeId,
    });
    return null;
  }
  return { ...bounds };
}

function sourceReferenceId(kind: RasterReferenceKind, sourceNodeId: string): string {
  return `${kind}:${encodeURIComponent(sourceNodeId)}`;
}

async function captureStandardReferences(
  snapshot: RawSnapshot,
  dpr: number,
  requested: RasterFallbackRequest[],
  diagnostics: PixelGroundTruthDiagnostic[],
): Promise<RasterReferenceInput[]> {
  const viewportBounds = viewportReferenceBounds(snapshot);
  const viewportId = "viewport:current";
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
  const bitmap = await openScreenshotBitmap(dataUrl);
  try {
    const expectedWidth = Math.max(1, Math.ceil(viewportBounds.width * dpr));
    const expectedHeight = Math.max(1, Math.ceil(viewportBounds.height * dpr));
    if (
      Math.abs(bitmap.width - expectedWidth) > 1 ||
      Math.abs(bitmap.height - expectedHeight) > 1
    ) {
      throw new Error(
        `visible screenshot scale mismatch: got ${bitmap.width}x${bitmap.height}, expected ${expectedWidth}x${expectedHeight}`,
      );
    }

    const viewportPlans = boundedPlan(viewportId, viewportBounds, dpr);
    const references: RasterReferenceInput[] = [
      {
        id: viewportId,
        kind: "viewport",
        viewportId,
        bounds: viewportBounds,
        dpr,
        tiles: await cropBitmapToPlans(bitmap, viewportBounds, viewportPlans, dpr),
      },
    ];

    for (const source of collectFallbackRequests(snapshot, requested)) {
      const bounds = sourceBounds(source.node.captureNodeId, source.node, diagnostics);
      if (!bounds) continue;
      const id = sourceReferenceId(source.kind, source.node.captureNodeId);
      if (!containsRect(viewportBounds, bounds)) {
        diagnostics.push({
          code: "RASTER_UNSUPPORTED_SOURCE",
          message:
            "Standard capture cannot safely rasterize an off-viewport source without scrolling the page.",
          referenceId: id,
          sourceNodeId: source.node.captureNodeId,
        });
        continue;
      }
      const plans = boundedPlan(id, bounds, dpr);
      references.push({
        id,
        kind: source.kind,
        viewportId,
        bounds,
        dpr,
        sourceNodeId: source.node.captureNodeId,
        reason: source.reason,
        tiles: await cropBitmapToPlans(bitmap, viewportBounds, plans, dpr),
      });
    }
    return references;
  } finally {
    bitmap.close();
  }
}

async function captureHighFidelityReferences(
  tabId: number,
  snapshot: RawSnapshot,
  dpr: number,
  requested: RasterFallbackRequest[],
  diagnostics: PixelGroundTruthDiagnostic[],
): Promise<RasterReferenceInput[]> {
  const viewportBounds = viewportReferenceBounds(snapshot);
  const viewportId = "viewport:current";
  const viewportPlans = boundedPlan(viewportId, viewportBounds, dpr);
  const references: RasterReferenceInput[] = [
    {
      id: viewportId,
      kind: "viewport",
      viewportId,
      bounds: viewportBounds,
      dpr,
      tiles: await captureHighFidelityRasterTiles(tabId, viewportPlans, dpr),
    },
  ];

  if (snapshot.captureTarget.type === "document") {
    const fullBounds = fullPageReferenceBounds(snapshot);
    const fullId = "full-page:current";
    const fullPlans = boundedPlan(fullId, fullBounds, dpr);
    references.push({
      id: fullId,
      kind: "full-page",
      viewportId,
      bounds: fullBounds,
      dpr,
      tiles: await captureHighFidelityRasterTiles(tabId, fullPlans, dpr),
    });
  }

  for (const source of collectFallbackRequests(snapshot, requested)) {
    const bounds = sourceBounds(source.node.captureNodeId, source.node, diagnostics);
    if (!bounds) continue;
    const id = sourceReferenceId(source.kind, source.node.captureNodeId);
    try {
      const plans = boundedPlan(id, bounds, dpr);
      references.push({
        id,
        kind: source.kind,
        viewportId,
        bounds,
        dpr,
        sourceNodeId: source.node.captureNodeId,
        reason: source.reason,
        tiles: await captureHighFidelityRasterTiles(tabId, plans, dpr),
      });
    } catch (error) {
      diagnostics.push({
        code: "RASTER_CAPTURE_FAILED",
        message: `High Fidelity source raster capture failed: ${error instanceof Error ? error.message : String(error)}`,
        referenceId: id,
        sourceNodeId: source.node.captureNodeId,
      });
    }
  }

  return references;
}

function requireCompleteReference(
  capture: PixelGroundTruthCapture,
  kind: "viewport" | "full-page",
  id: string,
  bounds: Rect,
  dpr: number,
): void {
  const expectedCount = boundedPlan(id, bounds, dpr).length;
  const reference = capture.references.find((item) => item.id === id && item.kind === kind);
  const hasMissingDiagnostic = capture.diagnostics.some(
    (diagnostic) => diagnostic.code === "RASTER_TILE_MISSING" && diagnostic.referenceId === id,
  );
  if (!reference || reference.tiles.length !== expectedCount || hasMissingDiagnostic) {
    throw new Error(
      `PixelGroundTruth ${kind} reference ${id} is incomplete: ${reference?.tiles.length ?? 0}/${expectedCount} tiles`,
    );
  }
}

export async function capturePixelGroundTruthForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
  fallbackRequests: RasterFallbackRequest[] = [],
): Promise<PixelGroundTruthCapture> {
  const dpr = snapshot.environment.scale.context.devicePixelRatio;
  const viewportBounds = viewportReferenceBounds(snapshot);
  const diagnostics: PixelGroundTruthDiagnostic[] = [];
  const references =
    snapshot.adapter === "cdp"
      ? await captureHighFidelityReferences(tabId, snapshot, dpr, fallbackRequests, diagnostics)
      : await captureStandardReferences(snapshot, dpr, fallbackRequests, diagnostics);
  const capture = await buildPixelGroundTruth(
    {
      adapter: snapshot.adapter,
      snapshotId: pixelGroundTruthSnapshotId(snapshot),
      references,
      diagnostics,
      maxTiles: MAX_RUNTIME_TILES,
      maxTotalBytes: 512 * 1024 * 1024,
    },
    sha256RasterBytes,
  );
  if (!isPixelGroundTruth(capture)) throw new Error("PixelGroundTruth sidecar validation failed");
  requireCompleteReference(capture, "viewport", "viewport:current", viewportBounds, dpr);
  if (snapshot.adapter === "cdp" && snapshot.captureTarget.type === "document") {
    requireCompleteReference(
      capture,
      "full-page",
      "full-page:current",
      fullPageReferenceBounds(snapshot),
      dpr,
    );
  }
  return capture;
}
