import type { RawSnapshot } from "@w2f/capture-core";
import { describe, expect, it } from "vitest";
import {
  fullPageReferenceBounds,
  pixelGroundTruthSnapshotId,
  sha256RasterBytes,
  viewportReferenceBounds,
} from "../src/runtime/pixel-ground-truth-runtime.js";

function snapshot(adapter: "standard" | "cdp" = "cdp"): RawSnapshot {
  return {
    version: "1.0.0",
    adapter,
    capturedAt: "2026-08-23T06:50:00.000Z",
    url: "https://example.com/",
    title: "Pixel Ground Truth",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1280,
      viewportHeight: 720,
      scale: {
        context: { devicePixelRatio: 2 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
      layoutMetrics: {
        contentSize: { x: 0, y: 0, width: 1280, height: 4200 },
        layoutViewport: { pageX: 0, pageY: 240, clientWidth: 1280, clientHeight: 720 },
        visualViewport: {
          offsetX: 0,
          offsetY: 0,
          pageX: 0,
          pageY: 240,
          clientWidth: 1280,
          clientHeight: 720,
          scale: 1,
        },
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width: 1280, height: 4200 } },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("Browser Pixel Ground Truth runtime", () => {
  it("uses RawSnapshot timestamp as stable sidecar identity", () => {
    expect(pixelGroundTruthSnapshotId(snapshot())).toBe("snapshot:2026-08-23T06:50:00.000Z");
  });

  it("anchors viewport references in document CSS coordinates", () => {
    expect(viewportReferenceBounds(snapshot())).toEqual({
      x: 0,
      y: 240,
      width: 1280,
      height: 720,
    });
  });

  it("prefers captured contentSize for full-page ground truth", () => {
    expect(fullPageReferenceBounds(snapshot())).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 4200,
    });
  });

  it("computes canonical lowercase SHA-256 digests", async () => {
    await expect(sha256RasterBytes(new TextEncoder().encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
