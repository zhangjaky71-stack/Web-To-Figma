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
  "packages/layout-analyzer/package.json",
  "packages/layout-analyzer/tsconfig.json",
  "packages/layout-analyzer/tsconfig.build.json",
  "packages/layout-analyzer/src/index.ts",
  "packages/layout-analyzer/src/types.ts",
  "packages/layout-analyzer/src/analyzer.ts",
  "packages/layout-analyzer/test/layout-analyzer.test.ts",
  "apps/browser-extension/src/runtime/layout-analysis-runtime.ts",
  "apps/browser-extension/src/runtime/layout-analysis-store.ts",
  "apps/browser-extension/test/layout-analysis-runtime.test.ts",
  "apps/browser-extension/test/layout-analysis-store.test.ts",
  "apps/browser-extension/scripts/validate-node-17-package.mjs",
  "docs/BASE_LAYOUT_ANALYZER_V2.md",
  "docs/adr/ADR-0017-base-layout-evidence-precedence.md",
  "docs/nodes/NODE-17_BASE_LAYOUT_ANALYZER.md",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-17 missing ${file}`);
}

if (failures.length === 0) {
  const packageJson = readJson("packages/layout-analyzer/package.json");
  assert(packageJson.name === "@w2f/layout-analyzer", "NODE-17 package name drifted");
  assert(
    packageJson.dependencies?.["@w2f/w2f-ir"] === "workspace:*" &&
      packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "Layout Analyzer must consume frozen W2F IR/Schema contracts",
  );

  const types = readText("packages/layout-analyzer/src/types.ts");
  for (const evidence of [
    'BASE_LAYOUT_ANALYSIS_VERSION = "1.0.0"',
    "LayoutPropertyEvidence",
    "LayoutStyleEvidence",
    "LayoutResponsiveSizingHint",
    "BaseLayoutAnalysis",
    "LAYOUT_TABLE_DEFERRED",
    "LAYOUT_SIZING_CONFLICT",
  ]) {
    assert(types.includes(evidence), `Base Layout contract missing ${evidence}`);
  }

  const analyzer = readText("packages/layout-analyzer/src/analyzer.ts");
  for (const evidence of [
    "analyzeBaseLayout",
    "parseLayoutCssLength",
    "layoutMode",
    "sizingDecision",
    "geometryFillEvidence",
    "flexContainer",
    "gridContainer",
    "absoluteConstraints",
    "LAYOUT_TABLE_DEFERRED",
    "LAYOUT_SIZING_CONFLICT",
    'mode: "unknown"',
    'mode: "fill"',
    'mode: "fixed"',
  ]) {
    assert(analyzer.includes(evidence), `Base Layout engine missing ${evidence}`);
  }
  assert(
    analyzer.includes("value.semantic.value >= 95"),
    "NODE-17 must keep near-full percentage threshold explicit",
  );
  for (const forbidden of [
    "window.",
    "document.",
    "chrome.",
    "indexedDB",
    "fetch(",
    "Math.random",
    "Date.now",
    "new Date(",
    "localStorage",
    "sessionStorage",
    "document.cookie",
  ]) {
    assert(!analyzer.includes(forbidden), `Base Layout core must not use ${forbidden}`);
  }

  const irTypes = readText("packages/w2f-ir/src/types.ts");
  for (const frozen of [
    'WTF_IR_VERSION = "2.0.0"',
    "interface WtfLayoutModel",
    "interface WtfAxisSizing",
    "interface WtfSizingDecision",
    "interface WtfFlexContainerModel",
    "interface WtfFlexItemModel",
    "interface WtfGridContainerModel",
    "interface WtfGridItemModel",
    "interface WtfAbsoluteConstraints",
  ]) {
    assert(irTypes.includes(frozen), `Frozen IR layout vocabulary missing ${frozen}`);
  }
  const schema = readText("packages/w2f-schema/src/index.ts");
  assert(schema.includes('WTF_SCHEMA_VERSION = "2.0.0"'), "W2F Schema version must remain V2");

  const runtime = readText("apps/browser-extension/src/runtime/layout-analysis-runtime.ts");
  for (const evidence of [
    "buildBaseLayoutObservations",
    "analyzeSnapshotBaseLayout",
    "analyzePersistedBaseLayout",
    "readRawSnapshot",
    "readCssCascadeCapture",
    "status === \"winner\"",
    "parentBounds",
  ]) {
    assert(runtime.includes(evidence), `Browser layout bridge missing ${evidence}`);
  }
  for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "window.resizeTo", "fetch("]) {
    assert(!runtime.includes(forbidden), `Browser layout bridge must not use ${forbidden}`);
  }

  const store = readText("apps/browser-extension/src/runtime/layout-analysis-store.ts");
  for (const evidence of [
    'W2F_LAYOUT_ANALYSIS_DB_NAME = "w2f-layout-analysis"',
    'W2F_LAYOUT_ANALYSIS_STORE_NAME = "captures"',
    'W2F_LAYOUT_ANALYSIS_KEY_PREFIX = "layout-analysis:"',
    "writeBaseLayoutAnalysis",
    "readBaseLayoutAnalysis",
    "deleteBaseLayoutAnalysis",
  ]) {
    assert(store.includes(evidence), `Base Layout store missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/layout-analyzer"] === "workspace:*",
    "Browser must depend on layout-analyzer",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      browserPackage.scripts?.[script]?.includes("validate-node-17-package.mjs"),
      `Browser ${script} must require NODE-17 packaged-output validation`,
    );
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packager.includes('specifier: "@w2f/layout-analyzer"') &&
      packager.includes('directory: "layout-analyzer"'),
    "Browser packager must include Layout Analyzer runtime",
  );

  const jobState = readText("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "layoutAnalysisStorageKey",
    "layoutNodeCount",
    "layoutDiagnosticCount",
    "layoutFlexNodeCount",
    "layoutGridNodeCount",
    "layoutAbsoluteNodeCount",
  ]) {
    assert(jobState.includes(evidence), `Capture receipt missing ${evidence}`);
  }

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistBaseLayoutAnalysis",
    "analyzePersistedBaseLayout",
    "writeBaseLayoutAnalysis",
    "deleteBaseLayoutAnalysis",
    "layoutAnalysisStorageKey",
    "layoutNodeCount",
  ]) {
    assert(serviceWorker.includes(evidence), `Service worker layout orchestration missing ${evidence}`);
  }

  const normative = readText("docs/BASE_LAYOUT_ANALYZER_V2.md");
  for (const evidence of [
    "partial percentage",
    "LAYOUT_TABLE_DEFERRED",
    "w2f-layout-analysis",
    "NODE-18",
    "NODE-19",
    "NODE-20",
    "NODE-21",
    "NODE-27",
  ]) {
    assert(normative.includes(evidence), `NODE-17 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-17 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-17 foundation validation passed.");
}
