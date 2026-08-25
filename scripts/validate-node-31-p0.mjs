import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_764.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
const runtimeEvidencePath = "docs/qa/results/NODE-31_BROWSER_RUNTIME_EVIDENCE_764.json";
const runtimeHarnessPath = "scripts/run-node-31-browser-runtime.mjs";
const runtimeProductSourcePath = "apps/browser-extension/src/runtime/content-script.ts";
const runtimeBuiltArtifactPath = "apps/browser-extension/dist/runtime/content-script.js";

const requiredIds = {
  capture: [
    "current-document-deterministic-online",
    "file-protocol-explicit-permission",
    "local-folder-relative-asset-resolution",
    "region-intersections-and-structural-ancestors",
    "document-and-primary-app-scroll-root-semantics",
    "open-shadow-dom-slot-composed-tree",
    "same-origin-iframe",
    "inaccessible-cross-origin-frame-diagnostic",
    "visual-state-freeze-and-restore",
    "finally-scroll-focus-temporary-style-restore",
  ],
  packageAcceptance: [
    "canonical-container-manifest-checksums-determinism",
    "malicious-package-fails-before-render",
    "profile-required-pixel-ground-truth-end-to-end",
  ],
  importAcceptance: [
    "choose-file-path",
    "drop-on-canvas-path",
    "secure-parse-before-render",
    "temporary-import-root-transaction",
    "rollback-on-fatal-error",
    "meaningful-layer-naming",
    "source-mapping-plugin-data",
    "render-strategy-diagnostics",
    "section-selective-import",
    "viewport-selection-and-focus-after-commit",
  ],
  fontAcceptance: [
    "exact-available-font-preferred",
    "nearest-mapping-with-diagnostic",
    "geometry-preserving-correction-policy",
    "raster-text-only-when-policy-justifies",
  ],
};

const expectedRuntimeAssertions = [
  "cancel-restores-scroll",
  "cancel-restores-focus",
  "cancel-restores-inline-scroll-behavior",
  "cancel-removes-selector-overlay",
  "confirm-restores-scroll",
  "confirm-restores-focus",
  "confirm-restores-inline-scroll-behavior",
  "confirm-removes-selector-overlay",
  "confirm-returns-region-result",
].sort();

const requiredRuntimeBoundaries = [
  "visual-state-freeze-and-restore",
  "current-document-deterministic-online",
  "file-protocol-explicit-permission",
  "zero-known-critical-security-blockers",
  "zero-known-high-security-blockers",
  "class-a-visual-geometry-text-asset-structure-measurements",
  "class-b-browser-to-wtf-to-figma-measurements",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    failures.push(`invalid JSON ${path}: ${String(error)}`);
    return null;
  }
}

function validateSection(audit, sectionName, ids, allItems) {
  const entries = Array.isArray(audit?.[sectionName]) ? audit[sectionName] : [];
  const byId = new Map();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    assert(id.length > 0, `${sectionName} contains an entry without id`);
    assert(!byId.has(id), `${sectionName} duplicates ${id}`);
    byId.set(id, entry);
  }
  for (const id of ids) {
    assert(byId.has(id), `${sectionName} missing required P0 item ${id}`);
  }
  assert(entries.length === ids.length, `${sectionName} contains undeclared or missing P0 items`);

  for (const entry of entries) {
    const status = entry?.status;
    assert(
      status === "PASS" || status === "UNAVAILABLE" || status === "FAIL",
      `${sectionName}/${String(entry?.id)} has invalid status ${String(status)}`,
    );
    assert(status !== "FAIL", `${sectionName}/${String(entry?.id)} is a blocking FAIL`);
    assert(
      typeof entry?.reason === "string" && entry.reason.trim().length > 0,
      `${sectionName}/${String(entry?.id)} must explain its evidence status`,
    );
    const artifacts = Array.isArray(entry?.sourceArtifacts) ? entry.sourceArtifacts : [];
    assert(artifacts.length > 0, `${sectionName}/${String(entry?.id)} must name sourceArtifacts`);
    for (const artifact of artifacts) {
      assert(
        typeof artifact === "string" && artifact.length > 0,
        `${sectionName}/${String(entry?.id)} has invalid sourceArtifact`,
      );
      if (typeof artifact === "string" && artifact.length > 0) {
        assert(
          existsSync(resolve(root, artifact)),
          `${sectionName}/${String(entry?.id)} sourceArtifact does not exist: ${artifact}`,
        );
      }
    }
    allItems.push(entry);
  }
}

