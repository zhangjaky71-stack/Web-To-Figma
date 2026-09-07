import { describe, expect, it } from "vitest";
import type {
  W2fNode31MeasurementArtifact,
  W2fStructureQaReport,
  W2fVisualQaReport,
} from "@w2f/figma-renderer";
import { createNode31DesktopEvidenceBundle } from "../src/node31-desktop-evidence.js";

const HASH = (value: string) => value.repeat(64).slice(0, 64);

function partial(): W2fNode31MeasurementArtifact {
  return {
    version: "1.0.0",
    evidenceType: "node31-fidelity-measurement",
    sample: {
      id: "landing-page",
      testClass: "B",
      category: "landing-page",
      supportClass: "native-supported",
      standardHtmlCss: true,
      sourceArtifact: "qa/corpus/node31/class-b/landing-page.html",
      sourceSha256: HASH("a"),
    },
    provenance: {
      branchHead: "1".repeat(40),
      generatedAt: "2026-09-06T00:00:00.000Z",
      environmentFingerprint: "ci-browser-input",
    },
    pipeline: {
      browserCapture: {
        status: "PASS",
        artifact: "landing-page.raw-snapshot.json",
        sha256: HASH("b"),
      },
      wtfPackage: { status: "PASS", artifact: "landing-page.wtf", sha256: HASH("c") },
      secureParse: {
        status: "PASS",
        artifact: "landing-page.parsed-summary.json",
        sha256: HASH("d"),
      },
      figmaRender: {
        status: "UNAVAILABLE",
        reason: "awaiting Desktop",
        host: { kind: "figma-host-simulator", version: "not-executed" },
      },
      figmaExport: { status: "UNAVAILABLE", reason: "awaiting Desktop" },
    },
    metrics: {
      visualSimilarity: { status: "UNAVAILABLE", reason: "awaiting Desktop" },
      editableAreaRatio: { status: "UNAVAILABLE", reason: "awaiting Desktop" },
      rasterAreaRatio: { status: "UNAVAILABLE", reason: "awaiting Desktop" },
    },
    antiCheatingViolations: [],
  };
}

const structureQa = {
  version: "1.0.0",
  status: "PASS",
  metrics: {
    expectedNodeCount: 10,
    mappedNodeCount: 10,
    suppressedRasterDescendantCount: 0,
    mappingCompleteness: 1,
    parentCorrectness: 1,
    siblingOrderCorrectness: 1,
    metadataCorrectness: 1,
    structureScore: 0.98,
    editableAreaRatio: 0.94,
    rasterAreaRatio: 0.04,
  },
  failures: [],
  warnings: [],
} as unknown as W2fStructureQaReport;

const visualQa = {
  version: "1.0.0",
  status: "PASS",
  target: "realistic",
  threshold: 0.95,
  metrics: {
    pixelCount: 100,
    meanAbsoluteChannelError: 2,
    rootMeanSquaredChannelError: 3,
    maxChannelError: 10,
    changedPixelRatio: 0.02,
    normalizedSimilarity: 0.98,
  },
} as unknown as W2fVisualQaReport;

function input(isDesktop: boolean) {
  return {
    baseArtifact: partial(),
    host: {
      isDesktop,
      apiVersion: "1.0.0",
      editorType: "figma",
      userAgent: "Mozilla/5.0 Electron/35 FigmaDesktop",
      platform: "MacIntel",
    },
    intakeId: "intake-1",
    rootNodeId: "1:2",
    createdNodeCount: 10,
    mappedRenderNodeCount: 10,
    importStartedAt: "2026-09-06T01:00:00.000Z",
    importCompletedAt: "2026-09-06T01:00:01.000Z",
    structureQa,
    visualQa,
    referenceId: "full-page:current",
    tiles: [{ tileId: "tile-1", pngBytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) }],
  };
}

describe("createNode31DesktopEvidenceBundle", () => {
  it("refuses browser/cloud Plugin API execution instead of forging Desktop provenance", async () => {
    await expect(createNode31DesktopEvidenceBundle(input(false))).rejects.toThrow(
      /real Figma Desktop host/,
    );
  });

  it("emits hashed render/export/measurement artifacts plus raw PNG evidence", async () => {
    const bundle = await createNode31DesktopEvidenceBundle(input(true));

    expect(bundle.completion.report.status).toBe("PASS");
    expect(bundle.completion.report.releaseEligible).toBe(true);
    expect(bundle.completion.artifact.pipeline.figmaRender.host.kind).toBe("figma-desktop");
    expect(bundle.files.map((file) => file.name)).toEqual([
      "landing-page.figma-render.json",
      "landing-page.figma-export.json",
      "landing-page.measurement.json",
      "landing-page.figma-tile-01-tile-1.png",
    ]);
    for (const file of bundle.files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.bytes.byteLength).toBeGreaterThan(0);
    }
    expect(bundle.completion.artifact.metrics.structureFidelity).toMatchObject({
      status: "MEASURED",
      value: 0.98,
    });
  });
});
