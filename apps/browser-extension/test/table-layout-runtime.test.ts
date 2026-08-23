import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import { describe, expect, it } from "vitest";
import { analyzeSnapshotTables } from "../src/runtime/table-layout-runtime.js";

function snapshot(): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T09:00:00.000Z",
    url: "https://example.com/table",
    title: "Table fixture",
    rootCaptureNodeId: "table",
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
        captureNodeId: "table",
        kind: "element",
        relationships: {},
        childCaptureNodeIds: ["row"],
        frameContext: { frameId: "root" },
        source: { tagName: "table" },
        geometry: { bounds: { x: 20, y: 20, width: 300, height: 40 } },
        visibility: {
          display: "table",
          visibility: "visible",
          opacity: 1,
          hiddenAttribute: false,
          rendered: true,
        },
      },
      {
        captureNodeId: "row",
        kind: "element",
        relationships: { sourceParentId: "table" },
        childCaptureNodeIds: ["a", "b"],
        frameContext: { frameId: "root" },
        source: { tagName: "tr" },
        geometry: { bounds: { x: 20, y: 20, width: 300, height: 40 } },
      },
      {
        captureNodeId: "a",
        kind: "element",
        relationships: { sourceParentId: "row" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "td" },
        geometry: { bounds: { x: 20, y: 20, width: 150, height: 40 } },
      },
      {
        captureNodeId: "b",
        kind: "element",
        relationships: { sourceParentId: "row" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "td" },
        geometry: { bounds: { x: 170, y: 20, width: 150, height: 40 } },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "table", accessible: true }],
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
        {
          sourceNodeId: "table",
          traces: [
            { property: "border-collapse", computedValue: "separate", candidates: [] },
            { property: "border-spacing", computedValue: "2px", candidates: [] },
            { property: "table-layout", computedValue: "auto", candidates: [] },
          ],
          customProperties: {},
        },
      ],
    },
    styles: [],
    tokens: { tokens: [], usages: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  };
}

describe("Browser table layout runtime", () => {
  it("reconstructs persisted-style table evidence without live DOM access", () => {
    const result = analyzeSnapshotTables(snapshot(), cascade());
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]).toMatchObject({
      rowCount: 1,
      columnCount: 2,
      borderCollapse: "separate",
      borderSpacing: { horizontal: 2, vertical: 2 },
      tableLayout: "auto",
      strategyHint: "regular-grid",
    });
  });
});