assert(existsSync(resolve(root, auditPath)), `missing ${auditPath}`);
assert(existsSync(resolve(root, manifestPath)), `missing ${manifestPath}`);
assert(existsSync(resolve(root, runtimeEvidencePath)), `missing ${runtimeEvidencePath}`);
assert(existsSync(resolve(root, runtimeHarnessPath)), `missing ${runtimeHarnessPath}`);
assert(existsSync(resolve(root, runtimeProductSourcePath)), `missing ${runtimeProductSourcePath}`);

const audit = readJson(auditPath);
const manifest = readJson(manifestPath);
const runtimeEvidence = readJson(runtimeEvidencePath);

if (runtimeEvidence) {
  assert(runtimeEvidence.version === "1.0.0", "NODE-31 browser runtime version must be 1.0.0");
  assert(
    runtimeEvidence.evidenceType === "node31-browser-runtime",
    "NODE-31 browser runtime evidenceType mismatch",
  );
  assert(runtimeEvidence.status === "PASS", "NODE-31 browser runtime status must be PASS");
  assert(runtimeEvidence.ci?.runNumber === 764, "NODE-31 browser runtime must identify CI #764");
  assert(runtimeEvidence.ci?.runId === 32830737350, "NODE-31 browser runtime run id mismatch");
  assert(runtimeEvidence.ci?.jobId === 97748603856, "NODE-31 browser runtime job id mismatch");
  assert(runtimeEvidence.ci?.conclusion === "PASS", "NODE-31 browser runtime CI must be PASS");
  assert(
    runtimeEvidence.ci?.branchHead === "c5b3cbdbd0326951ceb23ff2271055c9acbaad19",
    "NODE-31 browser runtime branch head mismatch",
  );
  assert(
    runtimeEvidence.ci?.mergeRef === "b4603e0e74e9b3c00f7355d01db9d710e9af7c74",
    "NODE-31 browser runtime merge ref mismatch",
  );
  assert(
    runtimeEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "NODE-31 browser runtime base mismatch",
  );
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "browserRuntime",
    "format",
  ]) {
    assert(
      runtimeEvidence.ci?.qualityChecks?.[check] === "PASS",
      `NODE-31 browser runtime missing PASS ${check}`,
    );
  }
  assert(
    runtimeEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "NODE-31 browser runtime Chrome version mismatch",
  );
  assert(
    runtimeEvidence.harnessArtifact === runtimeHarnessPath,
    "NODE-31 browser runtime harness path mismatch",
  );
  assert(
    runtimeEvidence.productSourceArtifact === runtimeProductSourcePath,
    "NODE-31 browser runtime product source mismatch",
  );
  assert(
    runtimeEvidence.loadedBuiltArtifact === runtimeBuiltArtifactPath,
    "NODE-31 browser runtime built artifact mismatch",
  );
  const mockedBoundary = Array.isArray(runtimeEvidence.transportBoundary?.mocked)
    ? runtimeEvidence.transportBoundary.mocked
    : [];
  assert(
    mockedBoundary.length === 1 &&
      mockedBoundary[0] === "chrome.runtime.onMessage message transport only",
    "NODE-31 browser runtime must mock only chrome.runtime.onMessage transport",
  );
  const runtimeAssertions = Array.isArray(runtimeEvidence.assertions)
    ? [...runtimeEvidence.assertions].sort()
    : [];
  assert(
    JSON.stringify(runtimeAssertions) === JSON.stringify(expectedRuntimeAssertions),
    "NODE-31 browser runtime assertion set mismatch",
  );
  const proves = Array.isArray(runtimeEvidence.provesP0Items) ? runtimeEvidence.provesP0Items : [];
  assert(
    proves.length === 1 && proves[0] === "finally-scroll-focus-temporary-style-restore",
    "NODE-31 browser runtime must prove only the intended P0 item",
  );
  const notProven = new Set(
    Array.isArray(runtimeEvidence.notProvenByThisArtifact)
      ? runtimeEvidence.notProvenByThisArtifact
      : [],
  );
  for (const boundary of requiredRuntimeBoundaries) {
    assert(
      notProven.has(boundary),
      `NODE-31 browser runtime must preserve not-proven boundary ${boundary}`,
    );
  }
}

