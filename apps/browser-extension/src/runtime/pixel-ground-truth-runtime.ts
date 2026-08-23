import type { RawSnapshot } from "@w2f/capture-core";
import {
  buildPixelGroundTruth,
  isPixelGroundTruth,
  planRasterTiles,
  type PixelGroundTruthCapture,
  type RasterCapturedTileInput,
  type RasterHasher,
  type RasterReferenceInput,
  type RasterTilePlan,
} from "@w2f/pixel-ground-truth";
import type { Rect } from "@w2f/w2f-schema";
import { captureHighFidelityRasterTiles } from "./cdp-runtime.js";

const MAX_RUNTIME_TILES = 20_000;

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

async function cropViewportScreenshot(
  dataUrl: string,
  referenceBounds: Rect,
  plans: RasterTilePlan[],
  dpr: number,
): Promise<RasterCapturedTileInput[]> {
  const bytes = decodePngDataUrl(dataUrl);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    const expectedWidth = Math.max(1, Math.ceil(referenceBounds.width * dpr));
    const expectedHeight = Math.max(1, Math.ceil(referenceBounds.height * dpr));
    if (
      Math.abs(bitmap.width - expectedWidth) > 1 ||
      Math.abs(bitmap.height - expectedHeight) > 1
    ) {
      throw new Error(
        `visible screenshot scale mismatch: got ${bitmap.width}x${bitmap.height}, expected ${expectedWidth}x${expectedHeight}`,
      );
    }

    const captured: RasterCapturedTileInput[] = [];
    for (const plan of plans) {
      const sourceX = Math.max(0, Math.round((plan.bounds.x - referenceBounds.x) * dpr));
      const sourceY = Math.max(0, Math.round((plan.bounds.y - referenceBounds.y) * dpr));
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
  } finally {
    bitmap.close();
  }
}

function boundedPlan(referenceId: string, bounds: Rect, dpr: number): RasterTilePlan[] {
  const plans = planRasterTiles(referenceId, bounds, dpr);
  if (plans.length > MAX_RUNTIME_TILES) {
    throw new Error(`raster reference ${referenceId} exceeds ${MAX_RUNTIME_TILES} tiles`);
  }
  return plans;
}

async function captureStandardViewportReference(
  snapshot: RawSnapshot,
  dpr: number,
): Promise<RasterReferenceInput> {
  const bounds = viewportReferenceBounds(snapshot);
  const id = "viewport:current";
  const plans = boundedPlan(id, bounds, dpr);
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
  return {
    id,
    kind: "viewport",
    viewportId: id,
    bounds,
    dpr,
    tiles: await cropViewportScreenshot(dataUrl, bounds, plans, dpr),
  };
}

async function captureHighFidelityReferences(
  tabId: number,
  snapshot: RawSnapshot,
  dpr: number,
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

  return references;
}

export async function capturePixelGroundTruthForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<PixelGroundTruthCapture> {
  const dpr = snapshot.environment.scale.context.devicePixelRatio;
  const references =
    snapshot.adapter === "cdp"
      ? await captureHighFidelityReferences(tabId, snapshot, dpr)
      : [await captureStandardViewportReference(snapshot, dpr)];
  const capture = await buildPixelGroundTruth(
    {
      adapter: snapshot.adapter,
      snapshotId: pixelGroundTruthSnapshotId(snapshot),
      references,
      maxTiles: MAX_RUNTIME_TILES,
      maxTotalBytes: 512 * 1024 * 1024,
    },
    sha256RasterBytes,
  );
  if (!isPixelGroundTruth(capture)) throw new Error("PixelGroundTruth sidecar validation failed");
  if (!capture.references.some((reference) => reference.kind === "viewport" && reference.tiles.length)) {
    throw new Error("PixelGroundTruth requires a non-empty viewport reference");
  }
  if (
    snapshot.adapter === "cdp" &&
    snapshot.captureTarget.type === "document" &&
    !capture.references.some((reference) => reference.kind === "full-page" && reference.tiles.length)
  ) {
    throw new Error("High Fidelity document capture requires a non-empty full-page reference");
  }
  return capture;
}
