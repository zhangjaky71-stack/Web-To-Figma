import { describe, expect, it } from "vitest";
import {
  W2F_NODE31_MEASUREMENT_METHODS,
  evaluateNode31MeasurementArtifact,
  type W2fNode31MeasuredMetricEvidence,
  type W2fNode31MeasurementArtifact,
  type W2fNode31MeasurementMetricId,
  type W2fNode31MeasurementStageEvidence,
} from "../src/qa/index.js";

const SHA256 = "a".repeat(64);
const BRANCH_HEAD = "b".repeat(40);

function passStage(name: string): W2fNode31MeasurementStageEvidence {
  return {
    status: "PASS",
    artifact: `docs/qa/results/${name}.json`,
    sha256: SHA256,
  };
}

function measuredMetric(
  id: W2fNode31MeasurementMetricId,
  value: number,
): W2fNode31MeasuredMetricEvidence {
  return {
    status: "MEASURED",
    value,
    method: W2F_NODE31_MEASUREMENT_METHODS[id],
    referenceArtifact: `docs/qa/results/${id}-reference.png`,
    observedArtifact: `docs/qa/results/${id}-observed.png`,
  };
}

function classAArtifact(): W2fNode31MeasurementArtifact {
  return {
    version: "1.0.0",
    evidenceType: "node31-fidelity-measurement",
    sample: {
      id: "deterministic-level1-core",
      testClass: "A",
      category: "deterministic-standard",
      supportClass: "native-supported",
      standardHtmlCss: true,
      level: 1,
      sourceArtifact: "qa/corpus/node31/class-a/level1.html",
      sourceSha256: SHA256,
    },
    provenance: {
      branchHead: BRANCH_HEAD,
      generatedAt: "2026-09-03T10:00:00.000Z",
      environmentFingerprint: "ubuntu-24-chrome-151-figma-desktop-v1",
      ciRunId: 1,
    },
    pipeline: {
      browserCapture: passStage("browser-capture"),
      wtfPackage: passStage("wtf-package"),
      secureParse: passStage("secure-parse"),
      figmaRender: {
        ...passStage("figma-render"),
        host: {
          kind: "figma-desktop",
          version: "desktop-test-version",
          evidenceArtifact: "docs/qa/results/figma-host.json",
        },
      },
      figmaExport: passStage("figma-export"),
    },
    metrics: {
      visualSimilarity: measuredMetric("visualSimilarity", 0.995),
      geometryFidelity: measuredMetric("geometryFidelity", 0.99),
      textFidelity: measuredMetric("textFidelity", 0.98),
      assetFidelity: measuredMetric("assetFidelity", 1),
      structureFidelity: measuredMetric("structureFidelity", 0.97),
      responsiveFidelity: measuredMetric("responsiveFidelity", 0.95),
    },
    antiCheatingViolations: [],
  };
}

describe("NODE-31 measurement artifact contract", () => {
  it("promotes a complete Figma Desktop measurement into a release corpus sample", () => {
    const report = evaluateNode31MeasurementArtifact(classAArtifact());
    expect(report.status).toBe("PASS");
    expect(report.releaseEligible).toBe(true);
    expect(report.corpusSample?.id).toBe("deterministic-level1-core");
    expect(report.corpusSample?.visualSimilarity).toBe(0.995);
    expect(report.corpusSample?.textFidelity).toBe(0.98);
  });

  it("keeps simulator evidence UNAVAILABLE even when every metric has a high score", () => {
    const artifact = classAArtifact();
    artifact.pipeline.figmaRender.host.kind = "figma-host-simulator";
    const report = evaluateNode31MeasurementArtifact(artifact);
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.releaseEligible).toBe(false);
    expect(report.corpusSample).toBeUndefined();
    expect(report.unavailable.join("\n")).toContain("requires figma-desktop host");
  });

  it("keeps partial Class A metric evidence UNAVAILABLE instead of skipping it", () => {
    const artifact = classAArtifact();
    delete artifact.metrics.textFidelity;
    const report = evaluateNode31MeasurementArtifact(artifact);
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.releaseEligible).toBe(false);
    expect(report.unavailable).toContain("textFidelity evidence is missing");
  });

  it("fails an out-of-range value or a metric measured with the wrong method", () => {
    const artifact = classAArtifact();
    artifact.metrics.visualSimilarity = {
      ...measuredMetric("visualSimilarity", 1.01),
      method: W2F_NODE31_MEASUREMENT_METHODS.geometryFidelity,
    };
    const report = evaluateNode31MeasurementArtifact(artifact);
    expect(report.status).toBe("FAIL");
    expect(report.releaseEligible).toBe(false);
    const failures = report.failures.join("\n");
    expect(failures).toContain("visualSimilarity must be a normalized finite value");
    expect(failures).toContain("visualSimilarity must use measurement method");
  });

  it("requires editable and raster evidence for native Class B but not documented fallback", () => {
    const nativeArtifact = classAArtifact();
    nativeArtifact.sample = {
      id: "realistic-ecommerce",
      testClass: "B",
      category: "ecommerce",
      supportClass: "native-supported",
      standardHtmlCss: true,
      sourceArtifact: "qa/corpus/node31/class-b/ecommerce.html",
      sourceSha256: SHA256,
    };
    nativeArtifact.metrics = {
      visualSimilarity: measuredMetric("visualSimilarity", 0.96),
    };
    const nativeReport = evaluateNode31MeasurementArtifact(nativeArtifact);
    expect(nativeReport.status).toBe("UNAVAILABLE");
    expect(nativeReport.unavailable).toContain("editableAreaRatio evidence is missing");
    expect(nativeReport.unavailable).toContain("rasterAreaRatio evidence is missing");

    const fallbackArtifact = classAArtifact();
    fallbackArtifact.sample = {
      id: "realistic-canvas",
      testClass: "B",
      category: "canvas",
      supportClass: "expected-fallback",
      standardHtmlCss: false,
      sourceArtifact: "qa/corpus/node31/class-b/canvas.html",
      sourceSha256: SHA256,
    };
    fallbackArtifact.metrics = {
      visualSimilarity: measuredMetric("visualSimilarity", 0.96),
    };
    const fallbackReport = evaluateNode31MeasurementArtifact(fallbackArtifact);
    expect(fallbackReport.status).toBe("PASS");
    expect(fallbackReport.releaseEligible).toBe(true);
  });

  it("fails any artifact that records an anti-cheating violation", () => {
    const artifact = classAArtifact();
    artifact.antiCheatingViolations = ["ordinary text replaced by a page screenshot"];
    const report = evaluateNode31MeasurementArtifact(artifact);
    expect(report.status).toBe("FAIL");
    expect(report.releaseEligible).toBe(false);
    expect(report.failures.join("\n")).toContain("ordinary text replaced by a page screenshot");
  });
});
