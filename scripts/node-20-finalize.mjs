import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`NODE-20 finalizer missing anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`NODE-20 finalizer anchor is ambiguous: ${label}`);
  }
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function addPackageValidator(command) {
  if (command.includes("validate-node-20-package.mjs")) return command;
  const segments = command.split(" && ");
  const output = [];
  let inserted = 0;
  for (const segment of segments) {
    output.push(segment);
    if (segment.endsWith("node scripts/validate-node-19-package.mjs")) {
      const highFidelity = segment.startsWith("W2F_BROWSER_PROFILE=high-fidelity ");
      output.push(
        `${highFidelity ? "W2F_BROWSER_PROFILE=high-fidelity " : ""}node scripts/validate-node-20-package.mjs`,
      );
      inserted += 1;
    }
  }
  if (inserted === 0) throw new Error("NODE-20 could not place Browser package validator");
  return output.join(" && ");
}

// Browser dependency and package validation commands.
{
  const path = "apps/browser-extension/package.json";
  const packageJson = JSON.parse(read(path));
  packageJson.dependencies["@w2f/compositing-engine"] = "workspace:*";
  for (const script of [
    "build",
    "build:standard",
    "build:high-fidelity",
    "validate:package",
    "validate:package:high-fidelity",
  ]) {
    packageJson.scripts[script] = addPackageValidator(packageJson.scripts[script]);
  }
  write(path, `${JSON.stringify(packageJson, null, 2)}\n`);
}

// Runtime package copier.
{
  const path = "apps/browser-extension/scripts/package-extension.mjs";
  let source = read(path);
  source = replaceOnce(
    source,
    `  {\n    specifier: "@w2f/standard-capture-adapter",`,
    `  {\n    specifier: "@w2f/compositing-engine",\n    directory: "compositing-engine",\n    dist: fileURLToPath(new URL("../../../packages/compositing-engine/dist/", import.meta.url)),\n  },\n  {\n    specifier: "@w2f/standard-capture-adapter",`,
    "package-extension compositing runtime package",
  );
  write(path, source);
}

// Permanent foundation validator entrypoint.
{
  const path = "scripts/validate-foundation.mjs";
  let source = read(path);
  source = replaceOnce(
    source,
    `import "./validate-node-19.mjs";`,
    `import "./validate-node-19.mjs";\nimport "./validate-node-20.mjs";`,
    "foundation NODE-20 import",
  );
  write(path, source);
}

// Capture receipt contract and validation.
{
  const path = "apps/browser-extension/src/runtime/job-state.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `  renderTreeDiagnosticCount?: number;\n}`,
    `  renderTreeDiagnosticCount?: number;\n  compositingStorageKey?: string;\n  fallbackBoundaryCount?: number;\n  fallbackMemberNodeCount?: number;\n  fallbackTriggerNodeCount?: number;\n  promotedFallbackBoundaryCount?: number;\n  compositingDiagnosticCount?: number;\n}`,
    "receipt fields",
  );
  source = replaceOnce(
    source,
    `    isOptionalNonNegativeInteger(record.componentCandidateGroupCount) &&\n    isOptionalNonNegativeInteger(record.renderTreeDiagnosticCount)\n  );`,
    `    isOptionalNonNegativeInteger(record.componentCandidateGroupCount) &&\n    isOptionalNonNegativeInteger(record.renderTreeDiagnosticCount) &&\n    (record.compositingStorageKey === undefined ||\n      (typeof record.compositingStorageKey === "string" &&\n        record.compositingStorageKey.length > 0)) &&\n    isOptionalNonNegativeInteger(record.fallbackBoundaryCount) &&\n    isOptionalNonNegativeInteger(record.fallbackMemberNodeCount) &&\n    isOptionalNonNegativeInteger(record.fallbackTriggerNodeCount) &&\n    isOptionalNonNegativeInteger(record.promotedFallbackBoundaryCount) &&\n    isOptionalNonNegativeInteger(record.compositingDiagnosticCount)\n  );`,
    "receipt validation",
  );
  write(path, source);
}

// Browser orchestration: render tree -> compositing -> downstream evidence.
{
  const path = "apps/browser-extension/src/runtime/service-worker.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `import { summarizeAssetCapture } from "@w2f/asset-resolver";`,
    `import { summarizeAssetCapture } from "@w2f/asset-resolver";\nimport {\n  summarizeCompositingAnalysis,\n  type CompositingAnalysisResult,\n} from "@w2f/compositing-engine";`,
    "service-worker compositing package import",
  );
  source = replaceOnce(
    source,
    `import { captureAssetsForSnapshot } from "./asset-runtime.js";`,
    `import { captureAssetsForSnapshot } from "./asset-runtime.js";\nimport { analyzePersistedCompositing } from "./compositing-runtime.js";\nimport {\n  deleteCompositingAnalysis,\n  readCompositingAnalysis,\n  writeCompositingAnalysis,\n} from "./compositing-store.js";`,
    "service-worker compositing runtime/store imports",
  );
  source = replaceOnce(
    source,
    `    deleteRenderTreeOptimization(jobId),\n  ]);`,
    `    deleteRenderTreeOptimization(jobId),\n    deleteCompositingAnalysis(jobId),\n  ]);`,
    "capture cleanup",
  );
  source = replaceOnce(
    source,
    `async function persistEnvironment(\n  tabId: number,`,
    `async function persistCompositingAnalysis(\n  jobId: string,\n): Promise<\n  Pick<\n    CaptureSnapshotReceipt,\n    | "compositingStorageKey"\n    | "fallbackBoundaryCount"\n    | "fallbackMemberNodeCount"\n    | "fallbackTriggerNodeCount"\n    | "promotedFallbackBoundaryCount"\n    | "compositingDiagnosticCount"\n  >\n> {\n  const result = await analyzePersistedCompositing(jobId);\n  const compositingStorageKey = await writeCompositingAnalysis(jobId, result);\n  const summary = summarizeCompositingAnalysis(result);\n  return {\n    compositingStorageKey,\n    fallbackBoundaryCount: summary.fallbackBoundaryCount,\n    fallbackMemberNodeCount: summary.fallbackMemberNodeCount,\n    fallbackTriggerNodeCount: summary.fallbackTriggerNodeCount,\n    promotedFallbackBoundaryCount: summary.promotedBoundaryCount,\n    compositingDiagnosticCount: summary.diagnosticCount,\n  };\n}\n\nasync function persistEnvironment(\n  tabId: number,`,
    "persist compositing analysis",
  );
  source = replaceOnce(
    source,
    `async function persistPixelGroundTruth(\n  tabId: number,`,
    `function sameBounds(\n  left: { x: number; y: number; width: number; height: number },\n  right: { x: number; y: number; width: number; height: number },\n): boolean {\n  const epsilon = 1e-6;\n  return (\n    Math.abs(left.x - right.x) <= epsilon &&\n    Math.abs(left.y - right.y) <= epsilon &&\n    Math.abs(left.width - right.width) <= epsilon &&\n    Math.abs(left.height - right.height) <= epsilon\n  );\n}\n\nfunction fallbackBoundaryRasterRequests(\n  snapshot: RawSnapshot,\n  compositing: CompositingAnalysisResult,\n): Array<{ sourceNodeId: string; reason: string }> {\n  const rawById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));\n  const renderById = new Map(compositing.tree.nodes.map((node) => [node.id, node]));\n  return compositing.boundaries.flatMap((boundary) => {\n    const renderNode = renderById.get(boundary.rootRenderNodeId);\n    if (!renderNode) return [];\n    const geometryMatched = renderNode.sourceNodeIds.find((sourceNodeId) => {\n      const bounds = rawById.get(sourceNodeId)?.geometry?.bounds;\n      return bounds ? sameBounds(bounds, boundary.bounds) : false;\n    });\n    const sourceNodeId =\n      geometryMatched ??\n      [...renderNode.sourceNodeIds].reverse().find((candidate) => rawById.has(candidate));\n    if (!sourceNodeId) return [];\n    return [\n      {\n        sourceNodeId,\n        reason: `compositing-boundary:${boundary.id};${boundary.reasons.join(";")}`,\n      },\n    ];\n  });\n}\n\nasync function persistPixelGroundTruth(\n  tabId: number,`,
    "compositing fallback raster request helper",
  );
  source = replaceOnce(
    source,
    `  const fallbackRequests = (assetCapture?.diagnostics ?? []).flatMap((diagnostic) =>\n    diagnostic.sourceNodeId && ASSET_RASTER_FALLBACK_CODES.has(diagnostic.code)\n      ? [\n          {\n            sourceNodeId: diagnostic.sourceNodeId,\n            reason: \`asset:\${diagnostic.code}\`,\n          },\n        ]\n      : [],\n  );`,
    `  const compositing = await readCompositingAnalysis(jobId);\n  const fallbackRequests = [\n    ...(assetCapture?.diagnostics ?? []).flatMap((diagnostic) =>\n      diagnostic.sourceNodeId && ASSET_RASTER_FALLBACK_CODES.has(diagnostic.code)\n        ? [\n            {\n              sourceNodeId: diagnostic.sourceNodeId,\n              reason: \`asset:\${diagnostic.code}\`,\n            },\n          ]\n        : [],\n    ),\n    ...(compositing ? fallbackBoundaryRasterRequests(snapshot, compositing) : []),\n  ];`,
    "pixel ground truth compositing requests",
  );
  source = source.replaceAll(
    `    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);\n    const environmentReceipt =`,
    `    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);\n    const compositingReceipt = await persistCompositingAnalysis(jobId);\n    const environmentReceipt =`,
  );
  const persistUses = source.match(/persistCompositingAnalysis\(jobId\)/g)?.length ?? 0;
  if (persistUses !== 2) {
    throw new Error(`NODE-20 expected compositing persistence in Standard/CDP paths, found ${persistUses}`);
  }
  source = source.replaceAll(
    `        ...renderTreeReceipt,\n        ...environmentReceipt,`,
    `        ...renderTreeReceipt,\n        ...compositingReceipt,\n        ...environmentReceipt,`,
  );
  const receiptUses = source.match(/\.\.\.compositingReceipt/g)?.length ?? 0;
  if (receiptUses !== 2) {
    throw new Error(`NODE-20 expected compositing receipt in Standard/CDP paths, found ${receiptUses}`);
  }
  write(path, source);
}
