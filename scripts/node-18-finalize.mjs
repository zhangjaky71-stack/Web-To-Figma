import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`NODE-18 patch anchor missing: ${label}`);
  return source.replace(before, after);
}

function injectValidator(script) {
  const commands = script.split(" && ");
  const output = [];
  for (const command of commands) {
    output.push(command);
    if (command.endsWith("validate-node-17-package.mjs")) {
      output.push(command.replace("validate-node-17-package.mjs", "validate-node-18-package.mjs"));
    }
  }
  return output.join(" && ");
}

const analyzerPath = "packages/table-layout-engine/src/analyzer.ts";
let analyzer = readFileSync(analyzerPath, "utf8");
analyzer = replaceOnce(
  analyzer,
  'import type { CssCascadePropertyTrace, CssNodeCascadeEvidence } from "@w2f/css-cascade";\nimport {',
  'import type { CssCascadePropertyTrace, CssNodeCascadeEvidence } from "@w2f/css-cascade";\nimport type { Rect } from "@w2f/w2f-schema";\nimport {',
  "table Rect import",
);
analyzer = replaceOnce(
  analyzer,
  'function boundsUnion(nodes: readonly RawNode[]): RawNode["geometry"]["bounds"] | undefined {',
  'function boundsUnion(nodes: readonly RawNode[]): Rect | undefined {',
  "table bounds union return type",
);
analyzer = replaceOnce(
  analyzer,
  '      const rawRowSpan = parsePositiveSpan(cell.source.attributes?.rowspan, cell.captureNodeId, "rowspan", diagnostics);\n      const columnSpan = parsePositiveSpan(cell.source.attributes?.colspan, cell.captureNodeId, "colspan", diagnostics);\n      const resolvedColumnSpan = columnSpan === "to-end" ? 1 : columnSpan;\n      const rowSpan = rawRowSpan === "to-end" ? Math.max(1, rowCount - rowIndex) : rawRowSpan;',
  '      const rawRowSpan = parsePositiveSpan(\n        cell.source.attributes?.rowspan,\n        cell.captureNodeId,\n        "rowspan",\n        diagnostics,\n      );\n      const columnSpan = parsePositiveSpan(\n        cell.source.attributes?.colspan,\n        cell.captureNodeId,\n        "colspan",\n        diagnostics,\n      );\n      const resolvedColumnSpan = columnSpan === "to-end" ? 1 : columnSpan;\n      const groupRows = groups[group.index]?.rowSourceNodeIds ?? [];\n      const rowIndexWithinGroup = Math.max(0, groupRows.indexOf(row.captureNodeId));\n      const rowSpan =\n        rawRowSpan === "to-end"\n          ? Math.max(1, groupRows.length > 0 ? groupRows.length - rowIndexWithinGroup : rowCount - rowIndex)\n          : rawRowSpan;',
  "rowspan zero row-group boundary",
);
writeFileSync(analyzerPath, analyzer);

const standardCascadePath = "packages/standard-capture-adapter/src/cascade-capture.ts";
let standardCascade = readFileSync(standardCascadePath, "utf8");
standardCascade = replaceOnce(
  standardCascade,
  '  type ProvisionalDefinition = CssTokenDefinitionEvidence & { referenceNames: string[] };\n\n  const maxRules =',
  '  type ProvisionalDefinition = CssTokenDefinitionEvidence & { referenceNames: string[] };\n\n  const requiredComputedProperties = [\n    "border-collapse",\n    "border-spacing",\n    "table-layout",\n    "caption-side",\n  ] as const;\n\n  const maxRules =',
  "standard table computed property list",
);
standardCascade = replaceOnce(
  standardCascade,
  '    const traces = [...candidatesByProperty.entries()]\n      .map(([property, candidates]) => ({',
  '    for (const property of requiredComputedProperties) {\n      if (!candidatesByProperty.has(property)) candidatesByProperty.set(property, []);\n    }\n\n    const traces = [...candidatesByProperty.entries()]\n      .map(([property, candidates]) => ({',
  "standard table computed trace preservation",
);
writeFileSync(standardCascadePath, standardCascade);

