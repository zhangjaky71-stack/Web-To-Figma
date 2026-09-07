import { describe, expect, it } from "vitest";
import { applyNode31MeasurementArtifactToManifest } from "../src/qa/evidence-promotion.js";
import type { W2fNode31MeasurementArtifact } from "../src/qa/measurement-artifact.js";
import {
  W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES,
  W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES,
  W2F_NODE31_REQUIRED_SECURITY_FIXTURES,
} from "../src/qa/node31-types.js";

const BRANCH_HEAD = "b".repeat(40);
const SHA256 = "a".repeat(64);
const SOURCE = "qa/corpus/node31/class-b/landing-page.html";
const MEASUREMENT_PATH =
  "docs/qa/results/node31-desktop/realistic-landing-page/realistic-landing-page.measurement.json";

function collectingManifest(): Record<string, unknown> {
  return {
    version: "1.0.0",
    status: "collecting",
    baselineCommit: "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    classA: [
      {
        id: "deterministic-level1-core",
        level: 1,
        measurementStatus: "UNAVAILABLE",
        sourceArtifact: "qa/corpus/node31/class-a/level1-core.html",
      },
      {
        id: "deterministic-level2-responsive",
        level: 2,
        measurementStatus: "UNAVAILABLE",
        sourceArtifact: "qa/corpus/node31/class-a/level2-responsive.html",
      },
    ],
    classB: W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.map((category) => ({
      id: `realistic-${category}`,
      category,
      supportClass:
        category === "canvas" || category === "webgl" ? "expected-fallback" : "native-supported",
      standardHtmlCss: category !== "canvas" && category !== "webgl",
      measurementStatus: "UNAVAILABLE",
      sourceArtifact: `qa/corpus/node31/class-b/${category}.html`,
    })),
    security: {
      knownCriticalBlockers: null,
      knownHighBlockers: null,
      fixtures: W2F_NODE31_REQUIRED_SECURITY_FIXTURES.map((id) => ({
        id,
        status: "UNAVAILABLE",
      })),
    },
    schemaCompatibility: W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES.map((id) => ({
      id,
      status: "UNAVAILABLE",
    })),
    knownLimitations: { status: "UNAVAILABLE" },
    p0: { status: "UNAVAILABLE" },
    determinism: { status: "UNAVAILABLE" },
    scale: { status: "UNAVAILABLE" },
  };
}

function desktopMeasurement(
  overrides: Partial<W2fNode31MeasurementArtifact> = {},
): W2fNode31MeasurementArtifact {
  const base: W2fNode31MeasurementArtifact = {
    version: "1.0.0",
    evidenceType: "node31-fidelity-measurement",
    sample: {
      id: "realistic-landing-page",
      testClass: "B",
      category: "landing-page",
      supportClass: "native-supported",
      standardHtmlCss: true,
      sourceArtifact: SOURCE,
      sourceSha256: SHA256,
    },
    provenance: {
      branchHead: BRANCH_HEAD,
      generatedAt: "2026-09-07T00:00:00.000Z",
      environmentFingerprint: "figma-desktop:test",
    },
    pipeline: {
      browserCapture: { status: "PASS", artifact: "browser.json", sha256: SHA256 },
      wtfPackage: { status: "PASS", artifact: "sample.wtf", sha256: SHA256 },
      secureParse: { status: "PASS", artifact: "parse.json", sha256: SHA256 },
      figmaRender: {
        status: "PASS",
        artifact: "figma-render.json",
        sha256: SHA256,
        host: {
          kind: "figma-desktop",
          version: "desktop-test",
          evidenceArtifact: "figma-host.json",
        },
      },
      figmaExport: { status: "PASS", artifact: "figma-export.json", sha256: SHA256 },
    },
    metrics: {
      visualSimilarity: {
        status: "MEASURED",
        value: 0.99,
        method: "pixel-ground-truth-normalized-rgb",
        referenceArtifact: "reference.png",
        observedArtifact: "observed.png",
      },
      editableAreaRatio: {
        status: "MEASURED",
        value: 0.95,
        method: "native-editable-area",
        referenceArtifact: "render-tree.json",
        observedArtifact: "figma-render.json",
      },
      rasterAreaRatio: {
        status: "MEASURED",
        value: 0.05,
        method: "raster-surface-area",
        referenceArtifact: "render-tree.json",
        observedArtifact: "figma-render.json",
      },
    },
    antiCheatingViolations: [],
  };
  return {
    ...base,
    ...overrides,
    sample: { ...base.sample, ...(overrides.sample ?? {}) },
    provenance: { ...base.provenance, ...(overrides.provenance ?? {}) },
    pipeline: { ...base.pipeline, ...(overrides.pipeline ?? {}) },
    metrics: { ...base.metrics, ...(overrides.metrics ?? {}) },
  };
}

