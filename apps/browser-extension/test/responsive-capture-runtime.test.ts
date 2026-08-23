import type { RawSnapshot } from "@w2f/capture-core";
import { describe, expect, it } from "vitest";
import {
  assertSnapshotMatchesResponsivePlan,
  buildResponsiveStableNodeEvidence,
} from "../src/runtime/responsive-capture-runtime.js";

function snapshot(suffix: string): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "cdp",
    capturedAt: `2026-08-23T07:2${suffix}:00.000Z`,
    url: "https://example.com/products",
    title: "Responsive fixture",
    rootCaptureNodeId: `doc:${suffix}`,
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 768,
      viewportHeight: 800,
      scale: {
        context: { devicePixelRatio: 2 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
    },
    nodes: [
      {
        captureNodeId: `doc:${suffix}`,
        kind: "document",
        relationships: {},
        childCaptureNodeIds: [`header:${suffix}`],
        frameContext: { frameId: "root" },
        source: {},
      },
      {
        captureNodeId: `header:${suffix}`,
        kind: "element",
        relationships: { sourceParentId: `doc:${suffix}` },
        childCaptureNodeIds: [`title:${suffix}`],
        frameContext: { frameId: "root" },
        source: {
          tagName: "header",
          role: "banner",
          attributes: { id: "site-header", class: "site-header shell" },
        },
        geometry: { bounds: { x: 0, y: 0, width: 768, height: 80 } },
      },
      {
        captureNodeId: `title:${suffix}`,
        kind: "element",
        relationships: { sourceParentId: `header:${suffix}` },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "h1", attributes: { "data-testid": "page-title" } },
        textContent: "Products",
        geometry: { bounds: { x: 24, y: 20, width: 220, height: 40 } },
      },
    ],
    frames: [
      { context: { frameId: "root" }, rootCaptureNodeId: `doc:${suffix}`, accessible: true },
    ],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("Browser responsive capture runtime", () => {
  it("produces stable ids that survive capture-local node id changes", async () => {
    const left = await buildResponsiveStableNodeEvidence(snapshot("1"));
    const right = await buildResponsiveStableNodeEvidence(snapshot("2"));
    const leftHeader = left.find((item) => item.captureNodeId === "header:1");
    const rightHeader = right.find((item) => item.captureNodeId === "header:2");
    const leftTitle = left.find((item) => item.captureNodeId === "title:1");
    const rightTitle = right.find((item) => item.captureNodeId === "title:2");
    expect(leftHeader?.stableNodeId).toBe(rightHeader?.stableNodeId);
    expect(leftTitle?.stableNodeId).toBe(rightTitle?.stableNodeId);
    expect(leftTitle?.sourceParentStableNodeId).toBe(leftHeader?.stableNodeId);
    expect(rightTitle?.sourceParentStableNodeId).toBe(rightHeader?.stableNodeId);
  });

  it("requires captured viewport evidence to match the orchestration plan", () => {
    expect(() =>
      assertSnapshotMatchesResponsivePlan(snapshot("1"), {
        id: "viewport:768x800@2",
        width: 768,
        height: 800,
        dpr: 2,
        source: "synthetic",
      }),
    ).not.toThrow();
    expect(() =>
      assertSnapshotMatchesResponsivePlan(snapshot("1"), {
        id: "viewport:390x800@2",
        width: 390,
        height: 800,
        dpr: 2,
        source: "synthetic",
      }),
    ).toThrow(/Responsive viewport mismatch/);
  });
});
