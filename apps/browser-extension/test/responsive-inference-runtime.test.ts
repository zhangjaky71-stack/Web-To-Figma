import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { EnvironmentCapture } from "@w2f/environment-capture";
import type { ResponsiveCapture } from "@w2f/responsive-capture";
import { describe, expect, it } from "vitest";
import {
  buildResponsiveInferenceInput,
  inferResponsiveCaptureEvidence,
  type ResponsiveInferenceChildEvidence,
} from "../src/runtime/responsive-inference-runtime.js";

function rawSnapshot(
  suffix: string,
  width: number,
  includeNav: boolean,
): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "cdp",
    capturedAt: `2026-08-23T08:1${suffix}:00.000Z`,
    url: "https://example.com/",
    title: "Inference fixture",
    rootCaptureNodeId: `root:${suffix}`,
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: width,
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
        captureNodeId: `root:${suffix}`,
        kind: "document",
        relationships: {},
        childCaptureNodeIds: includeNav ? [`nav:${suffix}`] : [],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width, height: 1200 } },
      },
      ...(includeNav
        ? [
            {
              captureNodeId: `nav:${suffix}`,
              kind: "element" as const,
              relationships: { sourceParentId: `root:${suffix}` },
              childCaptureNodeIds: [],
              frameContext: { frameId: "root" },
              source: { tagName: "nav" },
              geometry: { bounds: { x: 0, y: 0, width: width - 32, height: 64 } },
              visibility: {
                display: "flex",
                visibility: "visible",
                opacity: 1,
                hiddenAttribute: false,
                rendered: true,
              },
            },
          ]
        : []),
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: `root:${suffix}`, accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

function cssCascade(suffix: string, includeNav: boolean): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "cdp",
    cascade: {
      version: "1.0.0",
      nodes: includeNav
        ? [
            {
              sourceNodeId: `nav:${suffix}`,
              customProperties: {},
              traces: [
                {
                  property: "display",
                  computedValue: "flex",
                  candidates: [
                    {
                      property: "display",
                      authoredValue: "flex",
                      important: false,
                      inherited: false,
                      status: "winner",
                      sourceOrder: 1,
                      source: { type: "stylesheet", selector: ".nav" },
                    },
                  ],
                },
                {
                  property: "width",
                  computedValue: "100%",
                  candidates: [
                    {
                      property: "width",
                      authoredValue: "100%",
                      important: false,
                      inherited: false,
                      status: "winner",
                      sourceOrder: 2,
                      source: { type: "stylesheet", selector: ".nav" },
                    },
                  ],
                },
              ],
            },
          ]
        : [],
    },
    styles: [],
    tokens: { tokens: [], usages: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  };
}

function environment(suffix: string, width: number): EnvironmentCapture {
  return {
    version: "1.0.0",
    adapter: "cdp",
    snapshotId: `snapshot:${suffix}`,
    environment: {
      browserName: "Chrome",
      browserVersion: "147",
      platform: "Windows",
      language: "en-US",
      direction: "ltr",
      colorScheme: "light",
      reducedMotion: false,
      viewportWidth: width,
      viewportHeight: 800,
      dpr: 2,
      pageZoomAvailability: "unavailable",
      cssZoomAvailability: "unavailable",
    },
    mediaRules: [
      {
        id: `media:${suffix}`,
        query: "(min-width: 640px)",
        active: width >= 640,
        activeInSnapshotIds: width >= 640 ? [`viewport:${width}`] : [],
        affectedProperties: ["display"],
        affectedSourceNodeIds: [`nav:${suffix}`],
      },
    ],
    containers: [
      {
        sourceNodeId: `root:${suffix}`,
        containerName: "shell",
        containerType: "inline-size",
        inlineSize: width,
        blockSize: 1200,
      },
    ],
    containerQueries: [
      {
        id: `container-query:${suffix}`,
        containerName: "shell",
        condition: "(min-width: 600px)",
        active: width >= 600,
        activeAvailability: "observed",
        containerSourceNodeId: `root:${suffix}`,
        affectedProperties: ["width"],
        affectedSourceNodeIds: [`nav:${suffix}`],
      },
    ],
    diagnostics: [],
  };
}

