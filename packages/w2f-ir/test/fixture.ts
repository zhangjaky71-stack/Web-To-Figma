import type { WtfIrBundle, WtfLayoutModel, WtfPaintModel } from "../src/index.js";

const HASH = "a".repeat(64);

function layout(mode: WtfLayoutModel["mode"]): WtfLayoutModel {
  return {
    mode,
    display: mode === "flex" ? "flex" : "block",
    position: "static",
    sizing: {
      width: { mode: "fill", confidence: 1, reasons: ["fixture"] },
      height: { mode: "hug", confidence: 1, reasons: ["fixture"] },
    },
    decision: { confidence: 1, reasons: ["fixture"] },
  };
}

function paint(): WtfPaintModel {
  return { fills: [], opacity: 1 };
}

export function createIrBundle(): WtfIrBundle {
  return {
    document: {
      irVersion: "2.0.0",
      documentId: "doc_fixture",
      captureId: "cap_fixture",
      revisionId: "rev_fixture",
      sourceFingerprint: HASH,
      sourceGraphRootId: "source_root",
      renderTreeRootId: "render_root",
      environmentRefs: ["env_desktop"],
      environments: [
        {
          id: "env_desktop",
          browserName: "Chromium",
          browserVersion: "140.0.0",
          platform: "test",
          language: "en-US",
          direction: "ltr",
          colorScheme: "light",
          reducedMotion: false,
          viewportWidth: 1440,
          viewportHeight: 900,
          dpr: 2,
          pageZoom: 1,
        },
      ],
      animationCaptureMode: "freeze-current",
      visualState: "current",
    },
    sourceGraph: {
      rootCaptureNodeId: "source_root",
      nodes: [
        {
          captureNodeId: "source_root",
          stableIdentity: { id: "sid_root", confidence: 1, evidence: ["document"] },
          kind: "document",
          relationships: {},
          childCaptureNodeIds: ["source_hero"],
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        },
        {
          captureNodeId: "source_hero",
          stableIdentity: { id: "sid_hero", confidence: 0.98, evidence: ["section.hero"] },
          kind: "element",
          relationships: {
            sourceParentId: "source_root",
            composedParentId: "source_root",
          },
          childCaptureNodeIds: ["source_title"],
          tagName: "section",
          sourceSelector: "section.hero",
          geometry: {
            bounds: { x: 40.25, y: 80.5, width: 1359.5, height: 420.25 },
          },
          styleRef: "style_hero",
          structuralFingerprint: {
            semanticHash: "semantic-hero",
            layoutHash: "layout-hero",
            combinedHash: "combined-hero",
            confidence: 0.95,
          },
        },
        {
          captureNodeId: "source_title",
          stableIdentity: { id: "sid_title", confidence: 0.97, evidence: ["h1"] },
          kind: "text",
          relationships: {
            sourceParentId: "source_hero",
            composedParentId: "source_hero",
          },
          childCaptureNodeIds: [],
          textContent: "Hello",
          geometry: {
            bounds: { x: 64.33333333333333, y: 120.125, width: 220.75, height: 58.5 },
          },
          styleRef: "style_title",
        },
      ],
      scrollContainers: [],
      revision: {
        documentId: "doc_fixture",
        captureId: "cap_fixture",
        revisionId: "rev_fixture",
        sourceFingerprint: HASH,
        capturedAt: "2026-08-22T09:00:00.000Z",
      },
    },
    renderTree: {
      rootId: "render_root",
      nodes: [
        {
          id: "render_root",
          childIds: ["render_hero"],
          sourceNodeIds: ["source_root"],
          sourceStableIds: ["sid_root"],
          kind: "document",
          name: "Document",
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
          layout: layout("flow"),
          paint: paint(),
          renderStrategy: "native",
          renderDecision: { confidence: 1, reasons: ["document root"] },
        },
        {
          id: "render_hero",
          parentId: "render_root",
          childIds: ["render_title"],
          sourceNodeIds: ["source_hero"],
          sourceStableIds: ["sid_hero"],
          kind: "section",
          name: "Hero",
          geometry: { bounds: { x: 40.25, y: 80.5, width: 1359.5, height: 420.25 } },
          layout: layout("flex"),
          paint: paint(),
          renderStrategy: "native",
          renderDecision: { confidence: 0.99, reasons: ["supported flex layout"] },
          diagnosticIds: ["diag_hero"],
        },
        {
          id: "render_title",
          parentId: "render_hero",
          childIds: [],
          sourceNodeIds: ["source_title"],
          sourceStableIds: ["sid_title"],
          kind: "text",
          name: "Heading",
          geometry: {
            bounds: { x: 64.33333333333333, y: 120.125, width: 220.75, height: 58.5 },
          },
          layout: layout("inline"),
          paint: paint(),
          text: {
            value: "Hello",
            runs: [
              {
                start: 0,
                end: 5,
                text: "Hello",
                font: { family: "Inter", weight: 700 },
                fontSize: 48,
                lineHeight: 58.5,
              },
            ],
            fragments: [
              {
                start: 0,
                end: 5,
                bounds: {
                  x: 64.33333333333333,
                  y: 120.125,
                  width: 220.75,
                  height: 58.5,
                },
                baseline: 164.25,
                lineIndex: 0,
              },
            ],
            editableStrategyHint: "balanced",
          },
          renderStrategy: "native",
          renderDecision: { confidence: 0.98, reasons: ["editable text"] },
        },
      ],
      sections: [
        {
          id: "section_hero",
          renderNodeId: "render_hero",
          name: "Hero",
          kind: "section",
          childSectionIds: [],
        },
      ],
    },
    styles: {
      styles: [
        {
          id: "style_hero",
          declarations: [
            {
              property: "display",
              computedValue: "flex",
              authoredValue: "flex",
              source: { selector: ".hero" },
            },
          ],
        },
        {
          id: "style_title",
          declarations: [
            {
              property: "font-size",
              computedValue: "48px",
              authoredValue: "3rem",
              source: { selector: ".hero h1" },
            },
          ],
        },
      ],
    },
    assets: { assets: [], referenceTiles: [] },
    responsive: {
      snapshots: [
        {
          id: "snapshot_desktop",
          viewport: { width: 1440, height: 900, dpr: 2 },
          rootNodeId: "source_root",
          environmentRef: "env_desktop",
          stateRef: "state_current",
        },
      ],
      rules: [
        {
          targetStableNodeId: "sid_hero",
          property: "widthSizing",
          ranges: [{ minWidth: 1024, value: "fill", snapshotIds: ["snapshot_desktop"] }],
          confidence: 0.96,
          reasons: ["authored width and snapshot geometry"],
        },
      ],
      mediaRules: [],
      containerQueries: [],
    },
    states: {
      states: [
        {
          id: "state_current",
          name: "Current",
          rootNodeId: "source_root",
          visualState: "current",
          environmentRef: "env_desktop",
        },
      ],
    },
    diagnostics: {
      diagnostics: [
        {
          id: "diag_hero",
          code: "W2F_I_LAYOUT_NATIVE",
          domain: "LAYOUT",
          severity: "info",
          message: "Hero can use a native layout plan.",
          sourceNodeIds: ["source_hero"],
          renderNodeIds: ["render_hero"],
          evidence: ["display:flex"],
        },
      ],
    },
    tokens: { tokens: [], usages: [] },
  };
}
