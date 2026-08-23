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
  "packages/table-layout-engine/package.json",
  "packages/table-layout-engine/tsconfig.json",
  "packages/table-layout-engine/tsconfig.build.json",
  "packages/table-layout-engine/src/index.ts",
  "packages/table-layout-engine/src/types.ts",
  "packages/table-layout-engine/src/analyzer.ts",
  "packages/table-layout-engine/src/validation.ts",
  "packages/table-layout-engine/test/table-layout-engine.test.ts",
  "apps/browser-extension/src/runtime/table-layout-runtime.ts",
  "apps/browser-extension/src/runtime/table-layout-store.ts",
  "apps/browser-extension/test/table-layout-runtime.test.ts",
  "apps/browser-extension/test/table-layout-store.test.ts",
  "apps/browser-extension/scripts/validate-node-18-package.mjs",
  "docs/TABLE_LAYOUT_ENGINE_V2.md",
  "docs/adr/ADR-0018-table-occupancy-and-rendering-boundary.md",
  "docs/nodes/NODE-18_TABLE_LAYOUT_ENGINE.md",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-18 missing ${file}`);
}

if (failures.length === 0) {
  const packageJson = readJson("packages/table-layout-engine/package.json");
  assert(packageJson.name === "@w2f/table-layout-engine", "NODE-18 package name drifted");
  assert(
    packageJson.dependencies?.["@w2f/capture-core"] === "workspace:*" &&
      packageJson.dependencies?.["@w2f/css-cascade"] === "workspace:*",
    "Table Layout Engine must consume RawSnapshot and CSS Cascade evidence",
  );

  const types = readText("packages/table-layout-engine/src/types.ts");
  for (const evidence of [
    'TABLE_LAYOUT_ENGINE_VERSION = "1.0.0"',
    "TableRowGroupAnalysis",
    "TableRowAnalysis",
    "TableCellAnalysis",
    "TableOccupancySlot",
    "TableColumnTrack",
    "TableRowTrack",
    '"regular-grid"',
    '"span-hybrid"',
    '"absolute-semantic"',
  ]) {
    assert(types.includes(evidence), `Table layout contract missing ${evidence}`);
  }

  const analyzer = readText("packages/table-layout-engine/src/analyzer.ts");
  for (const evidence of [
    "analyzeTableLayout",
    "collectRows",
    "parsePositiveSpan",
    "deriveTracks",
    "rowspan",
    "colspan",
    "border-collapse",
    "border-spacing",
    "table-layout",
    "caption-side",
    "TABLE_SPAN_INVALID",
    "TABLE_SPAN_CONFLICT",
    "TABLE_GEOMETRY_INCOMPLETE",
  ]) {
    assert(analyzer.includes(evidence), `Table Layout engine missing ${evidence}`);
  }
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
    assert(!analyzer.includes(forbidden), `Table Layout core must not use ${forbidden}`);
  }

  const runtime = readText("apps/browser-extension/src/runtime/table-layout-runtime.ts");
  for (const evidence of [
    "analyzeSnapshotTables",
    "analyzePersistedTables",
    "readRawSnapshot",
    "readCssCascadeCapture",
  ]) {
    assert(runtime.includes(evidence), `Browser table bridge missing ${evidence}`);
  }

  const store = readText("apps/browser-extension/src/runtime/table-layout-store.ts");
  for (const evidence of [
    'W2F_TABLE_LAYOUT_DB_NAME = "w2f-table-layout"',
    'W2F_TABLE_LAYOUT_STORE_NAME = "captures"',
    'W2F_TABLE_LAYOUT_KEY_PREFIX = "table-layout:"',
    "writeTableLayoutResult",
    "readTableLayoutResult",
    "deleteTableLayoutResult",
  ]) {
    assert(store.includes(evidence), `Table Layout store missing ${evidence}`);
  }

  const standardCascade = readText("packages/standard-capture-adapter/src/cascade-capture.ts");
  const cdpCascade = readText("apps/browser-extension/src/runtime/css-cascade-runtime.ts");
  for (const property of ["border-collapse", "border-spacing", "table-layout", "caption-side"]) {
    assert(standardCascade.includes(property), `Standard CSS capture missing ${property}`);
    assert(cdpCascade.includes(property), `CDP CSS capture missing ${property}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/table-layout-engine"] === "workspace:*",
    "Browser must depend on table-layout-engine",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      browserPackage.scripts?.[script]?.includes("validate-node-18-package.mjs"),
      `Browser ${script} must require NODE-18 packaged-output validation`,
    );
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packager.includes('specifier: "@w2f/table-layout-engine"') &&
      packager.includes('directory: "table-layout-engine"'),
    "Browser packager must include Table Layout Engine runtime",
  );

  const jobState = readText("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "tableLayoutStorageKey",
    "tableCount",
    "tableRowCount",
    "tableCellCount",
    "tableSpannedCellCount",
    "tableLayoutDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `Capture receipt missing ${evidence}`);
  }

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistTableLayout",
    "analyzePersistedTables",
    "writeTableLayoutResult",
    "deleteTableLayoutResult",
    "tableLayoutStorageKey",
    "tableCellCount",
  ]) {
    assert(
      serviceWorker.includes(evidence),
      `Service worker table orchestration missing ${evidence}`,
    );
  }

  const normative = readText("docs/TABLE_LAYOUT_ENGINE_V2.md");
  for (const evidence of [
    "rowspan",
    "colspan",
    "border-collapse",
    "border-spacing",
    "table-layout",
    "regular-grid",
    "span-hybrid",
    "absolute-semantic",
    "NODE-19",
    "NODE-20",
  ]) {
    assert(normative.includes(evidence), `NODE-18 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-18 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-18 foundation validation passed.");
}
