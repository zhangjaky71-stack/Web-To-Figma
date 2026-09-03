import type { RawSnapshot } from "@w2f/capture-core";
import type { ResponsiveInferenceResult } from "@w2f/responsive-inference";
import type { WtfDocumentPayload, WtfResponsivePayload, WtfSourceGraph } from "@w2f/w2f-ir";
import { describe, expect, it } from "vitest";
import { buildResponsiveStableNodeEvidence } from "../src/runtime/responsive-capture-runtime.js";
import {
  buildWtfPackageInput,
  type WtfPackageEvidence,
} from "../src/runtime/wtf-package-builder.js";

function snapshot(): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "cdp",
    capturedAt: "2026-09-03T12:00:00.000Z",
    url: "https://example.com/responsive-package-contract",
    title: "Responsive Package Contract",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1440,
      viewportHeight: 900,
      scale: {
        context: { devicePixelRatio: 1 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
      layoutMetrics: {
        contentSize: { x: 0, y: 0, width: 1440, height: 1200 },
        layoutViewport: { pageX: 0, pageY: 0, clientWidth: 1425, clientHeight: 900 },
        visualViewport: {
          offsetX: 0,
          offsetY: 0,
          pageX: 0,
          pageY: 0,
          clientWidth: 1425,
          clientHeight: 900,
          scale: 1,
        },
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["node:proof"],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width: 1440, height: 1200 } },
      },
      {
        captureNodeId: "node:proof",
        kind: "element",
        relationships: { sourceParentId: "doc:root", composedParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: {
          tagName: "DIV",
          attributes: { id: "responsive-proof", "data-node31-role": "responsive-proof" },
        },
        textContent: "Responsive proof",
        geometry: { bounds: { x: 24, y: 24, width: 320, height: 80 } },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

function evidence(raw: RawSnapshot, stableNodeId: string): WtfPackageEvidence {
  return {
    jobId: "job-responsive-package-contract",
    snapshot: raw,
    css: {
      version: "1.0.0",
      adapter: "browser-cssom",
      snapshotId: `snapshot:${raw.capturedAt}`,
      styles: [],
      cascade: { nodes: [] },
      tokens: { tokens: [], usages: [] },
      unresolvedTokenUsages: [],
      diagnostics: [],
    },
    environment: {
      version: "1.0.0",
      adapter: "cdp",
      snapshotId: `snapshot:${raw.capturedAt}`,
      environment: {
        browserName: "Chrome",
        browserVersion: "151",
        platform: "Linux",
        language: "en-US",
        direction: "ltr",
        colorScheme: "light",
        reducedMotion: false,
        viewportWidth: 1440,
        viewportHeight: 900,
        dpr: 1,
        pageZoom: 1,
        pageZoomAvailability: "observed",
        cssZoomAvailability: "unavailable",
      },
      mediaRules: [],
      containers: [],
      containerQueries: [],
      diagnostics: [],
    },
    assets: {
      version: "1.0.0",
      adapter: "browser-runtime",
      snapshotId: `snapshot:${raw.capturedAt}`,
      assets: [],
      diagnostics: [],
    },
    pixel: {
      version: "1.0.0",
      adapter: "cdp",
      snapshotId: `snapshot:${raw.capturedAt}`,
      tileSizePx: 512,
      references: [],
      tileResources: [],
      diagnostics: [],
    },
    compositing: {
      version: "1.0.0",
      tree: {
        rootId: "render:root",
        nodes: [
          {
            id: "render:root",
            kind: "document",
            sourceNodeIds: ["doc:root"],
            childIds: [],
          },
        ],
      },
      boundaries: [],
      decisions: [],
      diagnostics: [],
    },
    responsive: {
      payload: {
        snapshots: [
          {
            id: "viewport:1440x900@1",
            viewport: { width: 1440, height: 900, dpr: 1 },
            rootNodeId: "doc:root",
            environmentRef: "environment:storage:1440",
          },
          {
            id: "viewport:768x900@1",
            viewport: { width: 768, height: 900, dpr: 1 },
            rootNodeId: "doc:root",
            environmentRef: "environment:storage:768",
          },
          {
            id: "viewport:390x900@1",
            viewport: { width: 390, height: 900, dpr: 1 },
            rootNodeId: "doc:root",
            environmentRef: "environment:storage:390",
          },
        ],
        rules: [
          {
            targetStableNodeId: stableNodeId,
            property: "visibility",
            ranges: [],
            confidence: 1,
            evidence: ["node31-responsive-contract"],
          },
        ],
        mediaRules: [],
        containerQueries: [],
      },
      diagnostics: [],
    } as unknown as ResponsiveInferenceResult,
  } as unknown as WtfPackageEvidence;
}

function jsonPayload<T>(input: Awaited<ReturnType<typeof buildWtfPackageInput>>, role: string): T {
  const payload = input.payloads.find((item) => item.role === role);
  expect(payload).toBeDefined();
  if (!payload || !("json" in payload)) throw new Error(`missing JSON payload: ${role}`);
  return payload.json as T;
}

describe("responsive .wtf package cross-reference contract", () => {
  it("emits logical responsive environments and source stable identities", async () => {
    const raw = snapshot();
    const stableNodes = await buildResponsiveStableNodeEvidence(raw);
    const proofStable = stableNodes.find((node) => node.captureNodeId === "node:proof");
    expect(proofStable).toBeDefined();

    const input = await buildWtfPackageInput(evidence(raw, proofStable!.stableNodeId));
    const document = jsonPayload<WtfDocumentPayload>(input, "document");
    const responsive = jsonPayload<WtfResponsivePayload>(input, "responsive");
    const source = jsonPayload<WtfSourceGraph>(input, "source-graph");

    const environmentIds = new Set(document.environments.map((item) => item.id));
    expect(document.environmentRefs).toEqual(document.environments.map((item) => item.id));
    expect(responsive.snapshots).toHaveLength(3);
    for (const responsiveSnapshot of responsive.snapshots) {
      expect(responsiveSnapshot.environmentRef).toMatch(/^env:responsive:/);
      expect(responsiveSnapshot.environmentRef).not.toMatch(/^environment:storage:/);
      expect(environmentIds.has(responsiveSnapshot.environmentRef)).toBe(true);
      const environment = document.environments.find(
        (item) => item.id === responsiveSnapshot.environmentRef,
      );
      expect(environment?.viewportWidth).toBe(responsiveSnapshot.viewport.width);
      expect(environment?.viewportHeight).toBe(responsiveSnapshot.viewport.height);
      expect(environment?.dpr).toBe(responsiveSnapshot.viewport.dpr);
    }

    const proofSource = source.nodes.find((node) => node.captureNodeId === "node:proof");
    expect(proofSource?.stableIdentity?.id).toBe(proofStable!.stableNodeId);
    expect(proofSource?.stableIdentity?.confidence).toBe(proofStable!.confidence);
    expect(responsive.rules[0]?.targetStableNodeId).toBe(proofSource?.stableIdentity?.id);
    expect(input.compatibility.capabilities).toContain("stable-identity");
    expect(input.compatibility.capabilities).toContain("responsive-snapshots");
  });
});
