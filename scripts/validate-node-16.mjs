import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const requiredFiles = [
  "packages/responsive-inference/package.json",
  "packages/responsive-inference/tsconfig.json",
  "packages/responsive-inference/tsconfig.build.json",
  "packages/responsive-inference/src/index.ts",
  "packages/responsive-inference/src/types.ts",
  "packages/responsive-inference/src/inference.ts",
  "packages/responsive-inference/test/responsive-inference.test.ts",
  "apps/browser-extension/src/runtime/responsive-inference-runtime.ts",
  "apps/browser-extension/src/runtime/responsive-inference-store.ts",
  "apps/browser-extension/test/responsive-inference-runtime.test.ts",
  "apps/browser-extension/test/responsive-inference-store.test.ts",
  "apps/browser-extension/scripts/validate-node-16-package.mjs",
  "docs/RESPONSIVE_INFERENCE_V2.md",
  "docs/adr/ADR-0016-responsive-inference-evidence-precedence.md",
  "docs/nodes/NODE-16_RESPONSIVE_INFERENCE_ENGINE.md",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-16 missing ${file}`);
}

if (failures.length === 0) {
  const packageJson = readJson("packages/responsive-inference/package.json");
  assert(packageJson.name === "@w2f/responsive-inference", "NODE-16 package name drifted");
  assert(
    packageJson.dependencies?.["@w2f/w2f-ir"] === "workspace:*" &&
      packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "Responsive Inference must consume frozen W2F IR/Schema contracts",
  );

  const types = readText("packages/responsive-inference/src/types.ts");
  for (const evidence of [
    'RESPONSIVE_INFERENCE_VERSION = "1.0.0"',
    "ResponsiveBreakpointCandidate",
    "boundaryWidth?: number",
    '"observed-transition" | "authored-media" | "authored-container"',
    "ResponsiveSizingDecision",
    "WtfSizingMode",
    "RESPONSIVE_INFERENCE_SIZING_CONFLICT",
    "RESPONSIVE_INFERENCE_INSUFFICIENT_EVIDENCE",
  ]) {
    assert(types.includes(evidence), `Responsive Inference contract missing ${evidence}`);
  }

  const inference = readText("packages/responsive-inference/src/inference.ts");
  for (const evidence of [
    "inferResponsiveBehavior",
    "buildRanges",
    "addObservedBreakpointTransitions",
    "parseAuthoredMediaBreakpoints",
    "authoredSizing",
    "geometrySizing",
    'mode: "unknown"',
    "RESPONSIVE_INFERENCE_SIZING_CONFLICT",
    'ruleFromValues(stableNodeId, "visibility"',
    "sizing.${axis}.mode",
    "boundaryWidth",
    "sourceRefs",
  ]) {
    assert(inference.includes(evidence), `Responsive Inference engine missing ${evidence}`);
  }
  for (const forbidden of [
    "Math.random",
    "Date.now",
    "new Date(",
    "window.",
    "document.",
    "fetch(",
    "localStorage",
    "sessionStorage",
    "document.cookie",
  ]) {
    assert(!inference.includes(forbidden), `Responsive Inference core must not use ${forbidden}`);
  }
  assert(
    !inference.includes("lower.width + upper.width") && !inference.includes("/ 2"),
    "NODE-16 must not invent midpoint breakpoints from sampled viewport transitions",
  );

  const irTypes = readText("packages/w2f-ir/src/types.ts");
  for (const frozen of [
    'WTF_IR_VERSION = "2.0.0"',
    'WtfSizingMode = "fill" | "hug" | "fixed" | "intrinsic" | "content" | "unknown"',
    "interface WtfResponsiveRange",
    "interface WtfResponsiveRule",
    "interface WtfResponsivePayload",
    "interface WtfMediaRuleTrace",
    "interface WtfContainerQueryInfo",
  ]) {
    assert(irTypes.includes(frozen), `Frozen IR responsive vocabulary missing ${frozen}`);
  }
  const schema = readText("packages/w2f-schema/src/index.ts");
  assert(schema.includes('WTF_SCHEMA_VERSION = "2.0.0"'), "W2F Schema major/version must remain V2");
  assert(
    schema.includes("interface WtfResponsiveSnapshotRef"),
    "NODE-16 must reuse frozen WtfResponsiveSnapshotRef",
  );

  const runtime = readText("apps/browser-extension/src/runtime/responsive-inference-runtime.ts");
  for (const evidence of [
    "buildResponsiveInferenceInput",
    "inferResponsiveCaptureEvidence",
    "loadResponsiveInferenceEvidence",
    "present: false",
    "stableNodeId",
    "winningAuthoredValue",
    "activeInSnapshotIds",
    "aggregateContainerQueries",
    "readRawSnapshot",
    "readCssCascadeCapture",
    "readEnvironmentCapture",
  ]) {
    assert(runtime.includes(evidence), `Browser responsive inference bridge missing ${evidence}`);
  }
  for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "window.resizeTo", "fetch("]) {
    assert(!runtime.includes(forbidden), `Browser inference bridge must not use ${forbidden}`);
  }

  const store = readText("apps/browser-extension/src/runtime/responsive-inference-store.ts");
  for (const evidence of [
    'W2F_RESPONSIVE_INFERENCE_DB_NAME = "w2f-responsive-inference"',
    'W2F_RESPONSIVE_INFERENCE_STORE_NAME = "captures"',
    'W2F_RESPONSIVE_INFERENCE_KEY_PREFIX = "responsive-inference:"',
    "writeResponsiveInference",
    "readResponsiveInference",
    "deleteResponsiveInference",
  ]) {
    assert(store.includes(evidence), `Responsive Inference store missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/responsive-inference"] === "workspace:*",
    "Browser must depend on responsive-inference",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      browserPackage.scripts?.[script]?.includes("validate-node-16-package.mjs"),
      `Browser ${script} must require NODE-16 packaged-output validation`,
    );
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packager.includes('specifier: "@w2f/responsive-inference"') &&
      packager.includes('directory: "responsive-inference"'),
    "Browser packager must include Responsive Inference runtime",
  );

  const jobState = readText("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "inferenceStorageKey",
    "responsiveRuleCount",
    "breakpointCandidateCount",
    "responsiveSizingDecisionCount",
    "responsiveInferenceDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `Responsive job receipt missing ${evidence}`);
  }

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "loadResponsiveInferenceEvidence",
    "inferResponsiveCaptureEvidence",
    "writeResponsiveInference",
    "deleteResponsiveInference",
    "responsiveRuleCount",
    "breakpointCandidateCount",
  ]) {
    assert(serviceWorker.includes(evidence), `Service worker inference orchestration missing ${evidence}`);
  }

  const normative = readText("docs/RESPONSIVE_INFERENCE_V2.md");
  for (const evidence of [
    "Observed transition interval",
    "Authored media breakpoint",
    "Container queries",
    "mode = unknown",
    "NODE-17",
    "NODE-21",
    "NODE-27",
    "w2f-responsive-inference",
  ]) {
    assert(normative.includes(evidence), `NODE-16 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-16 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-16 foundation validation passed.");
}
