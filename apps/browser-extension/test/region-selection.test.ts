import { describe, expect, it } from "vitest";
import {
  W2F_REGION_SELECTION_VERSION,
  intersectRegionRects,
  isRegionSelectionResult,
  moveRegionRect,
  rectFromPoints,
} from "../src/runtime/region-selection.js";

describe("NODE-07 region selection contract", () => {
  it("keeps document geometry at double precision", () => {
    expect(
      rectFromPoints({ x: 143.3333282470703, y: 18.25 }, { x: 511.6666717529297, y: 219.875 }),
    ).toEqual({
      x: 143.3333282470703,
      y: 18.25,
      width: 368.3333435058594,
      height: 201.625,
    });
  });

  it("computes clipped redaction intersections without integer rounding", () => {
    expect(
      intersectRegionRects(
        { x: 100.25, y: 100.5, width: 200.75, height: 120.25 },
        { x: 250.125, y: 90, width: 120.5, height: 80.75 },
      ),
    ).toEqual({ x: 250.125, y: 100.5, width: 50.875, height: 70.25 });
  });

  it("moves a selection deterministically", () => {
    expect(moveRegionRect({ x: 10, y: 20, width: 300, height: 200 }, -1, 10)).toEqual({
      x: 9,
      y: 30,
      width: 300,
      height: 200,
    });
  });

  it("validates free-rect results with root clip and redact/exclude areas", () => {
    expect(
      isRegionSelectionResult({
        version: W2F_REGION_SELECTION_VERSION,
        coordinateSpace: "document-css-px",
        mode: "free-rect",
        bounds: { x: 100.5, y: 200.25, width: 800.75, height: 640.5 },
        viewportBounds: { x: 100.5, y: 40.25, width: 800.75, height: 640.5 },
        selectionRoot: {
          kind: "element",
          tagName: "main",
          id: "app",
          bounds: { x: 0, y: 160, width: 1200, height: 2400 },
          clip: { x: 100.5, y: 200.25, width: 800.75, height: 640.5 },
        },
        exclusions: [
          {
            id: "region_1",
            kind: "redact",
            bounds: { x: 200, y: 260, width: 180, height: 60 },
          },
          {
            id: "region_2",
            kind: "exclude",
            bounds: { x: 500, y: 600, width: 90, height: 80 },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects empty or malformed region results", () => {
    expect(
      isRegionSelectionResult({
        version: W2F_REGION_SELECTION_VERSION,
        coordinateSpace: "document-css-px",
        mode: "free-rect",
        bounds: { x: 0, y: 0, width: 0, height: 10 },
        viewportBounds: { x: 0, y: 0, width: 0, height: 10 },
        selectionRoot: {
          kind: "document",
          bounds: { x: 0, y: 0, width: 1000, height: 2000 },
          clip: { x: 0, y: 0, width: 0, height: 10 },
        },
        exclusions: [],
      }),
    ).toBe(false);
  });
});
