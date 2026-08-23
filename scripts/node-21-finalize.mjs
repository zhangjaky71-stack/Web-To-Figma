import { readFile, writeFile } from "node:fs/promises";

async function text(path) {
  return readFile(path, "utf8");
}
async function write(path, content) {
  await writeFile(path, content, "utf8");
}
function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) throw new Error(`NODE-21 finalizer missing anchor: ${label}`);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error(`NODE-21 finalizer anchor is ambiguous: ${label}`);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}
function replaceLast(content, before, after, label) {
  const index = content.lastIndexOf(before);
  if (index < 0) throw new Error(`NODE-21 finalizer missing anchor: ${label}`);
  return content.slice(0, index) + after + content.slice(index + before.length);
}

// Shared writer cleanup.
{
  const path = "packages/wtf-packager/src/packager.ts";
  let source = await text(path);
  source = source.replace("  WTF_CHECKSUMS_PATH as _unused,\n", "");
  if (source.includes("WTF_CHECKSUMS_PATH as _unused")) throw new Error("failed to remove invalid schema import");
  await write(path, source);
}

// Browser canonical payload builder fixes.
{
  const path = "apps/browser-extension/src/runtime/wtf-package-builder.ts";
  let source = await text(path);
  source = replaceOnce(
    source,
    `  for (const item of evidence.compositing.diagnostics)\n    add("COMPOSITING", item.code, item.message, item.renderNodeId ? evidence.compositing.tree.nodes.find((node) => node.id === item.renderNodeId)?.sourceNodeIds[0] : undefined);`,
    `  for (const item of evidence.compositing.diagnostics) {\n    const renderNodeId = item.renderNodeIds?.[0];\n    const sourceNodeId =\n      item.sourceNodeIds?.[0] ??\n      (renderNodeId\n        ? evidence.compositing.tree.nodes.find((node) => node.id === renderNodeId)?.sourceNodeIds[0]\n        : undefined);\n    add("COMPOSITING", item.code, item.message, sourceNodeId);\n  }`,
    "compositing diagnostic mapping",
  );
  source = source.replaceAll('"structural-fingerprint"', '"structural-fingerprints"');
  source = source.replace('    optional.add("responsive-rules");\n    optional.add("multi-viewport");', '    optional.add("responsive-snapshots");');
  await write(path, source);
}

// Browser package dependency and package-output validators.
{
  const path = "apps/browser-extension/package.json";
  const packageJson = JSON.parse(await text(path));
  packageJson.dependencies["@w2f/wtf-packager"] = "workspace:*";
  const normal20 = "node scripts/validate-node-20-package.mjs";
  const normal21 = "node scripts/validate-node-21-package.mjs";
  const high20 = "W2F_BROWSER_PROFILE=high-fidelity node scripts/validate-node-20-package.mjs";
  const high21 = "W2F_BROWSER_PROFILE=high-fidelity node scripts/validate-node-21-package.mjs";

  packageJson.scripts.build = replaceOnce(
    packageJson.scripts.build,
    `${normal20} && tsc -p tsconfig.build.json`,
    `${normal20} && ${normal21} && tsc -p tsconfig.build.json`,
    "Browser build standard NODE-21 validator",
  );
  packageJson.scripts.build = replaceLast(
    packageJson.scripts.build,
    high20,
    `${high20} && ${high21}`,
    "Browser build high-fidelity NODE-21 validator",
  );
  for (const key of ["build:standard", "validate:package"]) {
    if (!packageJson.scripts[key].endsWith(normal20)) throw new Error(`${key} NODE-20 validator is not final`);
    packageJson.scripts[key] += ` && ${normal21}`;
  }
  for (const key of ["build:high-fidelity", "validate:package:high-fidelity"]) {
    if (!packageJson.scripts[key].endsWith(high20)) throw new Error(`${key} NODE-20 validator is not final`);
    packageJson.scripts[key] += ` && ${high21}`;
  }
  await write(path, JSON.stringify(packageJson, null, 2) + "\n");
}

// Ship the writer runtime with the unpacked extension.
{
  const path = "apps/browser-extension/scripts/package-extension.mjs";
  let source = await text(path);
  const marker = `  {\n    specifier: "@w2f/standard-capture-adapter",`;
  const addition = `  {\n    specifier: "@w2f/wtf-packager",\n    directory: "wtf-packager",\n    dist: fileURLToPath(new URL("../../../packages/wtf-packager/dist/", import.meta.url)),\n  },\n`;
  source = replaceOnce(source, marker, addition + marker, "wtf-packager runtime package");
  await write(path, source);
}

// Add only the permission required for local file download.
for (const path of [
  "apps/browser-extension/static/manifest.json",
  "apps/browser-extension/static/manifest.high-fidelity.json",
]) {
  const manifest = JSON.parse(await text(path));
  if (!manifest.permissions.includes("downloads")) manifest.permissions.push("downloads");
  await write(path, JSON.stringify(manifest, null, 2) + "\n");
}

