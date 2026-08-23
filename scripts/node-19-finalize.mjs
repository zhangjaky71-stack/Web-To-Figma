import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`NODE-19 patch anchor missing: ${label}`);
  return source.replace(before, after);
}

function injectValidator(script) {
  const commands = script.split(" && ");
  const output = [];
  for (const command of commands) {
    output.push(command);
    if (command.endsWith("validate-node-18-package.mjs")) {
      output.push(command.replace("validate-node-18-package.mjs", "validate-node-19-package.mjs"));
    }
  }
  return output.join(" && ");
}

const browserPackagePath = "apps/browser-extension/package.json";
const browserPackage = JSON.parse(readFileSync(browserPackagePath, "utf8"));
browserPackage.dependencies["@w2f/render-tree-optimizer"] = "workspace:*";
for (const scriptName of [
  "build",
  "build:standard",
  "build:high-fidelity",
  "validate:package",
  "validate:package:high-fidelity",
]) {
  const script = browserPackage.scripts[scriptName];
  if (typeof script !== "string") throw new Error(`NODE-19 missing Browser script ${scriptName}`);
  if (!script.includes("validate-node-19-package.mjs")) {
    browserPackage.scripts[scriptName] = injectValidator(script);
  }
}
writeFileSync(browserPackagePath, `${JSON.stringify(browserPackage, null, 2)}\n`);

const packagerPath = "apps/browser-extension/scripts/package-extension.mjs";
let packager = readFileSync(packagerPath, "utf8");
packager = replaceOnce(
  packager,
  '  {\n    specifier: "@w2f/table-layout-engine",\n    directory: "table-layout-engine",\n    dist: fileURLToPath(new URL("../../../packages/table-layout-engine/dist/", import.meta.url)),\n  },\n  {\n    specifier: "@w2f/standard-capture-adapter",',
  '  {\n    specifier: "@w2f/table-layout-engine",\n    directory: "table-layout-engine",\n    dist: fileURLToPath(new URL("../../../packages/table-layout-engine/dist/", import.meta.url)),\n  },\n  {\n    specifier: "@w2f/render-tree-optimizer",\n    directory: "render-tree-optimizer",\n    dist: fileURLToPath(\n      new URL("../../../packages/render-tree-optimizer/dist/", import.meta.url),\n    ),\n  },\n  {\n    specifier: "@w2f/standard-capture-adapter",',
  "Browser render-tree runtime package",
);
writeFileSync(packagerPath, packager);

const jobStatePath = "apps/browser-extension/src/runtime/job-state.ts";
let jobState = readFileSync(jobStatePath, "utf8");
jobState = replaceOnce(
  jobState,
  '  tableLayoutDiagnosticCount?: number;\n}',
  '  tableLayoutDiagnosticCount?: number;\n  renderTreeStorageKey?: string;\n  renderNodeCount?: number;\n  foldedSourceNodeCount?: number;\n  renderSectionCount?: number;\n  componentCandidateCount?: number;\n  componentCandidateGroupCount?: number;\n  renderTreeDiagnosticCount?: number;\n}',
  "render-tree capture receipt fields",
);
jobState = replaceOnce(
  jobState,
  '    isOptionalNonNegativeInteger(record.tableSpannedCellCount) &&\n    isOptionalNonNegativeInteger(record.tableLayoutDiagnosticCount)\n  );',
  '    isOptionalNonNegativeInteger(record.tableSpannedCellCount) &&\n    isOptionalNonNegativeInteger(record.tableLayoutDiagnosticCount) &&\n    (record.renderTreeStorageKey === undefined ||\n      (typeof record.renderTreeStorageKey === "string" && record.renderTreeStorageKey.length > 0)) &&\n    isOptionalNonNegativeInteger(record.renderNodeCount) &&\n    isOptionalNonNegativeInteger(record.foldedSourceNodeCount) &&\n    isOptionalNonNegativeInteger(record.renderSectionCount) &&\n    isOptionalNonNegativeInteger(record.componentCandidateCount) &&\n    isOptionalNonNegativeInteger(record.componentCandidateGroupCount) &&\n    isOptionalNonNegativeInteger(record.renderTreeDiagnosticCount)\n  );',
  "render-tree receipt validation",
);
writeFileSync(jobStatePath, jobState);