function responsiveCapture(): ResponsiveCapture {
  return {
    version: "1.0.0",
    mode: "custom",
    baseViewport: { width: 768, height: 800, dpr: 2 },
    plannedViewports: [
      { id: "viewport:390", width: 390, height: 800, dpr: 2, source: "synthetic" },
      { id: "viewport:768", width: 768, height: 800, dpr: 2, source: "synthetic" },
    ],
    snapshots: [
      {
        plan: { id: "viewport:390", width: 390, height: 800, dpr: 2, source: "synthetic" },
        ref: {
          id: "viewport:390",
          viewport: { width: 390, height: 800, dpr: 2 },
          rootNodeId: "root:mobile",
          environmentRef: "environment:mobile",
        },
        artifactId: "job:responsive:mobile",
        artifacts: {
          rawSnapshot: "raw-snapshot:mobile",
          cssCascade: "css-cascade:mobile",
          environment: "environment:mobile",
        },
        stableNodes: [
          {
            captureNodeId: "root:mobile",
            stableNodeId: "sid_root",
            confidence: 0.99,
            signatureHash: "a".repeat(64),
          },
        ],
      },
      {
        plan: { id: "viewport:768", width: 768, height: 800, dpr: 2, source: "synthetic" },
        ref: {
          id: "viewport:768",
          viewport: { width: 768, height: 800, dpr: 2 },
          rootNodeId: "root:desktop",
          environmentRef: "environment:desktop",
        },
        artifactId: "job:responsive:desktop",
        artifacts: {
          rawSnapshot: "raw-snapshot:desktop",
          cssCascade: "css-cascade:desktop",
          environment: "environment:desktop",
        },
        stableNodes: [
          {
            captureNodeId: "root:desktop",
            stableNodeId: "sid_root",
            confidence: 0.99,
            signatureHash: "a".repeat(64),
          },
          {
            captureNodeId: "nav:desktop",
            stableNodeId: "sid_nav",
            confidence: 0.97,
            signatureHash: "b".repeat(64),
            sourceParentCaptureNodeId: "root:desktop",
            sourceParentStableNodeId: "sid_root",
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function children(): ResponsiveInferenceChildEvidence[] {
  return [
    {
      artifactId: "job:responsive:mobile",
      snapshot: rawSnapshot("mobile", 390, false),
      cssCascade: cssCascade("mobile", false),
      environment: environment("mobile", 390),
    },
    {
      artifactId: "job:responsive:desktop",
      snapshot: rawSnapshot("desktop", 768, true),
      cssCascade: cssCascade("desktop", true),
      environment: environment("desktop", 768),
    },
  ];
}

describe("Browser responsive inference runtime", () => {
  it("materializes absent stable nodes so visibility transitions are inferable", () => {
    const input = buildResponsiveInferenceInput(responsiveCapture(), children());
    const nav = input.observations.filter((observation) => observation.stableNodeId === "sid_nav");
    expect(nav).toHaveLength(2);
    expect(nav.find((observation) => observation.snapshotId === "viewport:390")).toMatchObject({
      present: false,
      visible: false,
    });
    expect(nav.find((observation) => observation.snapshotId === "viewport:768")).toMatchObject({
      present: true,
      visible: true,
      parentStableNodeId: "sid_root",
      authored: { display: "flex", width: "100%" },
    });
  });

  it("aggregates authored media and container evidence into frozen IR inputs", () => {
    const input = buildResponsiveInferenceInput(responsiveCapture(), children());
    expect(input.mediaRules).toEqual([
      {
        query: "(min-width: 640px)",
        activeInSnapshotIds: ["viewport:768"],
        affectedProperties: ["display"],
      },
    ]);
    expect(input.containerQueries).toContainEqual({
      containerName: "shell",
      containerType: "inline-size",
      conditions: ["(min-width: 600px)"],
      affectedStableNodeIds: ["sid_nav"],
    });
  });

  it("feeds union observations into the core inference engine", () => {
    const result = inferResponsiveCaptureEvidence(responsiveCapture(), children());
    expect(
      result.payload.rules.some(
        (rule) => rule.targetStableNodeId === "sid_nav" && rule.property === "visibility",
      ),
    ).toBe(true);
    expect(result.breakpointCandidates).toContainEqual(
      expect.objectContaining({ source: "authored-media", boundaryWidth: 640 }),
    );
  });
});
