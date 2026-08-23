import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import { describe, expect, it } from "vitest";
import {
  analyzeSnapshotBaseLayout,
  buildBaseLayoutObservations,
} from "../src/runtime/layout-analysis-runtime.js";

function snapshot(): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "cdp",
    capturedAt: "2026-08-23T08:55:00.000Z",
    url: "https://example.com",
    title: "Layout fixture",
    rootCaptureNodeId: "doc",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1200,
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
        captureNodeId: "doc",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["shell"],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width: 1200, height: 800 } },
        visibility: {
          display: "block",
          visibility: "visible",
          opacity: 1,
          hiddenAttribute: false,
          rendered: true,
        },
      },
      {
        captureNodeId: "shell",
        kind: "element",
        relationships: { sourceParentId: "doc" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: { tagName: "main" },
        geometry: { bounds: { x: 40, y: 20, width: 1120, height: 600 } },
        visibility: {
          display: "grid",
          visibility: "visible",
          opacity: 1,
          hiddenAttribute: false,
          rendered: true,
        },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "doc", accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

function cascade(): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "cdp",
    cascade: {
      version: "1.0.0",
      nodes: [
        {
          sourceNodeId: "shell",
          traces: [
            {
              property: "display",
              computedValue: "grid",
              candidates: [
                {
                  property: "display",
                  authoredValue: "grid",
                  important: false,
                  inherited: false,
                  status: "winner",
                  sourceOrder: 1,
                  source: {
                    type: "stylesheet",
                    stylesheetRef: "sheet-1",
                    selector: ".shell",
                    ruleIndex: 2,
                  },
                },
              ],
            },
            {
              property: "position",
              computedValue: "relative",
              candidates: [],
            },
            {
              property: "width",
              computedValue: "1120px",
              candidates: [
                {
                  property: "width",
                  authoredValue: "calc(100% - 80px)",
                  important: false,
                  inherited: false,
                  status: "winner",
                  sourceOrder: 2,
                  source: { type: "stylesheet", stylesheetRef: "sheet-1", selector: ".shell" },
                },
              ],
            },
            {
              property: "grid-template-columns",
              computedValue: "544px 544px",
              candidates: [
                {
                  property: "grid-template-columns",
                  authoredValue: "repeat(2, minmax(0, 1fr))",
                  important: false,
                  inherited: false,
                  status: "winner",
                  sourceOrder: 3,
                  source: { type: "stylesheet", stylesheetRef: "sheet-1", selector: ".shell" },
                },
              ],
            },
            { property: "column-gap", computedValue: "32px", candidates: [] },
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

describe("Browser base layout analysis runtime", () => {
  it("joins RawSnapshot geometry with winning CSS evidence", () => {
    const observations = buildBaseLayoutObservations(snapshot(), cascade());
    const shell = observations.find((item) => item.sourceNodeId === "shell");
    expect(shell?.parentBounds).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
    expect(shell?.style.display).toMatchObject({
      computed: "grid",
      authored: "grid",
      sourceRef: "sheet-1#.shell#2",
    });
    expect(shell?.style.gridTemplateColumns?.authored).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("runs the platform-neutral analyzer without touching the live page", () => {
    const analysis = analyzeSnapshotBaseLayout(snapshot(), cascade());
    const shell = analysis.nodes.find((item) => item.sourceNodeId === "shell");
    expect(shell?.layout.mode).toBe("grid");
    expect(shell?.layout.gridContainer?.columns[0]?.authored).toBe("repeat(2, minmax(0, 1fr))");
    expect(shell?.layout.effectiveGap?.column).toBe(32);
  });
});
