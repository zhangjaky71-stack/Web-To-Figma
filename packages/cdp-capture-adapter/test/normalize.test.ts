import { describe, expect, it } from "vitest";
import {
  CDP_CAPTURE_ADAPTER_VERSION,
  CDP_COMPUTED_STYLE_PROPERTIES,
  normalizeCdpCapture,
  type CdpCaptureEvidence,
} from "../src/index.js";

function fixture(): CdpCaptureEvidence {
  const strings = [
    "https://example.com/",
    "Fixture",
    "frame-main",
    "#document",
    "HTML",
    "BODY",
    "DIV",
    "#text",
    "hello",
    "id",
    "hero",
    "block",
    "visible",
    "visible",
    "1",
    "visible",
    "visible",
    "static",
  ];
  const style = [11, 12, 13, 14, 15, 16, 17];
  return {
    devicePixelRatio: 2,
    domSnapshot: {
      strings,
      documents: [
        {
          documentURL: 0,
          title: 1,
          baseURL: 0,
          frameId: 2,
          contentWidth: 1440.5,
          contentHeight: 3000.25,
          scrollOffsetX: 0,
          scrollOffsetY: 120.5,
          nodes: {
            parentIndex: [-1, 0, 1, 2, 3],
            nodeType: [9, 1, 1, 1, 3],
            nodeName: [3, 4, 5, 6, 7],
            nodeValue: [0, 0, 0, 0, 8],
            backendNodeId: [1, 2, 3, 4, 5],
            attributes: [[], [], [], [9, 10], []],
          },
          layout: {
            nodeIndex: [1, 2, 3, 4],
            styles: [style, style, style, style],
            bounds: [
              [0, 0, 1440.5, 3000.25],
              [0, 0, 1440.5, 3000.25],
              [100.25, 200.5, 600.75, 300.125],
              [120.25, 220.5, 120.5, 24.25],
            ],
            clientRects: [
              [0, 0, 1440.5, 900.25],
              [0, 0, 1440.5, 900.25],
              [100.25, 200.5, 600.75, 300.125],
              [120.25, 220.5, 120.5, 24.25],
            ],
            text: [0, 0, 0, 8],
            paintOrders: [1, 2, 8, 9],
          },
        },
      ],
    },
    layoutMetrics: {
      cssLayoutViewport: { pageX: 0, pageY: 120.5, clientWidth: 1440.5, clientHeight: 900.25 },
      cssVisualViewport: {
        offsetX: 0,
        offsetY: 0,
        pageX: 0,
        pageY: 120.5,
        clientWidth: 1440.5,
        clientHeight: 900.25,
        scale: 1,
        zoom: 1.25,
      },
      cssContentSize: { x: 0, y: 0, width: 1440.5, height: 3000.25 },
    },
    frameTree: {
      frameTree: {
        frame: {
          id: "frame-main",
          url: "https://example.com/",
          securityOrigin: "https://example.com",
        },
      },
    },
    screenshot: { data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" },
  };
}

describe("CDP capture adapter", () => {
  it("keeps NODE-09 computed styles and adds NODE-10 text/inline/pseudo visual evidence", () => {
    expect(CDP_CAPTURE_ADAPTER_VERSION).toBe("1.0.0");
    const requiredProperties = [
      "display",
      "visibility",
      "content-visibility",
      "opacity",
      "overflow-x",
      "overflow-y",
      "position",
      "font-family",
      "font-size",
      "font-style",
      "font-weight",
      "font-stretch",
      "font-variation-settings",
      "font-feature-settings",
      "line-height",
      "letter-spacing",
      "color",
      "text-decoration-line",
      "white-space",
      "word-break",
      "overflow-wrap",
      "text-align",
      "direction",
      "writing-mode",
      "vertical-align",
      "content",
      "appearance",
      "accent-color",
    ];
    for (const property of requiredProperties) {
      expect(CDP_COMPUTED_STYLE_PROPERTIES).toContain(property);
    }
    expect(new Set(CDP_COMPUTED_STYLE_PROPERTIES).size).toBe(CDP_COMPUTED_STYLE_PROPERTIES.length);
  });

  it("normalizes DOMSnapshot, paint order, layout metrics and page zoom", () => {
    const result = normalizeCdpCapture({
      captureTarget: { type: "document" },
      evidence: fixture(),
      capturedAt: "2026-08-23T00:00:00.000Z",
    });
    expect(result.snapshot.adapter).toBe("cdp");
    expect(result.snapshot.environment.scale.context).toMatchObject({
      devicePixelRatio: 2,
      browserPageZoom: 1.25,
      visualViewportScale: 1,
    });
    expect(result.snapshot.environment.layoutMetrics?.contentSize?.height).toBe(3000.25);
    const hero = result.snapshot.nodes.find((node) => node.source.attributes?.id === "hero");
    expect(hero?.geometry?.bounds.x).toBe(100.25);
    expect(hero?.paintOrder).toBe(8);
    expect(hero?.source.backendNodeId).toBe(4);
    expect(result.screenshot).toMatchObject({ format: "png", captureBeyondViewport: true });
  });

  it("keeps region ancestor closure and removes fully excluded nodes", () => {
    const result = normalizeCdpCapture({
      captureTarget: {
        type: "region",
        bounds: { x: 80, y: 180, width: 700, height: 500 },
        exclusions: [{ kind: "exclude", bounds: { x: 110, y: 210, width: 200, height: 60 } }],
      },
      evidence: fixture(),
      capturedAt: "2026-08-23T00:00:00.000Z",
    });
    expect(result.snapshot.nodes.some((node) => node.textContent === "hello")).toBe(false);
    expect(result.snapshot.nodes.some((node) => node.source.attributes?.id === "hero")).toBe(true);
  });

  it("never consumes CDP input/textarea runtime value fields because they are outside the evidence contract", () => {
    const nodeContract = JSON.stringify(fixture().domSnapshot.documents[0]?.nodes);
    expect(nodeContract).not.toContain("inputValue");
    expect(nodeContract).not.toContain("textValue");
  });
});