if (audit) {
  assert(audit.version === "1.0.0", "NODE-31 P0 audit version must be 1.0.0");
  assert(audit.evidenceType === "node31-p0-audit", "NODE-31 P0 audit evidenceType mismatch");
  assert(
    audit.auditedAgainstBranchHead === "c5b3cbdbd0326951ceb23ff2271055c9acbaad19",
    "NODE-31 P0 audit must stay anchored to exact-head CI #764 until regenerated",
  );
  assert(audit.ci?.runNumber === 764, "NODE-31 P0 audit must identify CI #764");
  assert(audit.ci?.runId === 32830737350, "NODE-31 P0 audit run id mismatch");
  assert(audit.ci?.jobId === 97748603856, "NODE-31 P0 audit job id mismatch");
  assert(audit.ci?.conclusion === "PASS", "NODE-31 P0 audit CI conclusion must be PASS");
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "browserRuntime",
    "format",
  ]) {
    assert(audit.ci?.qualityChecks?.[check] === "PASS", `NODE-31 P0 audit missing PASS ${check}`);
  }
  assert(
    audit.policy?.unavailableIsPass === false,
    "NODE-31 P0 audit must fail closed on UNAVAILABLE",
  );

  const allItems = [];
  for (const [sectionName, ids] of Object.entries(requiredIds)) {
    validateSection(audit, sectionName, ids, allItems);
  }

  const runtimeItem = allItems.find(
    (entry) => entry.id === "finally-scroll-focus-temporary-style-restore",
  );
  assert(runtimeItem?.status === "PASS", "NODE-31 Chrome-backed cleanup P0 item must be PASS");
  const runtimeArtifacts = Array.isArray(runtimeItem?.sourceArtifacts)
    ? runtimeItem.sourceArtifacts
    : [];
  for (const artifact of [runtimeProductSourcePath, runtimeHarnessPath, runtimeEvidencePath]) {
    assert(
      runtimeArtifacts.includes(artifact),
      `NODE-31 Chrome-backed cleanup P0 item missing provenance ${artifact}`,
    );
  }

  const unavailableIds = allItems
    .filter((entry) => entry.status === "UNAVAILABLE")
    .map((entry) => entry.id)
    .sort();
  const declaredBlocking = Array.isArray(audit.blockingUnavailableIds)
    ? [...audit.blockingUnavailableIds].sort()
    : [];
  assert(
    JSON.stringify(declaredBlocking) === JSON.stringify(unavailableIds),
    "NODE-31 P0 blockingUnavailableIds must exactly match UNAVAILABLE items",
  );
  assert(unavailableIds.length === 15, "NODE-31 P0 audit must retain exactly 15 unavailable items");
  const derivedStatus = unavailableIds.length === 0 ? "PASS" : "UNAVAILABLE";
  assert(
    audit.policy?.overallStatus === derivedStatus,
    `NODE-31 P0 audit overallStatus must be ${derivedStatus}`,
  );

  if (manifest) {
    assert(
      manifest.p0?.status === derivedStatus,
      `NODE-31 manifest P0 status must be ${derivedStatus}`,
    );
    assert(
      manifest.p0?.evidenceArtifact === auditPath,
      "NODE-31 manifest P0 evidenceArtifact must point to the P0 audit",
    );
    assert(
      manifest.p0?.blockingUnavailableCount === unavailableIds.length,
      "NODE-31 manifest P0 blockingUnavailableCount mismatch",
    );
  }
}

if (failures.length > 0) {
  console.error(`NODE-31 P0 validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-31 P0 validation passed.");
}
