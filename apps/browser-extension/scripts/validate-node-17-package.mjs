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
  "runtime/layout-analysis-runtime.js",
  "runtime/layout-analysis-store.js",
  "runtime/layout-analyzer/index.js",
  "runtime/layout-analyzer/analyzer.js",
  "runtime/layout-analyzer/types.js",
  "runtime/service-worker.js",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const runtime = text("runtime/layout-analysis-runtime.js");
for (const evidence of [
  "buildBaseLayoutObservations",
  "analyzeSnapshotBaseLayout",
  "analyzePersistedBaseLayout",
  "readRawSnapshot",
  "readCssCascadeCapture",
  "./layout-analyzer/index.js",
]) {
  assert(runtime.includes(evidence), `packaged layout runtime missing ${evidence}`);
}

const store = text("runtime/layout-analysis-store.js");
for (const evidence of [
  "w2f-layout-analysis",
  "layout-analysis:",
  "writeBaseLayoutAnalysis",
  "readBaseLayoutAnalysis",
  "deleteBaseLayoutAnalysis",
]) {
  assert(store.includes(evidence), `packaged layout store missing ${evidence}`);
}

const analyzer = text("runtime/layout-analyzer/analyzer.js");
for (const evidence of [
  "analyzeBaseLayout",
  "parseLayoutCssLength",
  "LAYOUT_TABLE_DEFERRED",
  "LAYOUT_SIZING_CONFLICT",
  'mode: "unknown"',
  'mode: "fill"',
  'mode: "fixed"',
  "absoluteConstraints",
  "gridContainer",
  "flexContainer",
]) {
  assert(analyzer.includes(evidence), `packaged layout analyzer missing ${evidence}`);
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
  assert(!analyzer.includes(forbidden), `layout analyzer core must not use ${forbidden}`);
}

const types = text("runtime/layout-analyzer/types.js");
assert(types.includes('BASE_LAYOUT_ANALYSIS_VERSION = "1.0.0"'), "packaged layout version drifted");

const serviceWorker = text("runtime/service-worker.js");
for (const evidence of [
  "persistBaseLayoutAnalysis",
  "writeBaseLayoutAnalysis",
  "deleteBaseLayoutAnalysis",
  "layoutAnalysisStorageKey",
  "layoutNodeCount",
]) {
  assert(serviceWorker.includes(evidence), `packaged service worker missing layout integration ${evidence}`);
}

if (failures.length > 0) {
  console.error(`NODE-17 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`NODE-17 package validation passed (${profile}).`);
}
