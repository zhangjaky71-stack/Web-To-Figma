import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const ciEvidencePath = "docs/qa/results/NODE-31_CI_CONTRACT_EVIDENCE_736.json";
const required = [
  "packages/figma-renderer/src/qa/node31-types.ts",
  "packages/figma-renderer/src/qa/compatibility.ts",
  "packages/figma-renderer/src/qa/release-candidate.ts",
  "packages/figma-renderer/src/qa/evidence-manifest.ts",
  "packages/figma-renderer/test/node31-release-candidate.test.ts",
  "packages/figma-renderer/test/node31-evidence-manifest.test.ts",
  "docs/nodes/NODE-31_REAL_WORLD_COMPATIBILITY_RELEASE_CANDIDATE.md",
  "docs/qa/NODE-31_RC_EVIDENCE_V1.json",
  ciEvidencePath,
  "docs/KNOWN_LIMITATIONS.md",
  "docs/ACCEPTANCE_CONTRACT_V2.md",
  "qa/corpus/node31/README.md",
  "packages/w2f-schema/test/index.test.ts",
  "packages/wtf-parser/test/migrations.test.ts",
  "packages/wtf-parser/test/parser.test.ts",
  "packages/wtf-parser/test/svg-sanitize.test.ts",
  "packages/wtf-parser/test/zip-reader.test.ts",
];
const localOnlyForbidden = ["fetch(", "XMLHttpRequest", "WebSocket", "eval(", "new Function("];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assertExistingArtifact(path, label) {
  assert(typeof path === "string" && path.length > 0, `${label} must name an evidence artifact`);
  if (typeof path === "string" && path.length > 0) {
    assert(existsSync(resolve(root, path)), `${label} does not exist: ${path}`);
  }
}

for (const path of required) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