// Chrome downloads typing.
{
  const path = "apps/browser-extension/src/chrome.d.ts";
  let source = await text(path);
  const marker = `  namespace scripting {`;
  const addition = `  namespace downloads {\n    interface DownloadOptions {\n      url: string;\n      filename?: string;\n      conflictAction?: "uniquify" | "overwrite" | "prompt";\n      saveAs?: boolean;\n    }\n\n    function download(options: DownloadOptions): Promise<number>;\n  }\n\n`;
  source = replaceOnce(source, marker, addition + marker, "chrome.downloads typing");
  await write(path, source);
}

// Shell protocol export request/response.
{
  const path = "apps/browser-extension/src/runtime/protocol.ts";
  let source = await text(path);
  source = `import type { WtfExportReceipt } from "./wtf-export-contract.js";\n` + source;
  source = replaceOnce(
    source,
    `  | { type: "W2F_CANCEL_JOB"; jobId: string };`,
    `  | { type: "W2F_CANCEL_JOB"; jobId: string }\n  | { type: "W2F_EXPORT_WTF"; jobId: string };`,
    "export request union",
  );
  source = replaceOnce(
    source,
    `export type W2fShellResponseData = W2fShellInfo | SourceCapability | CaptureJobState | null;`,
    `export type W2fShellResponseData =\n  | W2fShellInfo\n  | SourceCapability\n  | CaptureJobState\n  | WtfExportReceipt\n  | null;`,
    "export response union",
  );
  source = replaceOnce(
    source,
    `    case "W2F_CANCEL_JOB":\n      return typeof value.jobId === "string" && value.jobId.length > 0;`,
    `    case "W2F_CANCEL_JOB":\n    case "W2F_EXPORT_WTF":\n      return typeof value.jobId === "string" && value.jobId.length > 0;`,
    "export request validator",
  );
  await write(path, source);
}

// Service-worker materialization and cleanup.
{
  const path = "apps/browser-extension/src/runtime/service-worker.ts";
  let source = await text(path);
  source = replaceOnce(
    source,
    `import { resolveActiveTabSource } from "./source-runtime.js";`,
    `import { resolveActiveTabSource } from "./source-runtime.js";\nimport { persistWtfExport } from "./wtf-export-runtime.js";\nimport { deleteWtfPackage } from "./wtf-package-store.js";`,
    "service worker WTF imports",
  );
  source = replaceOnce(
    source,
    `    deleteCompositingAnalysis(jobId),\n  ]);`,
    `    deleteCompositingAnalysis(jobId),\n    deleteWtfPackage(jobId),\n  ]);`,
    "normal capture package cleanup",
  );
  source = replaceOnce(
    source,
    `    deleteResponsiveInference(jobId),\n    ...plans.map((plan) => deleteAllCaptureArtifacts(responsiveArtifactId(jobId, plan.id))),`,
    `    deleteResponsiveInference(jobId),\n    deleteWtfPackage(jobId),\n    ...plans.map((plan) => deleteAllCaptureArtifacts(responsiveArtifactId(jobId, plan.id))),`,
    "responsive package cleanup",
  );
  source = replaceOnce(
    source,
    `    case "W2F_CANCEL_JOB":\n      return shellSuccess(request.type, await cancelShellJob(request.jobId));`,
    `    case "W2F_CANCEL_JOB":\n      return shellSuccess(request.type, await cancelShellJob(request.jobId));\n    case "W2F_EXPORT_WTF": {\n      const current = await readJobState();\n      if (!current || current.jobId !== request.jobId) {\n        throw new Error("capture job is no longer available for export");\n      }\n      if (current.status !== "completed") {\n        throw new Error("only completed capture jobs can be exported");\n      }\n      return shellSuccess(request.type, await persistWtfExport(request.jobId));\n    }`,
    "service worker export handler",
  );
  await write(path, source);
}

