import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const evidencePath = "docs/qa/results/NODE-31_NODE30_DETERMINISM_EVIDENCE_715.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V2.json";
const scaleEvidencePath = "docs/qa/results/NODE-31_CI_CONTRACT_EVIDENCE_736.json";
const determinismPath = "packages/figma-renderer/src/qa/determinism.ts";
const determinismInputPath = "packages/figma-renderer/src/qa/determinism-input.ts";
const qaTestPath = "packages/figma-renderer/test/node30-qa.test.ts";
const integrationTestPath = "packages/figma-renderer/test/node30-integration.test.ts";
const node30ValidatorPath = "scripts/validate-node-30.mjs";
const node30DocPath = "docs/nodes/NODE-30_RESPONSIVE_DETERMINISM_PERFORMANCE_QA.md";

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(text(path));
  } catch (error) {
    failures.push(`invalid JSON ${path}: ${String(error)}`);
    return null;
  }
}

for (const path of [
  evidencePath,
  manifestPath,
  scaleEvidencePath,
  determinismPath,
  determinismInputPath,
  qaTestPath,
  integrationTestPath,
  node30ValidatorPath,
  node30DocPath,
]) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

const evidence = readJson(evidencePath);
const manifest = readJson(manifestPath);
const scaleEvidence = readJson(scaleEvidencePath);

if (evidence) {
  assert(evidence.version === "1.0.0", "NODE-30 determinism evidence version mismatch");
  assert(
    evidence.evidenceType === "node31-node30-determinism-promotion",
    "NODE-30 determinism evidence type mismatch",
  );
  assert(evidence.sourceNode === "NODE-30", "Determinism evidence source node mismatch");
  assert(evidence.sourcePullRequest === 37, "Determinism evidence source PR mismatch");
  assert(
    evidence.sourceMergeCommit === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "Determinism evidence merge commit mismatch",
  );
  assert(evidence.ci?.runNumber === 715, "Determinism evidence must identify CI #715");
  assert(evidence.ci?.runId === 32806697455, "Determinism evidence CI run id mismatch");
  assert(evidence.ci?.jobId === 97678100089, "Determinism evidence CI job id mismatch");
  assert(
    evidence.ci?.branchHead === "fc2a56022084bdff459fbe312e0f5ce7969d32c5",
    "Determinism evidence branch head mismatch",
  );
  assert(evidence.ci?.conclusion === "PASS", "Determinism evidence CI must PASS");

  for (const check of [
    "foundation",
    "node27Validator",
    "node28Validator",
    "node29Validator",
    "node30Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "format",
  ]) {
    assert(evidence.ci?.qualityChecks?.[check] === "PASS", `Determinism missing PASS ${check}`);
  }

  assert(evidence.measurement?.status === "PASS", "Determinism measurement must PASS");
  assert(evidence.measurement?.class === "A", "Determinism measurement must be Class A");
  assert(
    evidence.measurement?.kind === "versioned-w2f-ir-determinism-fixture",
    "Determinism measurement kind mismatch",
  );
  assert(evidence.measurement?.requiredRuns === 10, "Determinism must require 10 runs");
  assert(evidence.measurement?.observedRuns === 10, "Determinism must record 10 observed runs");
  assert(
    evidence.measurement?.environmentFingerprint === "ubuntu-24-node-24-node30-v1",
    "Determinism environment fingerprint mismatch",
  );

  for (const fingerprint of [
    "assetHash",
    "sourceGraphHash",
    "renderTreeHash",
    "stableIdentityHash",
    "layoutDecisionHash",
  ]) {
    assert(
      evidence.measurement?.comparedFingerprints?.includes(fingerprint),
      `Determinism evidence missing ${fingerprint}`,
    );
  }

  for (const key of ["capturedAt", "captureId", "revisionId", "parentRevisionId"]) {
    assert(
      evidence.measurement?.volatileSourceGraphKeysExcluded?.includes(key),
      `Determinism volatile-key boundary missing ${key}`,
    );
  }

  for (const path of evidence.sourceArtifacts ?? []) {
    assert(existsSync(resolve(root, path)), `Determinism source artifact missing: ${path}`);
  }

  for (const boundary of [
    "browser-runtime-repeat-capture-determinism",
    "Class-A-visual-similarity",
    "Class-A-geometry-text-asset-structure-fidelity",
    "Class-B-browser-to-wtf-to-Figma-measurements",
    "zero-known-critical-security-blockers",
    "zero-known-high-security-blockers",
    "known-limitations-currentness",
    "final-release-readiness",
  ]) {
    assert(
      evidence.notProvenByThisArtifact?.includes(boundary),
      `Determinism evidence must not overclaim ${boundary}`,
    );
  }
}

const determinism = text(determinismPath);
for (const marker of [
  "W2F_NODE30_REQUIRED_DETERMINISM_RUNS",
  "VOLATILE_SOURCE_GRAPH_KEYS",
  "assetHash",
  "sourceGraphHash",
  "renderTreeHash",
  "stableIdentityHash",
  "layoutDecisionHash",
  "different environment fingerprint",
]) {
  assert(determinism.includes(marker), `Determinism production evaluator missing ${marker}`);
}

const qaTests = text(qaTestPath);
for (const marker of [
  "passes ten identical semantic captures in one declared environment",
  "does not silently pass fewer than ten runs",
  "fails when one repeat run comes from a different environment",
  "fails when layout decisions randomly change",
]) {
  assert(qaTests.includes(marker), `Determinism QA tests missing ${marker}`);
}

const integrationTests = text(integrationTestPath);
for (const marker of [
  "builds ten comparable runs from real W2F IR and ignores only declared revision metadata",
  "createDeterminismRunFromIr",
  'expect(report.status).toBe("PASS")',
  "requires asset hashes",
]) {
  assert(integrationTests.includes(marker), `Determinism integration tests missing ${marker}`);
}

if (manifest) {
  assert(manifest.determinism?.status === "PASS", "RC V2 determinism status must be PASS");
  assert(
    manifest.determinism?.evidenceArtifact === evidencePath,
    "RC V2 determinism evidenceArtifact mismatch",
  );
  assert(manifest.scale?.status === "PASS", "RC V2 NODE-30 scale status must remain PASS");
  assert(
    manifest.scale?.evidenceArtifact === scaleEvidencePath,
    "RC V2 scale evidenceArtifact mismatch",
  );
}

if (scaleEvidence) {
  assert(scaleEvidence.node30Scale?.status === "PASS", "NODE-30 scale evidence must remain PASS");
  assert(scaleEvidence.node30Scale?.measuredRuns === 5, "NODE-30 scale run count mismatch");
  assert(scaleEvidence.node30Scale?.createdNodeTarget === 10000, "NODE-30 scale target mismatch");
  assert(
    scaleEvidence.node30Scale?.fatalCrash === false,
    "NODE-30 scale must report no fatal crash",
  );
}

if (failures.length > 0) {
  console.error(
    `NODE-31 NODE-30 evidence validation failed:\n${failures
      .map((item) => `- ${item}`)
      .join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-31 NODE-30 evidence validation passed.");
}
