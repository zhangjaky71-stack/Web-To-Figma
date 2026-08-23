import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = resolve(appRoot, profile === "high-fidelity" ? "dist-high-fidelity" : "dist");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(relativePath) {
  const path = resolve(outputRoot, relativePath);
  assert(existsSync(path), `missing packaged ${relativePath}`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

for (const path of [
  "runtime/render-tree-runtime.js",
  "runtime/render-tree-store.js",
  "runtime/render-tree-optimizer/index.js",
  "runtime/render-tree-optimizer/optimizer.js",
  "runtime/render-tree-optimizer/types.js",
  "runtime/render-tree-optimizer/validation.js",
  "runtime/service-worker.js",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const runtime = text("runtime/render-tree-runtime.js");
for (const evidence of [
  "optimizeCapturedRenderTree",
  "optimizePersistedRenderTree",
  "readRawSnapshot",
  "readCssCascadeCapture",
  "readBaseLayoutAnalysis",
  "readTableLayoutResult",
  "./render-tree-optimizer/index.js",
]) {
  assert(runtime.includes(evidence), `packaged render-tree runtime missing ${evidence}`);
}

const store = text("runtime/render-tree-store.js");
for (const evidence of [
  "w2f-render-tree",
  "render-tree:",
  "writeRenderTreeOptimization",
  "readRenderTreeOptimization",
  "deleteRenderTreeOptimization",
]) {
  assert(store.includes(evidence), `packaged render-tree store missing ${evidence}`);
}

const optimizer = text("runtime/render-tree-optimizer/optimizer.js");
for (const evidence of [
  "optimizeRenderTree",
  "RENDER_TREE_WRAPPER_PRESERVED",
  "componentCandidate",
  "sourceToRenderNodeId",
  "composedParentId",
  "w2f-render-structural-v1",
]) {
  assert(optimizer.includes(evidence), `packaged render-tree optimizer missing ${evidence}`);
}
for (const forbidden of [
  "window.",
  "document.",
  "chrome.",
  "indexedDB",
  "fetch(",
  "localStorage",
  "sessionStorage",
  "document.cookie",
]) {
  assert(!optimizer.includes(forbidden), `render-tree core must not use ${forbidden}`);
}

const serviceWorker = text("runtime/service-worker.js");
for (const evidence of [
  "persistRenderTreeOptimization",
  "writeRenderTreeOptimization",
  "deleteRenderTreeOptimization",
  "renderTreeStorageKey",
  "renderNodeCount",
  "foldedSourceNodeCount",
]) {
  assert(serviceWorker.includes(evidence), `packaged service worker missing render-tree integration ${evidence}`);
}

if (failures.length > 0) {
  console.error(
    `NODE-19 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`NODE-19 package validation passed (${profile}).`);
}