function classBEntry(manifest: Record<string, unknown>): Record<string, unknown> {
  const entries = manifest.classB as Record<string, unknown>[];
  const entry = entries.find((item) => item.id === "realistic-landing-page");
  if (!entry) throw new Error("landing page manifest row missing");
  return entry;
}

describe("NODE-31 evidence promotion", () => {
  it("promotes one matching real Desktop measurement without mutating the collecting manifest", () => {
    const manifest = collectingManifest();
    const updated = applyNode31MeasurementArtifactToManifest(manifest, desktopMeasurement(), {
      measurementArtifact: MEASUREMENT_PATH,
      expectedBranchHead: BRANCH_HEAD,
    });

    expect(classBEntry(manifest).measurementStatus).toBe("UNAVAILABLE");
    expect(classBEntry(updated)).toMatchObject({
      measurementStatus: "PASS",
      measurementArtifact: MEASUREMENT_PATH,
    });
    expect(updated.status).toBe("collecting");
  });

  it("rejects stale exact-head evidence", () => {
    expect(() =>
      applyNode31MeasurementArtifactToManifest(collectingManifest(), desktopMeasurement(), {
        measurementArtifact: MEASUREMENT_PATH,
        expectedBranchHead: "c".repeat(40),
      }),
    ).toThrow("NODE31_E_PROMOTION_HEAD");
  });

  it("rejects simulator-host evidence before touching the manifest", () => {
    const artifact = desktopMeasurement({
      pipeline: {
        ...desktopMeasurement().pipeline,
        figmaRender: {
          ...desktopMeasurement().pipeline.figmaRender,
          host: {
            kind: "figma-host-simulator",
            evidenceArtifact: "simulator.json",
          },
        },
      },
    });
    expect(() =>
      applyNode31MeasurementArtifactToManifest(collectingManifest(), artifact, {
        measurementArtifact: MEASUREMENT_PATH,
        expectedBranchHead: BRANCH_HEAD,
      }),
    ).toThrow("NODE31_E_PROMOTION_MEASUREMENT");
  });

  it("rejects source mismatches even when the measurement contract itself passes", () => {
    const artifact = desktopMeasurement({
      sample: {
        ...desktopMeasurement().sample,
        sourceArtifact: "qa/corpus/node31/class-b/other.html",
      },
    });
    expect(() =>
      applyNode31MeasurementArtifactToManifest(collectingManifest(), artifact, {
        measurementArtifact: MEASUREMENT_PATH,
        expectedBranchHead: BRANCH_HEAD,
      }),
    ).toThrow("NODE31_E_PROMOTION_SOURCE");
  });

  it("refuses to replace an existing PASS row with a different measurement artifact", () => {
    const promoted = applyNode31MeasurementArtifactToManifest(
      collectingManifest(),
      desktopMeasurement(),
      {
        measurementArtifact: MEASUREMENT_PATH,
        expectedBranchHead: BRANCH_HEAD,
      },
    );
    expect(() =>
      applyNode31MeasurementArtifactToManifest(promoted, desktopMeasurement(), {
        measurementArtifact: "docs/qa/results/node31-desktop/conflicting.measurement.json",
        expectedBranchHead: BRANCH_HEAD,
      }),
    ).toThrow("NODE31_E_PROMOTION_CONFLICT");
  });
});