const cdpCascadePath = "apps/browser-extension/src/runtime/css-cascade-runtime.ts";
let cdpCascade = readFileSync(cdpCascadePath, "utf8");
cdpCascade = replaceOnce(
  cdpCascade,
  'const CDP_REQUIRED_PROTOCOL_VERSION = "1.3" as const;\nconst CDP_CASCADE_NODE_LIMIT = 2500;',
  'const CDP_REQUIRED_PROTOCOL_VERSION = "1.3" as const;\nconst CDP_CASCADE_NODE_LIMIT = 2500;\nconst TABLE_REQUIRED_COMPUTED_PROPERTIES = [\n  "border-collapse",\n  "border-spacing",\n  "table-layout",\n  "caption-side",\n] as const;',
  "cdp table computed property list",
);
cdpCascade = replaceOnce(
  cdpCascade,
  '    const traces = [...candidates.entries()]\n      .map(([property, values]) => ({',
  '    for (const property of TABLE_REQUIRED_COMPUTED_PROPERTIES) {\n      if (!candidates.has(property)) candidates.set(property, []);\n    }\n\n    const traces = [...candidates.entries()]\n      .map(([property, values]) => ({',
  "cdp table computed trace preservation",
);
writeFileSync(cdpCascadePath, cdpCascade);

const browserPackagePath = "apps/browser-extension/package.json";
const browserPackage = JSON.parse(readFileSync(browserPackagePath, "utf8"));
browserPackage.dependencies["@w2f/table-layout-engine"] = "workspace:*";
for (const scriptName of [
  "build",
  "build:standard",
  "build:high-fidelity",
  "validate:package",
  "validate:package:high-fidelity",
]) {
  const script = browserPackage.scripts[scriptName];
  if (typeof script !== "string") throw new Error(`NODE-18 missing Browser script ${scriptName}`);
  if (!script.includes("validate-node-18-package.mjs")) browserPackage.scripts[scriptName] = injectValidator(script);
}
writeFileSync(browserPackagePath, `${JSON.stringify(browserPackage, null, 2)}\n`);

const packagerPath = "apps/browser-extension/scripts/package-extension.mjs";
let packager = readFileSync(packagerPath, "utf8");
packager = replaceOnce(
  packager,
  '  {\n    specifier: "@w2f/layout-analyzer",\n    directory: "layout-analyzer",\n    dist: fileURLToPath(new URL("../../../packages/layout-analyzer/dist/", import.meta.url)),\n  },\n  {\n    specifier: "@w2f/standard-capture-adapter",',
  '  {\n    specifier: "@w2f/layout-analyzer",\n    directory: "layout-analyzer",\n    dist: fileURLToPath(new URL("../../../packages/layout-analyzer/dist/", import.meta.url)),\n  },\n  {\n    specifier: "@w2f/table-layout-engine",\n    directory: "table-layout-engine",\n    dist: fileURLToPath(\n      new URL("../../../packages/table-layout-engine/dist/", import.meta.url),\n    ),\n  },\n  {\n    specifier: "@w2f/standard-capture-adapter",',
  "Browser table runtime package",
);
writeFileSync(packagerPath, packager);

const jobStatePath = "apps/browser-extension/src/runtime/job-state.ts";
let jobState = readFileSync(jobStatePath, "utf8");
jobState = replaceOnce(
  jobState,
  '  layoutAbsoluteNodeCount?: number;\n}',
  '  layoutAbsoluteNodeCount?: number;\n  tableLayoutStorageKey?: string;\n  tableCount?: number;\n  tableRowCount?: number;\n  tableCellCount?: number;\n  tableSpannedCellCount?: number;\n  tableLayoutDiagnosticCount?: number;\n}',
  "table capture receipt fields",
);
jobState = replaceOnce(
  jobState,
  '    isOptionalNonNegativeInteger(record.layoutFlexNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutGridNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutAbsoluteNodeCount)\n  );',
  '    isOptionalNonNegativeInteger(record.layoutFlexNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutGridNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutAbsoluteNodeCount) &&\n    (record.tableLayoutStorageKey === undefined ||\n      (typeof record.tableLayoutStorageKey === "string" && record.tableLayoutStorageKey.length > 0)) &&\n    isOptionalNonNegativeInteger(record.tableCount) &&\n    isOptionalNonNegativeInteger(record.tableRowCount) &&\n    isOptionalNonNegativeInteger(record.tableCellCount) &&\n    isOptionalNonNegativeInteger(record.tableSpannedCellCount) &&\n    isOptionalNonNegativeInteger(record.tableLayoutDiagnosticCount)\n  );',
  "table receipt validation",
);
writeFileSync(jobStatePath, jobState);