if (failures.length === 0) {
  const types = text("packages/figma-renderer/src/qa/node31-types.ts");
  for (const evidence of [
    'W2F_NODE31_RC_VERSION = "1.0.0"',
    "deterministicVisualSimilarity: 0.99",
    "realisticVisualMedian: 0.95",
    "geometryFidelity: 0.98",
    "textFidelity: 0.97",
    "assetFidelity: 0.99",
    "structureFidelity: 0.95",
    "editableAreaMedian: 0.9",
    "responsiveFidelity: 0.9",
    "rasterAreaMedianMax: 0.15",
    "W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES",
    "W2F_NODE31_REQUIRED_SECURITY_FIXTURES",
    "W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES",
  ]) {
    assert(types.includes(evidence), `NODE-31 types missing ${evidence}`);
  }

  for (const category of [
    "landing-page",
    "ecommerce",
    "docs",
    "dashboard",
    "table",
    "saas-shell",
    "local-site",
    "shadow-dom",
    "iframe",
    "canvas",
    "webgl",
    "responsive-app",
  ]) {
    assert(types.includes(`"${category}"`), `NODE-31 realistic category missing ${category}`);
  }

  const compatibility = text("packages/figma-renderer/src/qa/compatibility.ts");
  for (const evidence of [
    'sample.testClass === "B"',
    'sample.testClass === "C"',
    "missingRealisticCategories",
    "documented fallback/diagnostic",
    "Class C is not the sole regression baseline",
    "p0Contradiction",
  ]) {
    assert(compatibility.includes(evidence), `NODE-31 compatibility matrix missing ${evidence}`);
  }

  const release = text("packages/figma-renderer/src/qa/release-candidate.ts");
  for (const evidence of [
    "deterministic-visual",
    "realistic-visual-median",
    "severe-local-visual-regression",
    '"geometry"',
    '"text"',
    '"assets"',
    '"structure"',
    "editable-area-median",
    '"responsive"',
    "raster-area-median",
    "anti-cheating",
    '"determinism"',
    '"security"',
    '"scale"',
    "compatibility-matrix",
    "known-limitations",
    "wtf-schema-version-compatibility",
    "releaseReady",
    'status: "UNAVAILABLE"',
  ]) {
    assert(release.includes(evidence), `NODE-31 release evaluator missing ${evidence}`);
  }
  assert(
    release.includes('sample.supportClass === "native-supported"') &&
      release.includes("sample.standardHtmlCss"),
    "NODE-31 editable/raster medians must be scoped to native-supported standard HTML/CSS",
  );

  const manifestEvaluator = text("packages/figma-renderer/src/qa/evidence-manifest.ts");
  for (const evidence of [
    "evaluateNode31EvidenceManifest",
    "missingRealisticCategories",
    "measurementArtifact",
    "cannot PASS without a measurementArtifact",
    "evidenceArtifact",
    "cannot PASS without an evidenceArtifact",
    "blockerInventoryArtifact",
    "security blocker counts require a blockerInventoryArtifact",
    "cannot claim ready while required evidence is unavailable",
    "known security blockers",
  ]) {
    assert(manifestEvaluator.includes(evidence), `NODE-31 evidence evaluator missing ${evidence}`);
  }

  for (const forbidden of localOnlyForbidden) {
    assert(
      !release.includes(forbidden),
      `NODE-31 release evaluator must remain local-only: ${forbidden}`,
    );
    assert(
      !compatibility.includes(forbidden),
      `NODE-31 compatibility evaluator must remain local-only: ${forbidden}`,
    );
    assert(
      !manifestEvaluator.includes(forbidden),
      `NODE-31 evidence manifest evaluator must remain local-only: ${forbidden}`,
    );
  }

  const tests = text("packages/figma-renderer/test/node31-release-candidate.test.ts");
  for (const evidence of [
    "every frozen release gate",
    "missing required realistic corpus categories",
    "expected fallback out of standard HTML/CSS editable and raster medians",
    "anti-cheating violations",
    "metric evidence as UNAVAILABLE",
    "Class C live-site drift",
    "security, schema/version, determinism, P0, or known-limitations failures",
  ]) {
    assert(tests.includes(evidence), `NODE-31 tests missing ${evidence}`);
  }

  const manifestTests = text("packages/figma-renderer/test/node31-evidence-manifest.test.ts");
  for (const evidence of [
    "source-only collecting evidence UNAVAILABLE",
    "required Class B category disappears",
    "measurementArtifact provenance",
    "evidenceArtifact provenance",
    "blockerInventoryArtifact",
    "ready manifest only when required evidence is measured and sourced",
    "ready claim while required evidence is still unavailable",
    "known critical/high security blockers",
  ]) {
    assert(manifestTests.includes(evidence), `NODE-31 evidence manifest tests missing ${evidence}`);
  }

  const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
  let manifest;
  try {
    manifest = JSON.parse(text(manifestPath));
  } catch (error) {
    failures.push(`NODE-31 evidence manifest is invalid JSON: ${String(error)}`);
  }
  if (manifest) {
    assert(manifest.version === "1.0.0", "NODE-31 evidence manifest version must be 1.0.0");
    assert(
      manifest.status === "collecting" || manifest.status === "ready",
      "NODE-31 evidence manifest status must be collecting or ready",
    );
    assert(
      manifest.baselineCommit === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
      "NODE-31 evidence manifest baseline must be the NODE-30 merge commit",
    );
    const classBCategories = new Set((manifest.classB ?? []).map((entry) => entry.category));
    for (const category of [
      "landing-page",
      "ecommerce",
      "docs",
      "dashboard",
      "table",
      "saas-shell",
      "local-site",
      "shadow-dom",
      "iframe",
      "canvas",
      "webgl",
      "responsive-app",
    ]) {
      assert(
        classBCategories.has(category),
        `NODE-31 evidence manifest missing Class B ${category}`,
      );
    }
    for (const entry of manifest.classB ?? []) {
      assert(
        typeof entry.sourceArtifact === "string" && entry.sourceArtifact.length > 0,
        `NODE-31 Class B source ${entry.id} must name a sourceArtifact`,
      );
      if (typeof entry.sourceArtifact === "string" && entry.sourceArtifact.length > 0) {
        assert(
          existsSync(resolve(root, entry.sourceArtifact)),
          `NODE-31 Class B sourceArtifact does not exist: ${entry.sourceArtifact}`,
        );
      }
    }
    for (const entry of [...(manifest.classA ?? []), ...(manifest.classB ?? [])]) {
      if (entry.measurementStatus === "PASS") {
        assertExistingArtifact(entry.measurementArtifact, `NODE-31 measurement ${entry.id}`);
      }
    }
    for (const fixture of manifest.security?.fixtures ?? []) {
      if (fixture.status === "PASS") {
        assertExistingArtifact(
          fixture.evidenceArtifact,
          `NODE-31 security fixture ${fixture.id} evidenceArtifact`,
        );
      }
    }
    if (
      manifest.security?.knownCriticalBlockers !== null &&
      manifest.security?.knownCriticalBlockers !== undefined &&
      manifest.security?.knownHighBlockers !== null &&
      manifest.security?.knownHighBlockers !== undefined
    ) {
      assertExistingArtifact(
        manifest.security.blockerInventoryArtifact,
        "NODE-31 security blockerInventoryArtifact",
      );
    }
    for (const entry of manifest.schemaCompatibility ?? []) {
      if (entry.status === "PASS") {
        assertExistingArtifact(
          entry.evidenceArtifact,
          `NODE-31 schema compatibility ${entry.id} evidenceArtifact`,
        );
      }
    }
    for (const [label, entry] of [
      ["known limitations", manifest.knownLimitations],
      ["P0", manifest.p0],
      ["determinism", manifest.determinism],
      ["scale", manifest.scale],
    ]) {
      if (entry?.status === "PASS") {
        assertExistingArtifact(entry.evidenceArtifact, `NODE-31 ${label} evidenceArtifact`);
      }
    }
  }

  let ciEvidence;
  try {
    ciEvidence = JSON.parse(text(ciEvidencePath));
  } catch (error) {
    failures.push(`NODE-31 CI evidence is invalid JSON: ${String(error)}`);
  }
  if (ciEvidence) {
    assert(ciEvidence.version === "1.0.0", "NODE-31 CI evidence version must be 1.0.0");
    assert(ciEvidence.evidenceType === "github-actions-ci", "NODE-31 CI evidence type mismatch");
    assert(ciEvidence.workflow?.runNumber === 736, "NODE-31 CI evidence must identify run #736");
    assert(ciEvidence.workflow?.runId === 32816187909, "NODE-31 CI evidence run id mismatch");
    assert(ciEvidence.workflow?.jobId === 97704841337, "NODE-31 CI evidence job id mismatch");
    assert(ciEvidence.workflow?.conclusion === "PASS", "NODE-31 CI evidence must be PASS");
    assert(
      ciEvidence.git?.branchHead === "8ea3bbde8580e97996e63c94fa0f08ea8f4ff63b",
      "NODE-31 CI evidence branch head mismatch",
    );
    assert(ciEvidence.qualityChecks?.node31Validator === "PASS", "NODE-31 validator evidence missing");
    assert(ciEvidence.qualityChecks?.tests === "PASS", "NODE-31 test evidence missing");
    assert(ciEvidence.qualityChecks?.build === "PASS", "NODE-31 build evidence missing");
    assert(ciEvidence.qualityChecks?.format === "PASS", "NODE-31 format evidence missing");
    assert(ciEvidence.schemaCompatibility?.testCount === 15, "NODE-31 schema test count mismatch");
    assert(ciEvidence.parserAndSecurityFixtures?.testCount === 20, "NODE-31 parser test count mismatch");
    assert(ciEvidence.node30Scale?.measuredRuns === 5, "NODE-31 scale evidence run count mismatch");
    assert(ciEvidence.node30Scale?.createdNodeTarget === 10000, "NODE-31 scale target mismatch");
    assert(ciEvidence.node30Scale?.fatalCrash === false, "NODE-31 scale evidence reports fatal crash");
    for (const unproven of [
      "zero-known-critical-security-blockers",
      "zero-known-high-security-blockers",
      "P0-functional-completeness",
      "known-limitations-currentness",
      "Class-A-visual-geometry-text-asset-structure-measurements",
      "Class-B-browser-to-wtf-to-Figma-measurements",
    ]) {
      assert(
        ciEvidence.notProvenByThisArtifact?.includes(unproven),
        `NODE-31 CI evidence must preserve unproven boundary ${unproven}`,
      );
    }
  }

  const schemaTests = text("packages/w2f-schema/test/index.test.ts");
  for (const evidence of [
    "accepts a complete canonical V2 manifest",
    "enforces min reader version",
    "allows unknown top-level metadata for forward-compatible readers",
  ]) {
    assert(
      schemaTests.includes(evidence),
      `NODE-31 schema compatibility source missing ${evidence}`,
    );
  }
  const migrationTests = text("packages/wtf-parser/test/migrations.test.ts");
  for (const evidence of [
    "keeps the frozen 2.0.0 format as a no-op migration",
    "routes compatible V2 minor versions",
    "rejects unsupported major versions",
  ]) {
    assert(
      migrationTests.includes(evidence),
      `NODE-31 migration compatibility source missing ${evidence}`,
    );
  }

  const qaIndex = text("packages/figma-renderer/src/qa/index.ts");
  assert(
    qaIndex.includes('export * from "./evidence-manifest.js"'),
    "NODE-31 evidence manifest evaluator must be exported",
  );

  const prettierIgnore = text(".prettierignore");
  assert(
    prettierIgnore.includes("qa/corpus/node31"),
    "NODE-31 realistic corpus bytes must be excluded from auto-formatting",
  );

  const doc = text("docs/nodes/NODE-31_REAL_WORLD_COMPATIBILITY_RELEASE_CANDIDATE.md");
  for (const evidence of [
    ">= 99%",
    ">= 95%",
    ">= 98%",
    ">= 97%",
    ">= 90%",
    "<= 15%",
    "Class A",
    "Class B",
    "Class C",
    "zero known critical/high",
    "KNOWN_LIMITATIONS.md",
    "schema/version compatibility",
    "releaseReady",
  ]) {
    assert(doc.includes(evidence), `NODE-31 contract doc missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(`NODE-31 validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-31 validation passed.");
}
