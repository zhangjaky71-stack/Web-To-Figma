import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const historicalAuditPath = "docs/qa/results/NODE-31_P0_AUDIT_1034.json";
const closureEvidencePath = "docs/qa/results/NODE-31_P0_CLOSURE_1053.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
const policyPath = "apps/figma-plugin/src/raster-text-policy.ts";
const policyTestPath = "apps/figma-plugin/test/raster-text-policy.test.ts";
const hybridPath = "apps/figma-plugin/src/figma-hybrid-renderer.ts";
const hybridTestPath = "apps/figma-plugin/test/hybrid-raster.test.ts";

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

function requireFiles(paths) {
  for (const path of paths) {
    assert(existsSync(resolve(root, path)), `missing ${path}`);
  }
}

function sorted(values) {
  return [...values].sort();
}

requireFiles([
  historicalAuditPath,
  closureEvidencePath,
  manifestPath,
  policyPath,
  policyTestPath,
  hybridPath,
  hybridTestPath,
]);

const historicalAudit = readJson(historicalAuditPath);
const closure = readJson(closureEvidencePath);
const manifest = readJson(manifestPath);

if (historicalAudit) {
  assert(
    historicalAudit.policy?.overallStatus === "UNAVAILABLE",
    "Historical P0 audit 1034 must remain immutable and fail-closed",
  );
  assert(
    historicalAudit.blockingUnavailableCount === 1,
    "Historical P0 audit 1034 must retain exactly one blocker",
  );
  assert(
    JSON.stringify(sorted(historicalAudit.blockingUnavailableIds ?? [])) ===
      JSON.stringify(["raster-text-only-when-policy-justifies"]),
    "Historical P0 audit blocker identity changed unexpectedly",
  );
}

if (closure) {
  assert(closure.version === "1.0.0", "P0 closure evidence version mismatch");
  assert(closure.evidenceType === "node31-p0-closure", "P0 closure evidence type mismatch");
  assert(
    closure.historicalAudit === historicalAuditPath,
    "P0 closure must reference the immutable 1034 audit",
  );
  assert(
    closure.auditedFunctionalHead === "ed8416058bcc1eaf1332ffec2fca06bbac0d3a65",
    "P0 closure functional head mismatch",
  );
  assert(closure.ci?.runNumber === 1053, "P0 closure must identify CI #1053");
  assert(closure.ci?.runId === 33621614377, "P0 closure CI run id mismatch");
  assert(closure.ci?.jobId === 100219671800, "P0 closure CI job id mismatch");
  assert(closure.ci?.pullRequest === 38, "P0 closure PR mismatch");
  assert(
    closure.ci?.branchHead === "ed8416058bcc1eaf1332ffec2fca06bbac0d3a65",
    "P0 closure CI branch head mismatch",
  );
  assert(
    closure.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "P0 closure base must remain the NODE-30 merge commit",
  );
  assert(closure.ci?.conclusion === "PASS", "P0 closure CI must be PASS");

  for (const check of [
    "node31Validator",
    "node31CorpusValidator",
    "node31P0HistoricalValidator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "fileProtocolRuntime",
    "browserRuntime",
    "standardCaptureRuntime",
    "visualStateRuntime",
    "pluginUiChooseFileRuntime",
    "pluginCanvasDropRuntime",
    "fontGeometryRuntime",
    "format",
  ]) {
    assert(closure.ci?.qualityChecks?.[check] === "PASS", `P0 closure missing PASS ${check}`);
  }

  assert(
    closure.closedBlocker?.id === "raster-text-only-when-policy-justifies",
    "P0 closure blocker id mismatch",
  );
  assert(closure.closedBlocker?.status === "PASS", "Raster-text P0 blocker must be PASS");
  assert(
    closure.policy?.historicalBlockingUnavailableCount === 1,
    "P0 closure must preserve historical blocker count",
  );
  assert(
    closure.policy?.currentBlockingUnavailableCount === 0,
    "P0 closure must report zero current blockers",
  );
  assert(closure.policy?.p0Status === "PASS", "P0 closure aggregate status must be PASS");
  assert(closure.policy?.unavailableIsPass === false, "UNAVAILABLE must never be treated as PASS");

  for (const assertion of closure.assertions ?? []) {
    assert(assertion.status === "PASS", `P0 closure assertion ${assertion.id} is not PASS`);
  }
  assert(
    (closure.assertions ?? []).length === 11,
    "P0 closure must contain all 11 raster-text authorization assertions",
  );

  for (const path of closure.closedBlocker?.sourceArtifacts ?? []) {
    assert(existsSync(resolve(root, path)), `P0 closure source artifact missing: ${path}`);
  }

  for (const boundary of [
    "zero-known-critical-security-blockers",
    "zero-known-high-security-blockers",
    "known-limitations-currentness",
    "Class-A-visual-geometry-text-asset-structure-measurements",
    "Class-B-browser-to-wtf-to-Figma-measurements",
    "final-release-readiness",
  ]) {
    assert(
      closure.notProvenByThisArtifact?.includes(boundary),
      `P0 closure must not overclaim ${boundary}`,
    );
  }
}

const policy = text(policyPath);
for (const evidence of [
  'W2F_RASTER_TEXT_POLICY_VERSION = "1.0.0"',
  'profile === "design-friendly"',
  "visualJustifications.length === 0",
  "font, geometry, text-quality or pixel-score reasons do not authorize raster text",
  "explicit visual/compositing dependency",
]) {
  assert(policy.includes(evidence), `Raster-text production policy missing ${evidence}`);
}
assert(
  policy.includes("TEXT_QUALITY_REASON_PATTERNS") &&
    policy.includes("VISUAL_JUSTIFICATION_PATTERNS"),
  "Raster-text policy must keep text-quality reasons separate from visual authorization reasons",
);

const policyTests = text(policyTestPath);
for (const evidence of [
  "does not authorize raster text for font, geometry or pixel-score reasons alone",
  "does not mistake an unsupported font reason for an unsupported visual dependency",
  "uses the visual cause, not a font diagnostic, when both are present",
  "preserves ordinary text in design-friendly profile even with a visual dependency",
]) {
  assert(policyTests.includes(evidence), `Raster-text policy tests missing ${evidence}`);
}

const hybrid = text(hybridPath);
for (const evidence of [
  "evaluateRasterTextPolicy(renderTree, node.id, profile)",
  "if (!rasterTextPolicyAllowsRaster(textPolicy))",
  'renderStrategy: "native" as const',
  "nativePreserved.push(textPolicy)",
]) {
  assert(hybrid.includes(evidence), `Hybrid raster integration missing ${evidence}`);
}

const hybridTests = text(hybridTestPath);
for (const evidence of [
  "strips text/assets only when a balanced raster boundary has an explicit visual dependency",
  "preserves text natively and omits the raster surface when only text-quality reasons exist",
  'expect(preserved.renderStrategy).toBe("native")',
  "expect(plan.surfaces).toEqual([])",
]) {
  assert(hybridTests.includes(evidence), `Hybrid raster tests missing ${evidence}`);
}

if (manifest) {
  assert(manifest.p0?.status === "PASS", "RC manifest P0 status must be PASS after closure");
  assert(
    manifest.p0?.evidenceArtifact === closureEvidencePath,
    "RC manifest P0 evidence must point to closure evidence",
  );
  assert(
    manifest.p0?.blockingUnavailableCount === 0,
    "RC manifest P0 must report zero unavailable blockers",
  );
}

if (failures.length > 0) {
  console.error(
    `NODE-31 P0 closure validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-31 P0 closure validation passed.");
}
