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
  "packages/compositing-engine/package.json",
  "packages/compositing-engine/tsconfig.json",
  "packages/compositing-engine/tsconfig.build.json",
  "packages/compositing-engine/src/index.ts",
  "packages/compositing-engine/src/types.ts",
  "packages/compositing-engine/src/engine.ts",
  "packages/compositing-engine/src/validation.ts",
  "packages/compositing-engine/test/compositing-engine.test.ts",
  "apps/browser-extension/src/runtime/compositing-runtime.ts",
  "apps/browser-extension/src/runtime/compositing-store.ts",
  "apps/browser-extension/test/compositing-runtime.test.ts",
  "apps/browser-extension/test/compositing-store.test.ts",
  "apps/browser-extension/scripts/validate-node-20-package.mjs",
  "docs/COMPOSITING_FALLBACK_BOUNDARY_V2.md",
  "docs/adr/ADR-0020-minimal-safe-fallback-boundary.md",
  "docs/nodes/NODE-20_COMPOSITING_FALLBACK_BOUNDARY.md",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-20 missing ${file}`);
}

if (failures.length === 0) {
  const packageJson = readJson("packages/compositing-engine/package.json");
  assert(packageJson.name === "@w2f/compositing-engine", "NODE-20 package name drifted");
  for (const dependency of ["@w2f/w2f-ir", "@w2f/w2f-schema"]) {
    assert(
      packageJson.dependencies?.[dependency] === "workspace:*",
      `Compositing Engine must consume ${dependency}`,
    );
  }

  const types = readText("packages/compositing-engine/src/types.ts");
  for (const evidence of [
    'COMPOSITING_ANALYSIS_VERSION = "1.0.0"',
    "CompositingAnalysisResult",
    "FallbackBoundary",
    "CompositingNodeDecision",
    "fallbackBoundaryRootId",
    "sourceRefs",
  ]) {
    assert(types.includes(evidence), `Compositing contract missing ${evidence}`);
  }

  const engine = readText("packages/compositing-engine/src/engine.ts");
  for (const evidence of [
    "analyzeCompositing",
    "summarizeCompositingAnalysis",
    "mix-blend-mode",
    "backdrop-filter",
    "opacity-group",
    "isolation-boundary",
    "nearestBackdropBoundary",
    "nearestGroupOwner",
    "mergeCandidates",
    'renderStrategy: "raster"',
    "NODE-20 minimal safe fallback boundary",
  ]) {
    assert(engine.includes(evidence), `Compositing Engine missing ${evidence}`);
  }
  for (const forbidden of [
    "window.",
    "document.",
    "chrome.",
    "indexedDB",
    "fetch(",
    "Math.random",
    "Date.now",
    "localStorage",
    "sessionStorage",
    "document.cookie",
  ]) {
    assert(!engine.includes(forbidden), `Compositing core must not use ${forbidden}`);
  }

  const runtime = readText("apps/browser-extension/src/runtime/compositing-runtime.ts");
  for (const evidence of [
    "analyzeCapturedCompositing",
    "analyzePersistedCompositing",
    "readRenderTreeOptimization",
    "analyzeCompositing",
  ]) {
    assert(runtime.includes(evidence), `Browser compositing bridge missing ${evidence}`);
  }

  const store = readText("apps/browser-extension/src/runtime/compositing-store.ts");
  for (const evidence of [
    'W2F_COMPOSITING_DB_NAME = "w2f-compositing"',
    'W2F_COMPOSITING_STORE_NAME = "captures"',
    'W2F_COMPOSITING_KEY_PREFIX = "compositing:"',
    "writeCompositingAnalysis",
    "readCompositingAnalysis",
    "deleteCompositingAnalysis",
  ]) {
    assert(store.includes(evidence), `Compositing store missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/compositing-engine"] === "workspace:*",
    "Browser must depend on compositing-engine",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      browserPackage.scripts?.[script]?.includes("validate-node-20-package.mjs"),
      `Browser ${script} must require NODE-20 packaged-output validation`,
    );
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packager.includes('specifier: "@w2f/compositing-engine"') &&
      packager.includes('directory: "compositing-engine"'),
    "Browser packager must include Compositing Engine runtime",
  );

  const jobState = readText("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "compositingStorageKey",
    "fallbackBoundaryCount",
    "fallbackMemberNodeCount",
    "fallbackTriggerNodeCount",
    "promotedFallbackBoundaryCount",
    "compositingDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `Capture receipt missing ${evidence}`);
  }

  const worker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistCompositingAnalysis",
    "analyzePersistedCompositing",
    "writeCompositingAnalysis",
    "readCompositingAnalysis",
    "deleteCompositingAnalysis",
    "summarizeCompositingAnalysis",
    "fallbackBoundaryCount",
    "promotedFallbackBoundaryCount",
    "compositing-boundary:",
    "fallbackBoundaryRasterRequests",
  ]) {
    assert(
      worker.includes(evidence),
      `Service worker compositing orchestration missing ${evidence}`,
    );
  }
  assert(
    (worker.match(/\.\.\.compositingReceipt/g) ?? []).length === 2,
    "Standard and CDP receipts must both expose NODE-20 compositing metrics",
  );
  assert(
    worker.indexOf("persistCompositingAnalysis(jobId)") <
      worker.indexOf("persistPixelGroundTruth(tabId, jobId, snapshot)"),
    "NODE-20 compositing sidecar must exist before Pixel Ground Truth consumes fallback boundaries",
  );

  const pixelRuntime = readText("apps/browser-extension/src/runtime/pixel-ground-truth-runtime.ts");
  assert(
    pixelRuntime.includes("RasterFallbackRequest") &&
      pixelRuntime.includes('return "node-fallback"'),
    "NODE-14 Pixel Ground Truth must retain node-fallback request support",
  );

  const normative = readText("docs/COMPOSITING_FALLBACK_BOUNDARY_V2.md");
  for (const evidence of [
    "mix-blend-mode",
    "backdrop-filter",
    "mask",
    "opacity",
    "isolation",
    "smallest safe",
    "NODE-24",
    "NODE-28",
  ]) {
    assert(normative.includes(evidence), `NODE-20 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-20 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-20 foundation validation passed.");
}
