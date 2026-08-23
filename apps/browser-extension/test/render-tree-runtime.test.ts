import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { BaseLayoutAnalysis } from "@w2f/layout-analyzer";
import type { TableLayoutResult } from "@w2f/table-layout-engine";
import { describe, expect, it } from "vitest";
import { optimizeCapturedRenderTree } from "../src/runtime/render-tree-runtime.js";

const decision = {
  confidence: 1,
  reasons: ["fixture"],
  sourceRefs: [],
};

function snapshot(): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T10:00:00.000Z",
    url: "https://example.com/render-tree",
    title: "Render tree fixture",
    rootCaptureNodeId: "root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 800,
      viewportHeight: 600,
      scale: {
        context: { devicePixelRatio: 1 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
    },
    nodes: [
      {
        captureNodeId: "root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["wrapper"],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width: 800, height: 600 } },
      },
      {
        captureNodeId: "wrapper",
        kind: "element",
        relationships: { sourceParentId: "root", composedParentId: "root" },
        childCaptureNodeIds: ["content"],
        frameContext: { frameId: "root" },
        source: { tagName: "div" },
        geometry: { bounds: { x: 20, y: 20, width: 300, height: 80 } },
      },
      {
        captureNodeId: "content",
        kind: "element",
        relationships: { sourceParentId: "wrapper", composedParentId: "wrapper" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "article", attributes: { "aria-label": "Content" } },
        geometry: { bounds: { x: 20, y: 20, width: 300, height: 80 } },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "root", accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

function cascade(): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "standard",
    cascade: {
      version: "1.0.0",
      nodes: [
        { sourceNodeId: "root", traces: [], customProperties: {} },
        { sourceNodeId: "wrapper", traces: [], customProperties: {} },
        { sourceNodeId: "content", traces: [], customProperties: {} },
      ],
    },
    styles: [],
    tokens: { tokens: [], usages: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  };
}

function layout(): BaseLayoutAnalysis {
  const flow = {
    mode: "flow" as const,
    display: "block",
    position: "static",
    sizing: {
      width: { mode: "fixed" as const, ...decision },
      height: { mode: "fixed" as const, ...decision },
    },
    decision,
  };
  return {
    version: "1.0.0",
    nodes: [
      { sourceNodeId: "root", layout: flow, diagnostics: [] },
      { sourceNodeId: "wrapper", layout: flow, diagnostics: [] },
      { sourceNodeId: "content", layout: flow, diagnostics: [] },
    ],
    diagnostics: [],
  };
}

function tables(): TableLayoutResult {
  return { version: "1.0.0", tables: [], diagnostics: [] };
}

describe("Browser render-tree runtime", () => {
  it("optimizes only persisted capture evidence and preserves source mapping", async () => {
    const result = await optimizeCapturedRenderTree(snapshot(), cascade(), layout(), tables());
    expect(result.tree.nodes).toHaveLength(2);
    expect(result.sourceToRenderNodeId.wrapper).toBe(result.sourceToRenderNodeId.content);
    const content = result.tree.nodes.find((node) => node.name === "Content");
    expect(content?.sourceNodeIds).toEqual(["wrapper", "content"]);
    expect(result.tree.sections).toHaveLength(1);
  });
});