const serviceWorkerPath = "apps/browser-extension/src/runtime/service-worker.ts";
let serviceWorker = readFileSync(serviceWorkerPath, "utf8");
serviceWorker = replaceOnce(
  serviceWorker,
  'import { summarizeTableLayout } from "@w2f/table-layout-engine";\nimport { summarizePixelGroundTruth }',
  'import { summarizeTableLayout } from "@w2f/table-layout-engine";\nimport { summarizeRenderTreeOptimization } from "@w2f/render-tree-optimizer";\nimport { summarizePixelGroundTruth }',
  "render-tree summary import",
);
serviceWorker = replaceOnce(
  serviceWorker,
  'import { analyzePersistedTables } from "./table-layout-runtime.js";\nimport { deleteTableLayoutResult, writeTableLayoutResult } from "./table-layout-store.js";\nimport { capturePixelGroundTruthForSnapshot }',
  'import { analyzePersistedTables } from "./table-layout-runtime.js";\nimport { deleteTableLayoutResult, writeTableLayoutResult } from "./table-layout-store.js";\nimport { optimizePersistedRenderTree } from "./render-tree-runtime.js";\nimport {\n  deleteRenderTreeOptimization,\n  writeRenderTreeOptimization,\n} from "./render-tree-store.js";\nimport { capturePixelGroundTruthForSnapshot }',
  "render-tree Browser imports",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '    deleteBaseLayoutAnalysis(jobId),\n    deleteTableLayoutResult(jobId),\n  ]);',
  '    deleteBaseLayoutAnalysis(jobId),\n    deleteTableLayoutResult(jobId),\n    deleteRenderTreeOptimization(jobId),\n  ]);',
  "render-tree cleanup",
);
const environmentAnchor = 'async function persistEnvironment(\n';
if (!serviceWorker.includes("async function persistRenderTreeOptimization(")) {
  if (!serviceWorker.includes(environmentAnchor)) throw new Error("NODE-19 render-tree helper anchor missing");
  const helper = `async function persistRenderTreeOptimization(\n  jobId: string,\n): Promise<\n  Pick<\n    CaptureSnapshotReceipt,\n    | "renderTreeStorageKey"\n    | "renderNodeCount"\n    | "foldedSourceNodeCount"\n    | "renderSectionCount"\n    | "componentCandidateCount"\n    | "componentCandidateGroupCount"\n    | "renderTreeDiagnosticCount"\n  >\n> {\n  const result = await optimizePersistedRenderTree(jobId);\n  const renderTreeStorageKey = await writeRenderTreeOptimization(jobId, result);\n  const summary = summarizeRenderTreeOptimization(result);\n  return {\n    renderTreeStorageKey,\n    renderNodeCount: summary.renderNodeCount,\n    foldedSourceNodeCount: summary.foldedSourceNodeCount,\n    renderSectionCount: summary.sectionCount,\n    componentCandidateCount: summary.componentCandidateCount,\n    componentCandidateGroupCount: summary.componentCandidateGroupCount,\n    renderTreeDiagnosticCount: summary.diagnosticCount,\n  };\n}\n\n`;
  serviceWorker = serviceWorker.replace(environmentAnchor, `${helper}${environmentAnchor}`);
}
serviceWorker = replaceOnce(
  serviceWorker,
  '    const tableReceipt = await persistTableLayout(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, snapshot);',
  '    const tableReceipt = await persistTableLayout(jobId);\n    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, snapshot);',
  "standard render-tree persistence",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '        ...tableReceipt,\n        ...environmentReceipt,',
  '        ...tableReceipt,\n        ...renderTreeReceipt,\n        ...environmentReceipt,',
  "standard render-tree receipt",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '    const tableReceipt = await persistTableLayout(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);',
  '    const tableReceipt = await persistTableLayout(jobId);\n    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);\n    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);',
  "cdp render-tree persistence",
);
serviceWorker = replaceOnce(
  serviceWorker,
  '        ...tableReceipt,\n        ...environmentReceipt,\n        ...assetReceipt,',
  '        ...tableReceipt,\n        ...renderTreeReceipt,\n        ...environmentReceipt,\n        ...assetReceipt,',
  "cdp render-tree receipt",
);
writeFileSync(serviceWorkerPath, serviceWorker);

const foundationPath = "scripts/validate-foundation.mjs";
let foundation = readFileSync(foundationPath, "utf8");
const foundationAnchor = 'import "./validate-node-18.mjs";';
const foundationAddition = 'import "./validate-node-19.mjs";';
if (!foundation.includes(foundationAddition)) {
  if (!foundation.includes(foundationAnchor)) throw new Error("NODE-19 foundation anchor missing");
  foundation = foundation.replace(foundationAnchor, `${foundationAnchor}\n${foundationAddition}`);
}
writeFileSync(foundationPath, foundation);
