import { describe, expect, it } from "vitest";
import {
  RAW_SNAPSHOT_VERSION,
  isRawSnapshot,
  summarizeRawSnapshot,
  type RawSnapshot,
} from "../src/index.js";

function fixture(): RawSnapshot {
  return {
    version: RAW_SNAPSHOT_VERSION,
    adapter: "standard",
    capturedAt: "2026-08-22T12:00:00.000Z",
    url: "https://example.com/",
    title: "Fixture",
    rootCaptureNodeId: "n0",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1280,
      viewportHeight: 720,
      scale: {
        context: {
          devicePixelRatio: 2,
          visualViewportScale: 1,
        },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: ["Standard page APIs do not reliably separate browser page zoom from OS scale."],
      },
    },
    nodes: [
      {
        captureNodeId: "n0",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["n1"],
        frameContext: {
          frameId: "frame-main",
          url: "https://example.com/",
          origin: "https://example.com",
        },
        source: {},
      },
      {
        captureNodeId: "n1",
        kind: "element",
        relationships: { sourceParentId: "n0", composedParentId: "n0" },
        childCaptureNodeIds: [],
        frameContext: {
          frameId: "frame-main",
          url: "https://example.com/",
          origin: "https://example.com",
        },
        source: { tagName: "DIV", sourceSelector: "html > body > div:nth-of-type(1)" },
        geometry: { bounds: { x: 10.25, y: 20.5, width: 300.125, height: 120.75 } },
        visibility: {
          display: "block",
          visibility: "visible",
          contentVisibility: "visible",
          opacity: 1,
          hiddenAttribute: false,
          rendered: true,
        },
      },
    ],
    frames: [
      {
        context: {
          frameId: "frame-main",
          url: "https://example.com/",
          origin: "https://example.com",
        },
        rootCaptureNodeId: "n0",
        accessible: true,
      },
    ],
    scrollContainers: [],
    diagnostics: [],
  };
}

describe("RawSnapshot", () => {
  it("accepts a standard snapshot with double-precision geometry and explicit scale evidence", () => {
    const snapshot = fixture();
    expect(isRawSnapshot(snapshot)).toBe(true);
    expect(snapshot.nodes[1]?.geometry?.bounds.x).toBe(10.25);
    expect(snapshot.environment.scale.context.devicePixelRatio).toBe(2);
    expect(snapshot.environment.scale.browserPageZoomAvailability).toBe("unavailable");
    expect(summarizeRawSnapshot(snapshot)).toEqual({
      version: "1.0.0",
      adapter: "standard",
      nodeCount: 2,
      frameCount: 1,
      scrollContainerCount: 0,
      diagnosticCount: 0,
    });
  });

  it("accepts NODE-10 text runs, line fragments, inline and pseudo evidence", () => {
    const snapshot = fixture();
    snapshot.nodes[1]!.childCaptureNodeIds = ["n2", "n3"];
    snapshot.nodes[1]!.inline = {
      display: "inline-flex",
      writingMode: "horizontal-tb",
      verticalAlign: "baseline",
      fragmentBounds: [{ x: 10.25, y: 20.5, width: 120.5, height: 20.25 }],
    };
    snapshot.nodes.push(
      {
        captureNodeId: "n2",
        kind: "text",
        relationships: { sourceParentId: "n1", composedParentId: "n1" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "frame-main", url: "https://example.com/" },
        source: {},
        textContent: "Hello",
        text: {
          value: "Hello",
          runs: [
            {
              start: 0,
              end: 5,
              text: "Hello",
              font: { family: "Inter", style: "normal", weight: "400" },
              fontSize: 16,
              lineHeight: 24,
              letterSpacing: 0.25,
              color: "rgb(17, 17, 17)",
              decoration: "none",
              direction: "ltr",
            },
          ],
          fragments: [
            {
              start: 0,
              end: 5,
              bounds: { x: 20.25, y: 30.5, width: 41.75, height: 18.25 },
              baseline: 44.75,
              baselineSource: "font-metrics",
              baselineConfidence: 0.9,
              lineIndex: 0,
            },
          ],
          whiteSpace: "normal",
          wordBreak: "normal",
          overflowWrap: "normal",
          textAlign: "start",
          direction: "ltr",
          writingMode: "horizontal-tb",
        },
      },
      {
        captureNodeId: "n3",
        kind: "pseudo",
        relationships: { sourceParentId: "n1", composedParentId: "n1" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "frame-main", url: "https://example.com/" },
        source: { pseudoType: "marker" },
        textContent: "•",
        pseudo: { type: "marker", content: '"•"', contentKind: "text", generatedText: "•" },
        text: {
          value: "•",
          runs: [
            {
              start: 0,
              end: 1,
              text: "•",
              font: { family: "Inter" },
              fontSize: 16,
            },
          ],
          fragments: [],
        },
      },
    );
    expect(isRawSnapshot(snapshot)).toBe(true);
  });

  it("rejects malformed NODE-10 text offsets and pseudo identity", () => {
    const snapshot = fixture();
    snapshot.nodes[1]!.childCaptureNodeIds = ["n2"];
    snapshot.nodes.push({
      captureNodeId: "n2",
      kind: "pseudo",
      relationships: { sourceParentId: "n1", composedParentId: "n1" },
      childCaptureNodeIds: [],
      frameContext: { frameId: "frame-main" },
      source: { pseudoType: "before" },
      pseudo: { type: "after", content: '"x"', contentKind: "text", generatedText: "x" },
      textContent: "x",
      text: {
        value: "x",
        runs: [{ start: 0, end: 2, text: "x", font: { family: "sans-serif" }, fontSize: 12 }],
        fragments: [],
      },
    });
    expect(isRawSnapshot(snapshot)).toBe(false);
  });

  it("rejects dangling composed relationships", () => {
    const snapshot = fixture();
    snapshot.nodes[1]!.relationships.composedParentId = "missing";
    expect(isRawSnapshot(snapshot)).toBe(false);
  });

  it("rejects nodes whose frame context is not registered", () => {
    const snapshot = fixture();
    snapshot.nodes[1]!.frameContext = { frameId: "missing-frame" };
    expect(isRawSnapshot(snapshot)).toBe(false);
  });

  it("rejects invalid scale evidence instead of collapsing scale dimensions", () => {
    const snapshot = fixture();
    snapshot.environment.scale.context.devicePixelRatio = 0;
    expect(isRawSnapshot(snapshot)).toBe(false);
  });

  it("accepts region capture with redaction/exclusion geometry", () => {
    const snapshot = fixture();
    snapshot.captureTarget = {
      type: "region",
      bounds: { x: 20.125, y: 40.25, width: 500.5, height: 300.75 },
      exclusions: [
        { kind: "redact", bounds: { x: 30, y: 50, width: 80, height: 20 } },
        { kind: "exclude", bounds: { x: 400, y: 200, width: 40, height: 40 } },
      ],
    };
    expect(isRawSnapshot(snapshot)).toBe(true);
  });
});
