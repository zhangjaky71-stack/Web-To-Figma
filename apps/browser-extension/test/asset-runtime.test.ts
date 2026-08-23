import type { RawSnapshot } from "@w2f/capture-core";
import { describe, expect, it } from "vitest";
import {
  assetSnapshotId,
  buildStandardAssetInput,
  sha256AssetBytes,
} from "../src/runtime/asset-runtime.js";

function snapshot(adapter: "standard" | "cdp" = "standard"): RawSnapshot {
  return {
    version: "1.0.0",
    adapter,
    capturedAt: "2026-08-23T05:30:00.000Z",
    url: "https://example.com/",
    title: "Assets",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1280,
      viewportHeight: 720,
      scale: {
        context: { devicePixelRatio: 1 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["node:image"],
        frameContext: { frameId: "root" },
        source: {},
      },
      {
        captureNodeId: "node:image",
        kind: "element",
        relationships: { sourceParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "img", sourceSelector: "#hero", attributes: { src: "hero.png" } },
      },
    ],
    frames: [
      { context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true },
    ],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("Browser asset runtime", () => {
  it("uses the RawSnapshot timestamp as the stable asset snapshot identity", () => {
    expect(assetSnapshotId(snapshot())).toBe("snapshot:2026-08-23T05:30:00.000Z");
  });

  it("reuses source-node/frame hints and enforces bounded Browser acquisition", () => {
    const input = buildStandardAssetInput(snapshot());
    expect(input.frames).toEqual(
      expect.arrayContaining([expect.objectContaining({ frameId: "root" })]),
    );
    expect(input.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceNodeId: "node:image", sourceSelector: "#hero" }),
      ]),
    );
    expect(input.maxAssets).toBeGreaterThan(0);
    expect(input.maxAssetBytes).toBeGreaterThan(0);
    expect(input.maxTotalBytes).toBeGreaterThanOrEqual(input.maxAssetBytes ?? 0);
  });

  it("computes lowercase SHA-256 digests with Web Crypto", async () => {
    await expect(sha256AssetBytes(new TextEncoder().encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
