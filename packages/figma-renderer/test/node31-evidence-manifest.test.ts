import { describe, expect, it } from "vitest";
import { evaluateNode31EvidenceManifest } from "../src/qa/evidence-manifest.js";
import {
  W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES,
  W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES,
  W2F_NODE31_REQUIRED_SECURITY_FIXTURES,
} from "../src/qa/node31-types.js";

const CI_EVIDENCE = "docs/qa/results/NODE-31_CI_CONTRACT_EVIDENCE_736.json";

function collectingManifest(): Record<string, unknown> {
  return {
    version: "1.0.0",
    status: "collecting",
    baselineCommit: "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    classA: [
      {
        id: "deterministic-level1-core",
        measurementStatus: "UNAVAILABLE",
        sourceArtifact: null,
      },
      {
        id: "deterministic-level2-responsive",
        measurementStatus: "UNAVAILABLE",
        sourceArtifact: null,
      },
    ],
    classB: W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.map((category) => ({
      id: `realistic-${category}`,
      category,
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

function readyManifest(): Record<string, unknown> {
  const manifest = collectingManifest();
  manifest.status = "ready";
  manifest.classA = [
    {
      id: "deterministic-level1-core",
      measurementStatus: "PASS",
      sourceArtifact: "qa/corpus/node31/class-a/level1.html",
      measurementArtifact: "docs/qa/results/level1.json",
    },
    {
      id: "deterministic-level2-responsive",
      measurementStatus: "PASS",
      sourceArtifact: "qa/corpus/node31/class-a/level2.html",
      measurementArtifact: "docs/qa/results/level2.json",
    },
  ];
  manifest.classB = W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.map((category) => ({
    id: `realistic-${category}`,
    category,
    measurementStatus: "PASS",
    sourceArtifact: `qa/corpus/node31/class-b/${category}.html`,
    measurementArtifact: `docs/qa/results/${category}.json`,
  }));
  manifest.security = {
    knownCriticalBlockers: 0,
    knownHighBlockers: 0,
    blockerInventoryArtifact: CI_EVIDENCE,
    fixtures: W2F_NODE31_REQUIRED_SECURITY_FIXTURES.map((id) => ({
      id,
      status: "PASS",
      evidenceArtifact: CI_EVIDENCE,
    })),
  };
  manifest.schemaCompatibility = W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES.map((id) => ({
    id,
    status: "PASS",
    evidenceArtifact: CI_EVIDENCE,
  }));
  manifest.knownLimitations = { status: "PASS", evidenceArtifact: CI_EVIDENCE };
  manifest.p0 = { status: "PASS", evidenceArtifact: CI_EVIDENCE };
  manifest.determinism = { status: "PASS", evidenceArtifact: CI_EVIDENCE };
  manifest.scale = { status: "PASS", evidenceArtifact: CI_EVIDENCE };
  return manifest;
}

describe("NODE-31 evidence manifest evaluator", () => {
  it("keeps source-only collecting evidence UNAVAILABLE instead of treating fixtures as measurements", () => {
    const report = evaluateNode31EvidenceManifest(collectingManifest());
    expect(report.status).toBe("UNAVAILABLE");
    expect(report.manifestState).toBe("collecting");
    expect(report.sourceCount).toBe(W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.length);
    expect(report.measuredCount).toBe(0);
    expect(report.missingRealisticCategories).toEqual([]);
  });

  it("fails when a required Class B category disappears", () => {
    const manifest = collectingManifest();
    manifest.classB = (manifest.classB as unknown[]).filter(
      (entry) => (entry as { category?: string }).category !== "ecommerce",
    );
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.missingRealisticCategories).toContain("ecommerce");
  });

  it("requires measurementArtifact provenance before any Class A/B result can PASS", () => {
    const manifest = collectingManifest();
    manifest.classB = (manifest.classB as Record<string, unknown>[]).map((entry, index) =>
      index === 0 ? { ...entry, measurementStatus: "PASS" } : entry,
    );
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("cannot PASS without a measurementArtifact");
  });

  it("requires evidenceArtifact provenance before non-metric evidence can PASS", () => {
    const manifest = readyManifest();
    manifest.schemaCompatibility = (manifest.schemaCompatibility as Record<string, unknown>[]).map(
      (entry, index) => (index === 0 ? { id: entry.id, status: "PASS" } : entry),
    );
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("cannot PASS without an evidenceArtifact");
  });

  it("requires blockerInventoryArtifact before zero blocker counts can be trusted", () => {
    const manifest = readyManifest();
    const security = manifest.security as Record<string, unknown>;
    delete security.blockerInventoryArtifact;
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain(
      "security blocker counts require a blockerInventoryArtifact",
    );
  });

  it("passes a ready manifest only when required evidence is measured and sourced", () => {
    const report = evaluateNode31EvidenceManifest(readyManifest());
    expect(report.status).toBe("PASS");
    expect(report.manifestState).toBe("ready");
    expect(report.measuredCount).toBe(W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.length + 2);
    expect(report.unavailable).toEqual([]);
  });

  it("rejects a ready claim while required evidence is still unavailable", () => {
    const manifest = collectingManifest();
    manifest.status = "ready";
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain(
      "cannot claim ready while required evidence is unavailable",
    );
  });

  it("fails known critical/high security blockers even when fixture statuses are PASS", () => {
    const manifest = readyManifest();
    manifest.security = {
      knownCriticalBlockers: 0,
      knownHighBlockers: 1,
      blockerInventoryArtifact: CI_EVIDENCE,
      fixtures: W2F_NODE31_REQUIRED_SECURITY_FIXTURES.map((id) => ({
        id,
        status: "PASS",
        evidenceArtifact: CI_EVIDENCE,
      })),
    };
    const report = evaluateNode31EvidenceManifest(manifest);
    expect(report.status).toBe("FAIL");
    expect(report.failures.join("\n")).toContain("known security blockers");
  });
});
