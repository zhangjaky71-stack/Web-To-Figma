import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/qa/node31-types.ts",
  "packages/figma-renderer/src/qa/compatibility.ts",
  "packages/figma-renderer/src/qa/release-candidate.ts",
  "packages/figma-renderer/src/qa/evidence-manifest.ts",
  "packages/figma-renderer/test/node31-release-candidate.test.ts",
  "packages/figma-renderer/test/node31-evidence-manifest.test.ts",
  "docs/nodes/NODE-31_REAL_WORLD_COMPATIBILITY_RELEASE_CANDIDATE.md",
  "docs/qa/NODE-31_RC_EVIDENCE_V1.json",
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
      manifest.status === "collecting",
      "NODE-31 initial evidence manifest must remain collecting until measured evidence is populated",
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
        assert(
          typeof entry.measurementArtifact === "string" && entry.measurementArtifact.length > 0,
          `NODE-31 evidence ${entry.id} cannot PASS without a measurementArtifact`,
        );
        if (typeof entry.measurementArtifact === "string" && entry.measurementArtifact.length > 0) {
          assert(
            existsSync(resolve(root, entry.measurementArtifact)),
            `NODE-31 measurementArtifact does not exist: ${entry.measurementArtifact}`,
          );
        }
      }
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
