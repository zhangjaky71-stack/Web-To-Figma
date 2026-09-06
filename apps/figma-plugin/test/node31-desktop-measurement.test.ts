import { describe, expect, it } from "vitest";
import type { W2fNode31MeasurementArtifact } from "@w2f/figma-renderer";
import { completeNode31DesktopMeasurement } from "../src/node31-desktop-measurement.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);
const SHA_E = "e".repeat(64);
const HEAD = "1".repeat(40);

function unavailable(reason: string) {
  return { status: "UNAVAILABLE" as const, reason };
}

function partialClassB(): W2fNode31MeasurementArtifact {
  return {
    version: "1.0.0",
    evidenceType: "node31-fidelity-measurement",
    sample: {
      id: "class-b-native",
      testClass: "B",
      category: "landing-page",
      supportClass: "native-supported",
      standardHtmlCss: true,
      sourceArtifact: "qa/corpus/node31/class-b/landing-page.html",
      sourceSha256: SHA_A,
    },
    provenance: {
      branchHead: HEAD,
      generatedAt: "2026-09-06T00:00:00.000Z",
      environmentFingerprint: "linux-ci-input",
    },
    pipeline: {
      browserCapture: {
        status: "PASS",
        artifact: "artifacts/class-b.raw-snapshot.json",
        sha256: SHA_B,
      },
      wtfPackage: {
        status: "PASS",
        artifact: "artifacts/class-b.wtf",
        sha256: SHA_C,
      },
      secureParse: {
        status: "PASS",
        artifact: "artifacts/class-b.parsed-summary.json",
        sha256: SHA_D,
      },
      figmaRender: {
        status: "UNAVAILABLE",
        reason: "awaiting Figma Desktop",
        host: { kind: "figma-host-simulator", version: "not-executed" },
      },
      figmaExport: {
        status: "UNAVAILABLE",
        reason: "awaiting Figma Desktop",
      },
    },
    metrics: {
      visualSimilarity: unavailable("awaiting Desktop pixel comparison"),
      editableAreaRatio: unavailable("awaiting Desktop structure inspection"),
      rasterAreaRatio: unavailable("awaiting Desktop structure inspection"),
    },
    antiCheatingViolations: [],
  };
}

function partialClassA(): W2fNode31MeasurementArtifact {
  const base = partialClassB();
  return {
    ...base,
    sample: {
      ...base.sample,
      id: "deterministic-level1-core",
      testClass: "A",
      category: "deterministic-standard",
      level: 1,
      sourceArtifact: "qa/corpus/node31/class-a/level1-core.html",
    },
    metrics: {
      visualSimilarity: unavailable("awaiting Desktop"),
      geometryFidelity: unavailable("awaiting Desktop"),
      textFidelity: unavailable("awaiting Desktop"),
      assetFidelity: unavailable("awaiting Desktop"),
      structureFidelity: unavailable("awaiting Desktop"),
      responsiveFidelity: unavailable("awaiting Desktop"),
    },
  };
}

const desktopObservation = {
  figmaHostVersion: "Figma Desktop 126.9",
  environmentFingerprint: "darwin-arm64-figma-desktop-126.9",
  render: {
    artifact: "artifacts/class-b.figma-render.json",
    sha256: SHA_D,
  },
  export: {
    artifact: "artifacts/class-b.figma-export.json",
    sha256: SHA_E,
  },
};

describe("completeNode31DesktopMeasurement", () => {
  it("promotes a native-supported Class B sample only after required Desktop metrics exist", () => {
    const completion = completeNode31DesktopMeasurement(partialClassB(), {
      ...desktopObservation,
      metrics: {
        visualSimilarity: 0.972,
        editableAreaRatio: 0.96,
        rasterAreaRatio: 0.03,
      },
      notes: ["Measured inside the real Figma Desktop plugin runtime."],
    });

    expect(completion.report.status).toBe("PASS");
    expect(completion.report.releaseEligible).toBe(true);
    expect(completion.artifact.pipeline.figmaRender.status).toBe("PASS");
    expect(completion.artifact.pipeline.figmaRender.host.kind).toBe("figma-desktop");
    expect(completion.artifact.metrics.visualSimilarity).toMatchObject({
      status: "MEASURED",
      value: 0.972,
      method: "pixel-ground-truth-normalized-rgb",
    });
  });

  it("keeps Class A unavailable when Desktop-only deterministic metrics were not measured", () => {
    const completion = completeNode31DesktopMeasurement(partialClassA(), {
      ...desktopObservation,
      metrics: { visualSimilarity: 0.995 },
    });

    expect(completion.report.status).toBe("UNAVAILABLE");
    expect(completion.report.releaseEligible).toBe(false);
    expect(completion.report.failures).toEqual([]);
    expect(completion.report.unavailable.join(" ")).toContain("geometryFidelity");
  });

  it("rejects a partial artifact whose pre-Desktop pipeline is not provenance-valid", () => {
    const invalid = partialClassB();
    invalid.pipeline.wtfPackage = {
      status: "UNAVAILABLE",
      reason: "package missing",
    };

    expect(() =>
      completeNode31DesktopMeasurement(invalid, {
        ...desktopObservation,
        metrics: {
          visualSimilarity: 0.97,
          editableAreaRatio: 0.95,
          rasterAreaRatio: 0.02,
        },
      }),
    ).toThrow(/wtfPackage must be PASS|base measurement has contract failures/);
  });

  it("rejects forged or malformed Desktop stage digests", () => {
    expect(() =>
      completeNode31DesktopMeasurement(partialClassB(), {
        ...desktopObservation,
        render: { ...desktopObservation.render, sha256: "not-a-digest" },
        metrics: {
          visualSimilarity: 0.97,
          editableAreaRatio: 0.95,
          rasterAreaRatio: 0.02,
        },
      }),
    ).toThrow(/lowercase SHA-256/);
  });
});
