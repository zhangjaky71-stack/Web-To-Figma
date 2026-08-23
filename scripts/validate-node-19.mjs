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
  "packages/render-tree-optimizer/package.json",
  "packages/render-tree-optimizer/tsconfig.json",
  "packages/render-tree-optimizer/tsconfig.build.json",
  "packages/render-tree-optimizer/src/index.ts",
  "packages/render-tree-optimizer/src/types.ts",
  "packages/render-tree-optimizer/src/optimizer.ts",
  "packages/render-tree-optimizer/src/validation.ts",
  "packages/render-tree-optimizer/test/render-tree-optimizer.test.ts",
  "apps/browser-extension/src/runtime/render-tree-runtime.ts",
  "apps/browser-extension/src/runtime/render-tree-store.ts",
  "apps/browser-extension/test/render-tree-runtime.test.ts",
  "apps/browser-extension/test/render-tree-store.test.ts",
  "apps/browser-extension/scripts/validate-node-19-package.mjs",
  "docs/RENDER_TREE_OPTIMIZER_V2.md",
  "docs/adr/ADR-0019-render-tree-boundary-and-wrapper-folding.md",
  "docs/nodes/NODE-19_RENDER_TREE_OPTIMIZER.md",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-19 missing ${file}`);
}

if (failures.length === 0) {
  const packageJson = readJson("packages/render-tree-optimizer/package.json");
  assert(packageJson.name === "@w2f/render-tree-optimizer", "NODE-19 package name drifted");
  for (const dependency of [
    "@w2f/capture-core",
    "@w2f/css-cascade",
    "@w2f/layout-analyzer",
    "@w2f/stable-identity",
    "@w2f/table-layout-engine",
    "@w2f/w2f-ir",
    "@w2f/w2f-schema",
  ]) {
    assert(
      packageJson.dependencies?.[dependency] === "workspace:*",
      `Render Tree Optimizer must consume ${dependency}`,
    );
  }

  const types = readText("packages/render-tree-optimizer/src/types.ts");
  for (const evidence of [
    'RENDER_TREE_OPTIMIZER_VERSION = "1.0.0"',
    "RenderTreeOptimizerInput",
    "RenderTreeOptimizationResult",
    "sourceToRenderNodeId",
    "componentCandidateGroupCount",
  ]) {
    assert(types.includes(evidence), `Render-tree contract missing ${evidence}`);
  }

  const optimizer = readText("packages/render-tree-optimizer/src/optimizer.ts");
  for (const evidence of [
    "optimizeRenderTree",
    "preferredParentMap",
    "composedParentId",
    "canFoldWrapper",
    "sourceNodeIds",
    "StructuralFingerprint",
    "componentCandidate",
    "revisionHashes",
    "buildSections",
    "NODE-20 may revise compositing/fallback policy",
  ]) {
    assert(optimizer.includes(evidence), `Render Tree Optimizer missing ${evidence}`);
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
    assert(!optimizer.includes(forbidden), `Render Tree core must not use ${forbidden}`);
  }

  const runtime = readText("apps/browser-extension/src/runtime/render-tree-runtime.ts");
  for (const evidence of [
    "optimizeCapturedRenderTree",
    "optimizePersistedRenderTree",
    "readRawSnapshot",
    "readCssCascadeCapture",
    "readBaseLayoutAnalysis",
    "readTableLayoutResult",
  ]) {
    assert(runtime.includes(evidence), `Browser render-tree bridge missing ${evidence}`);
  }

  const store = readText("apps/browser-extension/src/runtime/render-tree-store.ts");
  for (const evidence of [
    'W2F_RENDER_TREE_DB_NAME = "w2f-render-tree"',
    'W2F_RENDER_TREE_STORE_NAME = "captures"',
    'W2F_RENDER_TREE_KEY_PREFIX = "render-tree:"',
    "writeRenderTreeOptimization",
    "readRenderTreeOptimization",
    "deleteRenderTreeOptimization",
  ]) {
    assert(store.includes(evidence), `Render Tree store missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/render-tree-optimizer"] === "workspace:*",
    "Browser must depend on render-tree-optimizer",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      browserPackage.scripts?.[script]?.includes("validate-node-19-package.mjs"),
      `Browser ${script} must require NODE-19 packaged-output validation`,
    );
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packager.includes('specifier: "@w2f/render-tree-optimizer"') &&
      packager.includes('directory: "render-tree-optimizer"'),
    "Browser packager must include Render Tree Optimizer runtime",
  );

  const jobState = readText("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "renderTreeStorageKey",
    "renderNodeCount",
    "foldedSourceNodeCount",
    "renderSectionCount",
    "componentCandidateCount",
    "componentCandidateGroupCount",
    "renderTreeDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `Capture receipt missing ${evidence}`);
  }

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistRenderTreeOptimization",
    "optimizePersistedRenderTree",
    "writeRenderTreeOptimization",
    "deleteRenderTreeOptimization",
    "renderTreeStorageKey",
    "renderNodeCount",
  ]) {
    assert(
      serviceWorker.includes(evidence),
      `Service worker render-tree orchestration missing ${evidence}`,
    );
  }

  const normative = readText("docs/RENDER_TREE_OPTIMIZER_V2.md");
  for (const evidence of [
    "Composed Tree",
    "wrapper",
    "stacking",
    "clip",
    "scroll",
    "sourceNodeIds",
    "StructuralFingerprint",
    "NODE-20",
  ]) {
    assert(normative.includes(evidence), `NODE-19 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-19 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-19 foundation validation passed.");
}