const serviceWorkerPath = "apps/browser-extension/src/runtime/service-worker.ts";
let serviceWorker = readFileSync(serviceWorkerPath, "utf8");
serviceWorker = replaceOnce(
  serviceWorker,
  'import { summarizeBaseLayoutAnalysis } from "@w2f/layout-analyzer";\nimport { summarizePixelGroundTruth }',
  'import { summarizeBaseLayoutAnalysis } from "@w2f/layout-analyzer";\nimport { summarizeTableLayout } from "@w2f/table-layout-engine";\nimport { summarizePixelGroundTruth }',
  "table summary import",
);
serviceWorker = replaceOnce(
  serviceWorker,
  'import { analyzePersistedBaseLayout } from "./layout-analysis-runtime.js";\nimport { deleteBaseLayoutAnalysis, writeBaseLayoutAnalysis } from "./layout-analysis-store.js";\nimport { capturePixelGroundTruthForSnapshot }',
  'import { analyzePersistedBaseLayout } from "./layout-analysis-runtime.js";\nimport { deleteBaseLayoutAnalysis, writeBaseLayoutAnalysis } from "./layout-analysis-store.js";\nimport { analyzePersistedTables } from "./table-layout-runtime.js";\nimport { deleteTableLayoutResult, writeTableLayoutResult } from "./table-layout-store.js";\nimport { capturePixelGroundTruthForSnapshot }',
  "table Browser imports",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '    deletePixelGroundTruth(jobId),\n    deleteBaseLayoutAnalysis(jobId),\n  ]);',
  '    deletePixelGroundTruth(jobId),\n    deleteBaseLayoutAnalysis(jobId),\n    deleteTableLayoutResult(jobId),\n  ]);',
  "table cleanup",
);
const environmentAnchor = 'async function persistEnvironment(\n';
if (!serviceWorker.includes("async function persistTableLayout(")) {
  if (!serviceWorker.includes(environmentAnchor)) throw new Error("NODE-18 table persist insertion anchor missing");
  const helper = `async function persistTableLayout(\n  jobId: string,\n): Promise<\n  Pick<\n    CaptureSnapshotReceipt,\n    | "tableLayoutStorageKey"\n    | "tableCount"\n    | "tableRowCount"\n    | "tableCellCount"\n    | "tableSpannedCellCount"\n    | "tableLayoutDiagnosticCount"\n  >\n> {\n  const result = await analyzePersistedTables(jobId);\n  const tableLayoutStorageKey = await writeTableLayoutResult(jobId, result);\n  const summary = summarizeTableLayout(result);\n  return {\n    tableLayoutStorageKey,\n    tableCount: summary.tableCount,\n    tableRowCount: summary.rowCount,\n    tableCellCount: summary.cellCount,\n    tableSpannedCellCount: summary.spannedCellCount,\n    tableLayoutDiagnosticCount: summary.diagnosticCount,\n  };\n}\n\n`;
  serviceWorker = serviceWorker.replace(environmentAnchor, `${helper}${environmentAnchor}`);
}
serviceWorker = replaceOnce(
  serviceWorker,
  '    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, snapshot);',
  '    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n    const tableReceipt = await persistTableLayout(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, snapshot);',
  "standard table persistence",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '        ...layoutReceipt,\n        ...environmentReceipt,',
  '        ...layoutReceipt,\n        ...tableReceipt,\n        ...environmentReceipt,',
  "standard table receipt",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);',
  '    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n    const tableReceipt = await persistTableLayout(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);',
  "cdp table persistence",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '        ...layoutReceipt,\n        ...environmentReceipt,\n        ...assetReceipt,',
  '        ...layoutReceipt,\n        ...tableReceipt,\n        ...environmentReceipt,\n        ...assetReceipt,',
  "cdp table receipt",
);
writeFileSync(serviceWorkerPath, serviceWorker);

const foundationPath = "scripts/validate-foundation.mjs";
let foundation = readFileSync(foundationPath, "utf8");
const foundationAnchor = 'import "./validate-node-17.mjs";';
const foundationAddition = 'import "./validate-node-18.mjs";';
if (!foundation.includes(foundationAddition)) {
  if (!foundation.includes(foundationAnchor)) throw new Error("NODE-18 foundation anchor missing");
  foundation = foundation.replace(foundationAnchor, `${foundationAnchor}\n${foundationAddition}`);
}
writeFileSync(foundationPath, foundation);
