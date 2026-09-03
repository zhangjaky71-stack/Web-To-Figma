import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const evidencePath = "docs/qa/results/NODE-31_SECURITY_EVIDENCE_1125.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V2.json";
const historicalEvidencePath = "docs/qa/results/NODE-31_CI_CONTRACT_EVIDENCE_736.json";
const workflowPath = ".github/workflows/ci.yml";

const hostileFixtures = [
  "malformed-archive",
  "path-traversal",
  "oversized-expansion",
  "invalid-checksum",
  "malformed-schema",
  "hostile-svg",
];

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

for (const path of [evidencePath, manifestPath, historicalEvidencePath, workflowPath]) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

const evidence = readJson(evidencePath);
const manifest = readJson(manifestPath);
const historicalEvidence = readJson(historicalEvidencePath);
const workflow = text(workflowPath);

if (evidence) {
  assert(evidence.version === "1.0.0", "Security evidence version mismatch");
  assert(
    evidence.evidenceType === "node31-known-security-blocker-inventory",
    "Security evidence type mismatch",
  );
  assert(evidence.status === "PASS", "Security evidence status must PASS");
  assert(evidence.ci?.runNumber === 1125, "Security evidence must identify CI #1125");
  assert(evidence.ci?.runId === 33740760898, "Security evidence run id mismatch");
  assert(evidence.ci?.jobId === 100601847724, "Security evidence job id mismatch");
  assert(
    evidence.ci?.branchHead === "4ef870e2a963155c4b0119bfbd72fda4b0af902b",
    "Security evidence branch head mismatch",
  );
  assert(evidence.ci?.conclusion === "PASS", "Security evidence CI must PASS");
  assert(evidence.ci?.node === "24.19.0", "Security evidence Node version mismatch");
  assert(evidence.ci?.pnpm === "11.22.0", "Security evidence pnpm version mismatch");
  assert(
    evidence.ci?.dependencyAuditCommand === "pnpm audit --audit-level high",
    "Security evidence audit command mismatch",
  );
  assert(
    evidence.ci?.dependencyAuditResult === "No known vulnerabilities found",
    "Security evidence audit result mismatch",
  );
  assert(evidence.inventory?.knownCriticalBlockers === 0, "Known critical blocker count must be 0");
  assert(evidence.inventory?.knownHighBlockers === 0, "Known high blocker count must be 0");
  assert(
    evidence.inventory?.openGitHubIssuesObserved === 0,
    "Open GitHub issue observation must be 0",
  );
  assert(
    evidence.inventory?.hostileFixtureEvidence === historicalEvidencePath,
    "Hostile fixture evidence path mismatch",
  );
  for (const fixture of hostileFixtures) {
    assert(
      evidence.inventory?.hostileFixtures?.includes(fixture),
      `Security evidence missing hostile fixture ${fixture}`,
    );
  }
  assert(
    evidence.permanentGate?.command === "pnpm audit --audit-level high",
    "Permanent security gate command mismatch",
  );
  assert(
    evidence.permanentGate?.registryErrorsIgnored === false,
    "Registry errors must not be ignored",
  );
  assert(
    evidence.permanentGate?.advisoriesWithoutFixIgnored === false,
    "Advisories without fixes must not be ignored",
  );
  for (const boundary of [
    "zero-known-tracked-critical-high-blockers-in-the-recorded-dependency-audit-open-issue-inventory-and-declared-hostile-fixtures",
    "does-not-prove-absence-of-undiscovered-vulnerabilities",
    "does-not-claim-independent-penetration-testing",
    "does-not-claim-private-security-reporting-channels-were-audited",
    "future-audit-or-hostile-fixture-failures-must-block-release-readiness",
  ]) {
    assert(
      evidence.scopeBoundaries?.includes(boundary),
      `Security scope boundary missing ${boundary}`,
    );
  }
  for (const boundary of [
    "Class-A-fidelity-measurements",
    "Class-B-fidelity-measurements",
    "known-limitations-currentness",
    "absence-of-undiscovered-vulnerabilities",
    "independent-penetration-test",
    "final-release-readiness",
  ]) {
    assert(
      evidence.notProvenByThisArtifact?.includes(boundary),
      `Security evidence must not overclaim ${boundary}`,
    );
  }
}

if (historicalEvidence) {
  assert(
    historicalEvidence.parserAndSecurityFixtures?.status === "PASS",
    "Historical parser/security fixture evidence must remain PASS",
  );
  for (const fixture of hostileFixtures) {
    assert(
      historicalEvidence.parserAndSecurityFixtures?.securityFixtureCases?.includes(fixture),
      `Historical security evidence missing ${fixture}`,
    );
  }
}

if (manifest) {
  assert(manifest.security?.knownCriticalBlockers === 0, "RC V2 critical blocker count must be 0");
  assert(manifest.security?.knownHighBlockers === 0, "RC V2 high blocker count must be 0");
  assert(
    manifest.security?.evidenceArtifact === evidencePath,
    "RC V2 security evidenceArtifact mismatch",
  );
  const byId = new Map((manifest.security?.fixtures ?? []).map((item) => [item.id, item]));
  for (const fixture of hostileFixtures) {
    const entry = byId.get(fixture);
    assert(entry?.status === "PASS", `RC V2 hostile fixture ${fixture} must PASS`);
    assert(
      entry?.evidenceArtifact === historicalEvidencePath,
      `RC V2 hostile fixture ${fixture} evidence path mismatch`,
    );
  }
  for (const item of manifest.classA ?? []) {
    assert(
      item.measurementStatus === "UNAVAILABLE",
      `Security promotion must not silently promote Class A ${item.id}`,
    );
  }
  for (const item of manifest.classB ?? []) {
    assert(
      item.measurementStatus === "UNAVAILABLE",
      `Security promotion must not silently promote Class B ${item.id}`,
    );
  }
}

assert(
  workflow.includes("pnpm audit --audit-level high"),
  "CI must permanently run pnpm audit --audit-level high",
);
for (const prohibited of ["--ignore-registry-errors", "--ignore-unfixable", "--prod"]) {
  assert(!workflow.includes(prohibited), `CI security audit must not contain ${prohibited}`);
}

if (failures.length > 0) {
  console.error(
    `NODE-31 security evidence validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-31 security evidence validation passed.");
}
