import type { WtfRenderTree, WtfResponsivePayload } from "@w2f/w2f-ir";
import { describe, expect, it } from "vitest";
import {
  buildNode31ResponsiveQaInput,
  evaluateNode31DesktopResponsiveQa,
  type W2fNode31ResponsiveSceneObservation,
} from "../src/node31-responsive-measurement.js";

const decision = { confidence: 1, reasons: [], sourceRefs: [] };

function renderTree(): WtfRenderTree {
  return {
    rootId: "render:root",
    sections: [],
    nodes: [
      {
        id: "render:root",
        childIds: ["render:child"],
        sourceNodeIds: ["source:root"],
        sourceStableIds: ["stable:root"],
        kind: "document",
        name: "Root",
        geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        layout: {
          mode: "flex",
          display: "flex",
          position: "static",
          sizing: {
            width: { ...decision, mode: "fixed" },
            height: { ...decision, mode: "fixed" },
          },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          effectiveGap: { row: 8, column: 8 },
          flexContainer: {
            direction: "row",
            wrap: "nowrap",
            justifyContent: "flex-start",
            alignItems: "stretch",
            rowGap: 8,
            columnGap: 8,
          },
          decision,
        },
        paint: { fills: [], opacity: 1 },
        renderStrategy: "native",
        renderDecision: decision,
      },
      {
        id: "render:child",
        parentId: "render:root",
        childIds: [],
        sourceNodeIds: ["source:child"],
        sourceStableIds: ["stable:child"],
        kind: "container",
        name: "Child",
        geometry: { bounds: { x: 10, y: 10, width: 1420, height: 120 } },
        layout: {
          mode: "flow",
          display: "block",
          position: "static",
          sizing: {
            width: { ...decision, mode: "fill" },
            height: { ...decision, mode: "fixed" },
          },
          flexItem: { grow: 1, shrink: 1 },
          decision,
        },
        paint: { fills: [], opacity: 1 },
        renderStrategy: "native",
        renderDecision: decision,
      },
    ],
  };
}

function responsive(): WtfResponsivePayload {
  return {
    snapshots: [
      {
        id: "viewport:390",
        viewport: { width: 390, height: 844, dpr: 1 },
        rootNodeId: "source:root",
        environmentRef: "env:390",
      },
      {
        id: "viewport:768",
        viewport: { width: 768, height: 900, dpr: 1 },
        rootNodeId: "source:root",
        environmentRef: "env:768",
      },
    ],
    rules: [
      {
        targetStableNodeId: "stable:child",
        property: "sizing.width.mode",
        ranges: [
          {
            minWidth: 390,
            maxWidth: 768,
            value: "fill",
            snapshotIds: ["viewport:390", "viewport:768"],
          },
        ],
        confidence: 1,
        reasons: ["test"],
        sourceRefs: [],
      },
    ],
    mediaRules: [],
    containerQueries: [],
  };
}

function observations(): W2fNode31ResponsiveSceneObservation[] {
  return [
    {
      snapshotId: "viewport:390",
      viewportWidth: 390,
      renderNodeId: "render:root",
      width: 390,
      height: 900,
      visible: true,
      layoutMode: "HORIZONTAL",
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 10,
      itemSpacing: 8,
    },
    {
      snapshotId: "viewport:390",
      viewportWidth: 390,
      renderNodeId: "render:child",
      width: 362,
      height: 120,
      visible: true,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "FILL",
      layoutPositioning: "AUTO",
    },
    {
      snapshotId: "viewport:768",
      viewportWidth: 768,
      renderNodeId: "render:root",
      width: 768,
      height: 900,
      visible: true,
      layoutMode: "HORIZONTAL",
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 10,
      itemSpacing: 8,
    },
    {
      snapshotId: "viewport:768",
      viewportWidth: 768,
      renderNodeId: "render:child",
      width: 740,
      height: 120,
      visible: true,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "FILL",
      layoutPositioning: "AUTO",
    },
  ];
}

describe("NODE-31 real Figma responsive measurement", () => {
  it("scores native Auto Layout properties and cross-viewport FILL behavior", () => {
    const report = evaluateNode31DesktopResponsiveQa(renderTree(), responsive(), observations());
    expect(report.status).toBe("PASS");
    expect(report.compositeScore).toBe(1);
    expect(report.domainScores.sizing).toBe(1);
    expect(report.domainScores.spacing).toBe(1);
    expect(report.domainScores.layout).toBe(1);
  });

  it("reports breakpoint-only visibility changes instead of claiming native Figma execution", () => {
    const payload = responsive();
    payload.rules.push({
      targetStableNodeId: "stable:child",
      property: "visibility",
      ranges: [
        { maxWidth: 500, value: false, snapshotIds: ["viewport:390"] },
        { minWidth: 501, value: true, snapshotIds: ["viewport:768"] },
      ],
      confidence: 1,
      reasons: ["observed breakpoint"],
      sourceRefs: [],
    });

    const input = buildNode31ResponsiveQaInput(renderTree(), payload, observations());
    expect(input.structuralChanges).toContainEqual({
      id: "responsive-rule:stable:child:visibility",
      expected: true,
      detected: true,
      executableInFigma: false,
      reportedWhenNotExecutable: true,
    });
    const report = evaluateNode31DesktopResponsiveQa(renderTree(), payload, observations());
    expect(report.status).toBe("PASS");
    expect(report.domainScores.breakpoints).toBe(1);
  });

  it("fails a responsive breakpoint whose canonical stable target is absent from the render tree", () => {
    const payload = responsive();
    payload.rules = [
      {
        targetStableNodeId: "stable:missing",
        property: "visibility",
        ranges: [
          { maxWidth: 500, value: false, snapshotIds: ["viewport:390"] },
          { minWidth: 501, value: true, snapshotIds: ["viewport:768"] },
        ],
        confidence: 1,
        reasons: ["missing target"],
        sourceRefs: [],
      },
    ];
    const report = evaluateNode31DesktopResponsiveQa(renderTree(), payload, observations());
    expect(report.status).toBe("FAIL");
    expect(report.domainScores.breakpoints).toBe(0);
  });
});