// Popup download UI/runtime.
{
  const path = "apps/browser-extension/src/runtime/popup.ts";
  let source = await text(path);
  source = `import { isWtfExportReceipt } from "./wtf-export-contract.js";\nimport { readWtfPackage } from "./wtf-package-store.js";\n` + source;
  source = replaceOnce(
    source,
    `const cancelButton = element<HTMLButtonElement>("cancel-job");`,
    `const exportButton = element<HTMLButtonElement>("export-wtf");\nconst cancelButton = element<HTMLButtonElement>("cancel-job");`,
    "popup export button binding",
  );
  source = replaceOnce(
    source,
    `    cancelButton.disabled = true;\n    return;`,
    `    cancelButton.disabled = true;\n    exportButton.disabled = true;\n    delete exportButton.dataset.jobId;\n    return;`,
    "popup empty-state export",
  );
  source = replaceOnce(
    source,
    `  cancelButton.disabled = ["completed", "failed", "cancelled"].includes(job.status);\n  cancelButton.dataset.jobId = job.jobId;`,
    `  cancelButton.disabled = ["completed", "failed", "cancelled"].includes(job.status);\n  cancelButton.dataset.jobId = job.jobId;\n  exportButton.disabled = job.status !== "completed";\n  exportButton.dataset.jobId = job.jobId;`,
    "popup completed export state",
  );
  const listenerMarker = `fullPageButton.addEventListener("click", () => void startJob("full-page"));`;
  const downloadFunction = `async function downloadWtf(jobId: string): Promise<void> {\n  exportButton.disabled = true;\n  exportButton.textContent = "Packaging…";\n  try {\n    const response = await sendRequest({ type: "W2F_EXPORT_WTF", jobId });\n    if (!response.ok) throw new Error(response.error);\n    if (!isWtfExportReceipt(response.data)) throw new Error("Invalid WTF export receipt");\n    const stored = await readWtfPackage(jobId);\n    if (!stored || stored.sha256 !== response.data.archiveSha256) {\n      throw new Error("Stored WTF package does not match the export receipt");\n    }\n    const blobBytes = Uint8Array.from(stored.bytes);\n    const blob = new Blob([blobBytes.buffer], { type: stored.mimeType });\n    const url = URL.createObjectURL(blob);\n    try {\n      await chrome.downloads.download({\n        url,\n        filename: stored.filename,\n        conflictAction: "uniquify",\n        saveAs: false,\n      });\n      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);\n    } catch (error) {\n      URL.revokeObjectURL(url);\n      throw error;\n    }\n    detailsElement.textContent = \`${"${stored.filename} · ${stored.bytes.byteLength.toLocaleString()} bytes · SHA-256 ${stored.sha256.slice(0, 12)}…"}\`;\n  } catch (error) {\n    statusElement.textContent = "failed";\n    statusElement.dataset.status = "failed";\n    detailsElement.textContent = error instanceof Error ? error.message : String(error);\n  } finally {\n    exportButton.textContent = "Export .wtf";\n    const currentJobId = exportButton.dataset.jobId;\n    exportButton.disabled = !currentJobId;\n  }\n}\n\n`;
  source = replaceOnce(source, listenerMarker, downloadFunction + listenerMarker, "popup download function");
  source = replaceOnce(
    source,
    `cancelButton.addEventListener("click", () => {`,
    `exportButton.addEventListener("click", () => {\n  const jobId = exportButton.dataset.jobId;\n  if (jobId) void downloadWtf(jobId);\n});\ncancelButton.addEventListener("click", () => {`,
    "popup export click handler",
  );
  await write(path, source);
}

// Popup markup.
{
  const path = "apps/browser-extension/static/popup.html";
  let source = await text(path);
  source = replaceOnce(
    source,
    `      <div class="footer-actions">\n        <button id="cancel-job" class="text-button" type="button" disabled>Cancel</button>`,
    `      <div class="footer-actions">\n        <button id="export-wtf" class="primary" type="button" disabled>Export .wtf</button>\n        <button id="cancel-job" class="text-button" type="button" disabled>Cancel</button>`,
    "popup export markup",
  );
  await write(path, source);
}

// Permanent foundation gate and permission expectation.
{
  const path = "scripts/validate-foundation.mjs";
  let source = await text(path);
  source = replaceOnce(
    source,
    `import "./validate-node-20.mjs";`,
    `import "./validate-node-20.mjs";\nimport "./validate-node-21.mjs";`,
    "NODE-21 foundation import",
  );
  source = replaceOnce(
    source,
    `JSON.stringify(["activeTab", "scripting", "storage"].sort()),`,
    `JSON.stringify(["activeTab", "downloads", "scripting", "storage"].sort()),`,
    "least-privilege downloads permission",
  );
  source = source.replace(
    `"browser permissions must remain least-privilege activeTab+scripting+storage",`,
    `"browser permissions must remain least-privilege activeTab+downloads+scripting+storage",`,
  );
  await write(path, source);
}

// Keep NODE-21 validator aware of the isolated receipt contract.
{
  const path = "scripts/validate-node-21.mjs";
  let source = await text(path);
  source = replaceOnce(
    source,
    `  "apps/browser-extension/src/runtime/wtf-export-runtime.ts",`,
    `  "apps/browser-extension/src/runtime/wtf-export-runtime.ts",\n  "apps/browser-extension/src/runtime/wtf-export-contract.ts",`,
    "NODE-21 export contract required file",
  );
  source = source.replace(
    `assert(protocol.includes("WtfExportReceipt"), "Browser protocol must expose WtfExportReceipt response data");`,
    `assert(protocol.includes("WtfExportReceipt"), "Browser protocol must expose WtfExportReceipt response data");\n\n  const exportContract = readText("apps/browser-extension/src/runtime/wtf-export-contract.ts");\n  assert(exportContract.includes("isWtfExportReceipt"), "Browser export receipt contract must be runtime-validatable");`,
  );
  await write(path, source);
}

console.log("NODE-21 integration finalizer applied successfully.");
