import type { RawSnapshot } from "@w2f/capture-core";
import { describe, expect, it } from "vitest";
import {
  buildStandardEnvironmentInput,
  environmentSnapshotId,
} from "../src/runtime/environment-runtime.js";

function snapshot(adapter: "standard" | "cdp"): RawSnapshot {
  return {
    version: "1.0.0",
    adapter,
    capturedAt: "2026-08-23T04:30:00.000Z",
    url: "https://example.com/",
    title: "Example",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1440,
      viewportHeight: 900,
      scale: {
        context: {
          devicePixelRatio: 2,
          visualViewportScale: 1,
          ...(adapter === "cdp" ? { browserPageZoom: 1.25 } : {}),
        },
        browserPageZoomAvailability: adapter === "cdp" ? "observed" : "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["node:card"],
        frameContext: { frameId: "root" },
        source: {},
      },
      {
        captureNodeId: "node:card",
        kind: "element",
        relationships: { sourceParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { sourceSelector: ".card" },
      },
    ],
    frames: [
      { context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true },
    ],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("Browser environment runtime", () => {
  it("uses the raw capture timestamp as a stable single-snapshot identity", () => {
    expect(environmentSnapshotId(snapshot("standard"))).toBe(
      "snapshot:2026-08-23T04:30:00.000Z",
    );
  });

  it("preserves Standard unavailable page zoom without fabricating a value", () => {
    const input = buildStandardEnvironmentInput(snapshot("standard"));
    expect(input.adapter).toBe("standard");
    expect(input.scale).toMatchObject({
      pageZoomAvailability: "unavailable",
      visualViewportScale: 1,
      cssZoomAvailability: "unavailable",
    });
    expect(input.scale.pageZoom).toBeUndefined();
    expect(input.targets.find((target) => target.sourceNodeId === "node:card")).toMatchObject({
      sourceSelector: ".card",
    });
  });

  it("passes observed High Fidelity page zoom through to environment acquisition", () => {
    const input = buildStandardEnvironmentInput(snapshot("cdp"));
    expect(input.adapter).toBe("cdp");
    expect(input.scale).toMatchObject({
      pageZoom: 1.25,
      pageZoomAvailability: "observed",
    });
  });
});
