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

function node10Fixture(): CdpCaptureEvidence {
  const strings: string[] = [];
  const intern = (value: string): number => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };
  const defaults: Record<string, string> = {
    display: "inline",
    visibility: "visible",
    "content-visibility": "visible",
    opacity: "1",
    "overflow-x": "visible",
    "overflow-y": "visible",
    position: "static",
    "font-family": "Inter",
    "font-size": "16px",
    "font-style": "normal",
    "font-weight": "400",
    "font-stretch": "normal",
    "font-variation-settings": "normal",
    "font-feature-settings": "normal",
    "line-height": "20px",
    "letter-spacing": "0px",
    color: "rgb(10, 20, 30)",
    "text-decoration-line": "none",
    "white-space": "normal",
    "word-break": "normal",
    "overflow-wrap": "normal",
    "text-align": "start",
    direction: "ltr",
    "writing-mode": "horizontal-tb",
    "vertical-align": "baseline",
    content: "normal",
    appearance: "auto",
    "accent-color": "auto",
  };
  const styleFor = (overrides: Record<string, string> = {}): number[] =>
    CDP_COMPUTED_STYLE_PROPERTIES.map((property) =>
      intern(overrides[property] ?? defaults[property] ?? ""),
    );

  const documentUrl = intern("https://example.com/node-10");
  const title = intern("NODE-10 Fixture");
  const frameId = intern("frame-main");
  const documentName = intern("#document");
  const html = intern("HTML");
  const body = intern("BODY");
  const div = intern("DIV");
  const textName = intern("#text");
  const pseudoName = intern("::before");
  const input = intern("INPUT");
  const hello = intern("hello");
  const empty = intern("");
  const id = intern("id");
  const hero = intern("hero");
  const type = intern("type");
  const checkbox = intern("checkbox");
  const value = intern("value");
  const secret = intern("sensitive-runtime-like-attribute");
  const before = intern("before");
  const he = intern("he");
  const llo = intern("llo");
  const prefix = intern("Prefix");

  const blockStyle = styleFor({ display: "block" });
  const textStyle = styleFor();
  const pseudoStyle = styleFor({ content: '"Prefix"' });
  const inputStyle = styleFor({
    display: "inline-block",
    appearance: "auto",
    "accent-color": "rgb(0, 120, 255)",
  });

  return {
    devicePixelRatio: 2,
    domSnapshot: {
      strings,
      documents: [
        {
          documentURL: documentUrl,
          title,
          baseURL: documentUrl,
          frameId,
          contentWidth: 1024,
          contentHeight: 1600,
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          nodes: {
            parentIndex: [-1, 0, 1, 2, 3, 3, 2],
            nodeType: [9, 1, 1, 1, 3, 1, 1],
            nodeName: [documentName, html, body, div, textName, pseudoName, input],
            nodeValue: [empty, empty, empty, empty, hello, empty, empty],
            backendNodeId: [1, 2, 3, 4, 5, 6, 7],
            attributes: [
              [],
              [],
              [],
              [id, hero],
              [],
              [],
              [type, checkbox, value, secret],
            ],
            pseudoType: { index: [5], value: [before] },
            inputChecked: { index: [6] },
          },
          layout: {
            nodeIndex: [1, 2, 3, 4, 4, 5, 6],
            styles: [
              blockStyle,
              blockStyle,
              blockStyle,
              textStyle,
              textStyle,
              pseudoStyle,
              inputStyle,
            ],
            bounds: [
              [0, 0, 1024, 1600],
              [0, 0, 1024, 1600],
              [80, 120, 600, 200],
              [100, 150, 24, 20],
              [100, 174, 36, 20],
              [88, 126, 48, 20],
              [80, 360, 24, 24],
            ],
            clientRects: [
              [0, 0, 1024, 768],
              [0, 0, 1024, 768],
              [80, 120, 600, 200],
              [100, 150, 24, 20],
              [100, 174, 36, 20],
              [88, 126, 48, 20],
              [80, 360, 24, 24],
            ],
            text: [empty, empty, empty, he, llo, prefix, empty],
            paintOrders: [1, 2, 3, 4, 4, 5, 6],
          },
        },
      ],
    },
    layoutMetrics: {
      cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 1024, clientHeight: 768 },
      cssVisualViewport: {
        offsetX: 0,
        offsetY: 0,
        pageX: 0,
        pageY: 0,
        clientWidth: 1024,
        clientHeight: 768,
        scale: 1,
        zoom: 1,
      },
      cssContentSize: { x: 0, y: 0, width: 1024, height: 1600 },
    },
    frameTree: {
      frameTree: {
        frame: {
          id: "frame-main",
          url: "https://example.com/node-10",
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
    const heroNode = result.snapshot.nodes.find((node) => node.source.attributes?.id === "hero");
    expect(heroNode?.geometry?.bounds.x).toBe(100.25);
    expect(heroNode?.paintOrder).toBe(8);
    expect(heroNode?.source.backendNodeId).toBe(4);
    expect(result.screenshot).toMatchObject({ format: "png", captureBeyondViewport: true });
  });

  it("normalizes NODE-10 text fragments, baseline provenance, pseudo text and safe form state", () => {
    const result = normalizeCdpCapture({
      captureTarget: { type: "document" },
      evidence: node10Fixture(),
      capturedAt: "2026-08-23T01:00:00.000Z",
    });

    const textNode = result.snapshot.nodes.find((node) => node.kind === "text");
    expect(textNode?.textContent).toBe("hello");
    expect(textNode?.text?.value).toBe("hello");
    expect(textNode?.text?.runs[0]).toMatchObject({
      start: 0,
      end: 5,
      text: "hello",
      font: { family: "Inter", weight: "400" },
      fontSize: 16,
      lineHeight: 20,
      letterSpacing: 0,
      direction: "ltr",
    });
    expect(textNode?.text?.fragments).toHaveLength(2);
    expect(textNode?.text?.fragments.map((fragment) => [fragment.start, fragment.end])).toEqual([
      [0, 2],
      [2, 5],
    ]);
    for (const fragment of textNode?.text?.fragments ?? []) {
      expect(fragment.baselineSource).toBe("cdp-layout-estimate");
      expect(fragment.baselineConfidence).toBe(0.7);
      expect(Number.isFinite(fragment.baseline)).toBe(true);
    }
    expect(textNode?.inline).toMatchObject({
      display: "inline",
      writingMode: "horizontal-tb",
    });
    expect(textNode?.inline?.fragmentBounds).toHaveLength(2);

    const pseudoNode = result.snapshot.nodes.find((node) => node.kind === "pseudo");
    expect(pseudoNode?.source.pseudoType).toBe("before");
    expect(pseudoNode?.pseudo).toEqual({
      type: "before",
      content: '"Prefix"',
      contentKind: "text",
      generatedText: "Prefix",
    });
    expect(pseudoNode?.textContent).toBe("Prefix");
    expect(pseudoNode?.text?.runs[0]?.font.family).toBe("Inter");

    const inputNode = result.snapshot.nodes.find((node) => node.source.tagName === "INPUT");
    expect(inputNode?.formVisual).toMatchObject({
      controlKind: "input",
      inputType: "checkbox",
      disabled: false,
      readOnly: false,
      required: false,
      checked: true,
      textValueCapture: "not-applicable",
    });
    expect(inputNode?.source.attributes).toEqual({ type: "checkbox" });
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
    const nodeContract = JSON.stringify(node10Fixture().domSnapshot.documents[0]?.nodes);
    expect(nodeContract).not.toContain("inputValue");
    expect(nodeContract).not.toContain("textValue");
  });
});
