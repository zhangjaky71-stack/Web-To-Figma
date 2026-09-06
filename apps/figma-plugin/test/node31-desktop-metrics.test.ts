import { describe, expect, it } from "vitest";
import type { WtfRenderTree } from "@w2f/w2f-ir";
import {
  measureNode31AssetFidelity,
  measureNode31GeometryFidelity,
  measureNode31ResponsiveFidelity,
  measureNode31TextFidelity,
} from "../src/node31-desktop-metrics.js";

function fixtureTree(): WtfRenderTree {
  return {
    rootId: "root",
    sections: [],
    nodes: [
      {
        id: "root",
        childIds: ["text", "image"],
        sourceNodeIds: ["source-root"],
        kind: "container",
        name: "Root",
        geometry: { bounds: { x: 100, y: 200, width: 1000, height: 800 } },
        layout: {
          mode: "flow",
          display: "block",
          position: "static",
          sizing: {
            width: { mode: "fixed", confidence: 1, reasons: [] },
            height: { mode: "fixed", confidence: 1, reasons: [] },
          },
          decision: { confidence: 1, reasons: [] },
        },
        paint: { fills: [], opacity: 1 },
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: [] },
      },
      {
        id: "text",
        parentId: "root",
        childIds: [],
        sourceNodeIds: ["source-text"],
        kind: "text",
        name: "Text",
        geometry: { bounds: { x: 150, y: 250, width: 200, height: 50 } },
        layout: {
          mode: "inline",
          display: "inline",
          position: "static",
          sizing: {
            width: { mode: "fixed", confidence: 1, reasons: [] },
            height: { mode: "fixed", confidence: 1, reasons: [] },
          },
          decision: { confidence: 1, reasons: [] },
        },
        paint: { fills: [], opacity: 1 },
        text: {
          value: "Hello",
          runs: [
            {
              start: 0,
              end: 5,
              text: "Hello",
              font: { family: "Inter", style: "Regular" },
              fontSize: 16,
            },
          ],
          fragments: [],
        },
        assetRefs: ["font-meta"],
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: [] },
      },
      {
        id: "image",
        parentId: "root",
        childIds: [],
        sourceNodeIds: ["source-image"],
        kind: "image",
        name: "Image",
        geometry: { bounds: { x: 400, y: 300, width: 300, height: 200 } },
        layout: {
          mode: "flow",
          display: "block",
          position: "static",
          sizing: {
            width: { mode: "fixed", confidence: 1, reasons: [] },
            height: { mode: "fixed", confidence: 1, reasons: [] },
          },
          decision: { confidence: 1, reasons: [] },
        },
        paint: {
          fills: [{ type: "image", assetId: "paint-image", fit: "cover" }],
          opacity: 1,
        },
        assetRefs: ["node-image"],
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: [] },
      },
    ],
  };
}

describe("NODE-31 real Desktop metrics", () => {
  it("measures geometry root-relatively so Figma canvas placement does not change fidelity", () => {
    const score = measureNode31GeometryFidelity(fixtureTree(), [
      { renderNodeId: "root", bounds: { x: 20, y: 30, width: 1000, height: 800 } },
      { renderNodeId: "text", bounds: { x: 70, y: 80, width: 200, height: 50 } },
      { renderNodeId: "image", bounds: { x: 320, y: 130, width: 300, height: 200 } },
    ]);
    expect(score).toBe(1);
  });

  it("penalizes missing or geometrically different mapped nodes", () => {
    const score = measureNode31GeometryFidelity(fixtureTree(), [
      { renderNodeId: "root", bounds: { x: 0, y: 0, width: 1000, height: 800 } },
      { renderNodeId: "text", bounds: { x: 80, y: 50, width: 200, height: 50 } },
    ]);
    expect(score).toBeLessThan(0.8);
  });

  it("measures editable text characters and supported font runs without excluding failures", () => {
    const exact = measureNode31TextFidelity(fixtureTree(), [
      { renderNodeId: "text", characters: "Hello", matchedFontRunCount: 1, fontRunCount: 1 },
    ]);
    const degraded = measureNode31TextFidelity(fixtureTree(), [
      { renderNodeId: "text", characters: "Hxllo", matchedFontRunCount: 0, fontRunCount: 1 },
    ]);
    expect(exact).toBe(1);
    expect(degraded).toBeLessThan(exact);
  });

  it("measures every render-tree visual asset instead of only successfully painted assets", () => {
    const allAssets = new Set(["font-meta", "paint-image", "node-image"]);
    expect(measureNode31AssetFidelity(fixtureTree(), allAssets)).toBe(1);
    expect(measureNode31AssetFidelity(fixtureTree(), new Set(["paint-image"]))).toBeCloseTo(1 / 3);
  });

  it("requires real responsive state observations and exact independent fingerprints", () => {
    expect(measureNode31ResponsiveFidelity([])).toBe(0);
    expect(
      measureNode31ResponsiveFidelity([
        { stateId: "desktop", expectedFingerprint: "a", observedFingerprint: "a" },
        { stateId: "mobile", expectedFingerprint: "b", observedFingerprint: "c" },
      ]),
    ).toBe(0.5);
  });
});
