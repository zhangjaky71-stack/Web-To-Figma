import { describe, expect, it } from "vitest";
import type { WtfRenderNode } from "@w2f/w2f-ir";
import {
  candidateFigmaFontStyle,
  createFontRequest,
  createPaintRenderPlan,
  createTextRenderPlan,
  createVisualRenderPlan,
} from "../src/index.js";

function node(overrides: Partial<WtfRenderNode> = {}): WtfRenderNode {
  return {
    id: "text-1",
    childIds: [],
    sourceNodeIds: ["source-text-1"],
    sourceStableIds: ["stable-text-1"],
    kind: "text",
    name: "text.title",
    geometry: { bounds: { x: 10, y: 20, width: 240, height: 48 } },
    layout: {
      mode: "inline",
      display: "inline",
      position: "static",
      sizing: {
        width: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
        height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
      },
      decision: { confidence: 1, reasons: ["fixture"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
    revisionHashes: { contentHash: "content-1", paintHash: "paint-1" },
    ...overrides,
  };
}

function mixedTextNode(): WtfRenderNode {
  return node({
    text: {
      value: "Hello World",
      runs: [
        {
          start: 0,
          end: 6,
          text: "Hello ",
          font: { family: "Inter", style: "normal", weight: 400, fingerprint: "font-regular" },
          fontSize: 20,
          lineHeight: "24px",
          letterSpacing: 0.25,
          color: { r: 0.1, g: 0.2, b: 0.3, a: 0.9 },
          decoration: "none",
        },
        {
          start: 6,
          end: 11,
          text: "World",
          font: { family: "Inter", style: "italic", weight: 700, fingerprint: "font-bold-italic" },
          fontSize: 20,
          lineHeight: "120%",
          color: { r: 0.8, g: 0.1, b: 0.2, a: 1 },
          decoration: "underline",
        },
      ],
      fragments: [],
      textAlign: "center",
      direction: "ltr",
      whiteSpace: "normal",
      editableStrategyHint: "editable",
    },
  });
}

function side(width: number, color = { r: 0.2, g: 0.3, b: 0.4, a: 1 }) {
  return { width, style: "solid", color };
}

describe("NODE-26 text/font planning", () => {
  it("keeps mixed style ranges in one deterministic text plan", () => {
    const plan = createTextRenderPlan(mixedTextNode());
    expect(plan?.characters).toBe("Hello World");
    expect(plan?.ranges).toHaveLength(2);
    expect(plan?.ranges[0]?.font).toMatchObject({ family: "Inter", candidateStyle: "Regular" });
    expect(plan?.ranges[1]?.font).toMatchObject({ family: "Inter", candidateStyle: "Bold Italic" });
    expect(plan?.ranges[0]?.lineHeight).toEqual({ unit: "PIXELS", value: 24 });
    expect(plan?.ranges[1]?.lineHeight).toEqual({ unit: "PERCENT", value: 120 });
    expect(plan?.ranges[1]?.decoration).toEqual({ kind: "UNDERLINE" });
    expect(plan?.ranges[0]?.color).toEqual({ r: 0.1, g: 0.2, b: 0.3, a: 0.9 });
    expect(plan?.textAlign).toBe("CENTER");
    expect(plan?.sourceStableIds).toEqual(["stable-text-1"]);
    expect(plan?.revisionHashes).toEqual({ contentHash: "content-1", paintHash: "paint-1" });
  });

  it("does not silently replace the requested font family", () => {
    const request = createFontRequest({ family: "Brand Sans", style: "normal", weight: 600 });
    expect(request.family).toBe("Brand Sans");
    expect(request.candidateStyle).toBe("Semi Bold");
    expect(request.key).toBe("Brand Sans\u0000Semi Bold");
    expect(candidateFigmaFontStyle({ family: "Brand Sans", style: "Custom Face", weight: 400 })).toBe(
      "Custom Face",
    );
  });

  it("fails closed when text runs contain a coverage gap", () => {
    const invalid = mixedTextNode();
    invalid.text!.runs[1]!.start = 7;
    expect(() => createTextRenderPlan(invalid)).toThrow(/without gaps or overlap/);
  });
});

describe("NODE-26 paint planning", () => {
  it("preserves native fills, image references, borders, radius, shadows and clipping", () => {
    const painted = node({
      kind: "container",
      layout: {
        mode: "flow",
        display: "block",
        position: "static",
        overflowX: "hidden",
        overflowY: "hidden",
        sizing: {
          width: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
          height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
        },
        decision: { confidence: 1, reasons: ["fixture"] },
      },
      paint: {
        fills: [
          { type: "solid", color: { r: 1, g: 0.5, b: 0.25, a: 0.75 } },
          {
            type: "linear-gradient",
            angleDeg: 90,
            stops: [
              { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
            ],
            authoredValue: "linear-gradient(90deg, red, blue)",
          },
          { type: "image", assetId: "asset-logo", fit: "cover" },
        ],
        border: {
          top: side(2),
          right: side(2),
          bottom: side(2),
          left: side(2),
          radius: { topLeft: 12, topRight: 8, bottomRight: 6, bottomLeft: 4 },
        },
        shadows: [
          {
            inset: false,
            offsetX: 0,
            offsetY: 8,
            blur: 20,
            spread: 2,
            color: { r: 0, g: 0, b: 0, a: 0.2 },
          },
          {
            inset: true,
            offsetX: 0,
            offsetY: 1,
            blur: 3,
            spread: 0,
            color: { r: 1, g: 1, b: 1, a: 0.4 },
          },
        ],
        opacity: 0.8,
        blendMode: "multiply",
        clipPath: "inset(2px)",
      },
    });
    const plan = createPaintRenderPlan(painted);
    expect(plan.fills[0]).toMatchObject({ kind: "SOLID" });
    expect(plan.fills[1]).toMatchObject({ kind: "GRADIENT_LINEAR", angleDeg: 90, nativeCompatible: true });
    expect(plan.fills[2]).toMatchObject({ kind: "IMAGE", assetId: "asset-logo", preferredScaleMode: "CROP" });
    expect(plan.border.mode).toBe("UNIFORM");
    expect(plan.border.radius).toEqual({ topLeft: 12, topRight: 8, bottomRight: 6, bottomLeft: 4 });
    expect(plan.shadows.map((shadow) => shadow.kind)).toEqual(["DROP_SHADOW", "INNER_SHADOW"]);
    expect(plan.opacity).toBe(0.8);
    expect(plan.blendMode).toBe("multiply");
    expect(plan.clip).toEqual({ clipsContent: true, complexClip: true, clipPath: "inset(2px)" });
  });

  it("keeps per-side borders explicit instead of flattening them", () => {
    const plan = createPaintRenderPlan(
      node({
        kind: "container",
        paint: {
          fills: [],
          border: { top: side(1), right: side(2), bottom: side(3), left: side(4) },
          opacity: 1,
        },
      }),
    );
    expect(plan.border.mode).toBe("PER_SIDE");
    expect(plan.border.nativeSingleStrokeCompatible).toBe(false);
    expect(plan.border.sides.map((item) => [item.side, item.width])).toEqual([
      ["top", 1],
      ["right", 2],
      ["bottom", 3],
      ["left", 4],
    ]);
  });

  it("marks out-of-range gradient stops as needing a non-native fallback decision", () => {
    const plan = createPaintRenderPlan(
      node({
        kind: "decoration",
        paint: {
          fills: [
            {
              type: "conic-gradient",
              stops: [
                { offset: -0.1, color: { r: 1, g: 0, b: 0, a: 1 } },
                { offset: 1.1, color: { r: 0, g: 1, b: 0, a: 1 } },
              ],
            },
          ],
          opacity: 1,
        },
      }),
    );
    expect(plan.fills[0]).toMatchObject({ kind: "GRADIENT_ANGULAR", nativeCompatible: false });
  });

  it("produces deterministic aggregate visual plans", () => {
    const input = mixedTextNode();
    input.paint = {
      fills: [{ type: "solid", color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
      opacity: 1,
    };
    expect(JSON.stringify(createVisualRenderPlan(input))).toBe(JSON.stringify(createVisualRenderPlan(input)));
  });
});
