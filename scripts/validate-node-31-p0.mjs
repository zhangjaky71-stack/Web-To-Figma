import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_745.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";

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

const audit = readJson(auditPath);
const manifest = readJson(manifestPath);

if (audit) {
  assert(audit.version === "1.0.0", "NODE-31 P0 audit version must be 1.0.0");
  assert(audit.evidenceType === "node31-p0-audit", "NODE-31 P0 audit evidenceType mismatch");
  assert(
    audit.auditedAgainstBranchHead === "0f12f2b5ca745ebf7f67c967ac0b56efe3ba933a",
    "NODE-31 P0 audit must stay anchored to exact-head CI #745 until regenerated",
  );
  assert(audit.ci?.runNumber === 745, "NODE-31 P0 audit must identify CI #745");
  assert(audit.ci?.runId === 32826628971, "NODE-31 P0 audit run id mismatch");
  assert(audit.ci?.jobId === 97735967516, "NODE-31 P0 audit job id mismatch");
  assert(audit.ci?.conclusion === "PASS", "NODE-31 P0 audit CI conclusion must be PASS");
  for (const check of ["node31Validator", "lint", "typecheck", "tests", "build", "format"]) {
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
