import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/qa/node30-types.ts",
  "packages/figma-renderer/src/qa/canonical.ts",
  "packages/figma-renderer/src/qa/responsive.ts",
  "packages/figma-renderer/src/qa/responsive-fixture.ts",
  "packages/figma-renderer/src/qa/determinism.ts",
  "packages/figma-renderer/src/qa/determinism-input.ts",
  "packages/figma-renderer/src/qa/performance.ts",
  "packages/figma-renderer/src/qa/performance-benchmark.ts",
  "packages/figma-renderer/test/node30-qa.test.ts",
  "packages/figma-renderer/test/node30-integration.test.ts",
  "docs/nodes/NODE-30_RESPONSIVE_DETERMINISM_PERFORMANCE_QA.md",
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
  const types = text("packages/figma-renderer/src/qa/node30-types.ts");
  for (const evidence of [
    'W2F_NODE30_QA_VERSION = "1.0.0"',
    "W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD = 0.9",
    "W2F_NODE30_REQUIRED_DETERMINISM_RUNS = 10",
    "W2F_NODE30_RESPONSIVE_DOMAINS",
    "requiredDomains",
    "environmentFingerprint",
    "benchmarkEnvironment",
    "calibratedHardBudgetMs: null",
  ]) {
    assert(types.includes(evidence), `NODE-30 QA contract types missing ${evidence}`);
  }

  const responsive = text("packages/figma-renderer/src/qa/responsive.ts");
  for (const evidence of [
    "activeScores",
    "activeScores.reduce",
    "Required responsive domain",
    "W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD",
    "Non-executable structural change",
  ]) {
    assert(responsive.includes(evidence), `NODE-30 responsive QA missing ${evidence}`);
  }
  assert(!responsive.includes("DOMAIN_WEIGHTS"), "NODE-30 must not hide undeclared domain weights");

  const fixture = text("packages/figma-renderer/src/qa/responsive-fixture.ts");
  for (const evidence of [
    "horizontalSizing",
    "verticalSizing",
    "layoutMode",
    "gridColumnCount",
    "constraintSignature",
    "containerQuerySignature",
    '"breakpoints"',
  ]) {
    assert(fixture.includes(evidence), `NODE-30 responsive fixture adapter missing ${evidence}`);
  }

  const determinism = text("packages/figma-renderer/src/qa/determinism.ts");
  for (const evidence of [
    "W2F_NODE30_REQUIRED_DETERMINISM_RUNS",
    "capturedAt",
    "captureId",
    "revisionId",
    "parentRevisionId",
    "environmentFingerprint",
    "different environment fingerprint",
    "assetHash",
    "sourceGraphHash",
    "renderTreeHash",
    "stableIdentityHash",
    "layoutDecisionHash",
  ]) {
    assert(determinism.includes(evidence), `NODE-30 determinism QA missing ${evidence}`);
  }

  const determinismInput = text("packages/figma-renderer/src/qa/determinism-input.ts");
  for (const evidence of [
    "environmentFingerprint",
    "requires asset hashes",
    "expectedStableCaptureNodeIds",
    "layoutDecisions",
  ]) {
    assert(determinismInput.includes(evidence), `NODE-30 IR determinism adapter missing ${evidence}`);
  }

  const performance = text("packages/figma-renderer/src/qa/performance.ts");
  for (const evidence of [
    "2_000",
    "5_000",
    "10_000",
    "20_000",
    "50_000",
    "chunking- or progress-capable",
    "must complete without a fatal crash",
    "must show a user warning",
    "section or simplified import",
    "explicit confirmation",
    "benchmarkEnvironment",
    "one declared benchmark environment",
    "medianDurationMs",
    "p95DurationMs",
    "calibratedHardBudgetMs: null",
  ]) {
    assert(performance.includes(evidence), `NODE-30 performance QA missing ${evidence}`);
  }

  const benchmark = text("packages/figma-renderer/src/qa/performance-benchmark.ts");
  for (const evidence of [
    "measurePerformanceBenchmark",
    "benchmarkEnvironment",
    "durationMs",
    "completed: true",
    "crashed: true",
  ]) {
    assert(benchmark.includes(evidence), `NODE-30 benchmark adapter missing ${evidence}`);
  }

  const index = text("packages/figma-renderer/src/qa/index.ts");
  for (const evidence of [
    './node30-types.js',
    './canonical.js',
    './responsive.js',
    './responsive-fixture.js',
    './determinism.js',
    './determinism-input.js',
    './performance.js',
    './performance-benchmark.js',
  ]) {
    assert(index.includes(evidence), `NODE-30 QA index missing ${evidence}`);
  }

  const tests = `${text("packages/figma-renderer/test/node30-qa.test.ts")}\n${text(
    "packages/figma-renderer/test/node30-integration.test.ts",
  )}`;
  for (const evidence of [
    "90% composite contract",
    "equal active-domain weighting",
    "required domain evidence is missing",
    "fewer than ten runs",
    "different environment",
    "layout decisions randomly change",
    "frozen scale bands",
    "mixed benchmark environments",
    "crashing 10k benchmark",
    "containerQuerySignature",
  ]) {
    assert(tests.includes(evidence), `NODE-30 tests missing ${evidence}`);
  }

  for (const path of [
    "packages/figma-renderer/src/qa/responsive.ts",
    "packages/figma-renderer/src/qa/responsive-fixture.ts",
    "packages/figma-renderer/src/qa/determinism.ts",
    "packages/figma-renderer/src/qa/determinism-input.ts",
    "packages/figma-renderer/src/qa/performance.ts",
    "packages/figma-renderer/src/qa/performance-benchmark.ts",
  ]) {
    const source = text(path);
    for (const forbidden of localOnlyForbidden) {
      assert(!source.includes(forbidden), `NODE-30 QA must remain local-only: ${path} contains ${forbidden}`);
    }
  }

  const doc = text("docs/nodes/NODE-30_RESPONSIVE_DETERMINISM_PERFORMANCE_QA.md");
  for (const evidence of [
    ">= 90%",
    "arithmetic mean of the active domain scores",
    "10 runs in the same environment",
    "environmentFingerprint",
    "benchmarkEnvironment",
    "median and p95",
    "10k benchmark",
    "20k–50k",
    ">50k",
    "NODE-29",
    "NODE-31",
  ]) {
    assert(doc.includes(evidence), `NODE-30 contract doc missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-30 validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-30 validation passed.");
}
