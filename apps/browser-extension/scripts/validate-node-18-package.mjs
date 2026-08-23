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
  "runtime/table-layout-runtime.js",
  "runtime/table-layout-store.js",
  "runtime/table-layout-engine/index.js",
  "runtime/table-layout-engine/analyzer.js",
  "runtime/table-layout-engine/types.js",
  "runtime/table-layout-engine/validation.js",
  "runtime/service-worker.js",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const runtime = text("runtime/table-layout-runtime.js");
for (const evidence of [
  "analyzeSnapshotTables",
  "analyzePersistedTables",
  "readRawSnapshot",
  "readCssCascadeCapture",
  "./table-layout-engine/index.js",
]) {
  assert(runtime.includes(evidence), `packaged table runtime missing ${evidence}`);
}

const store = text("runtime/table-layout-store.js");
for (const evidence of [
  "w2f-table-layout",
  "table-layout:",
  "writeTableLayoutResult",
  "readTableLayoutResult",
  "deleteTableLayoutResult",
]) {
  assert(store.includes(evidence), `packaged table store missing ${evidence}`);
}

const analyzer = text("runtime/table-layout-engine/analyzer.js");
for (const evidence of [
  "analyzeTableLayout",
  "TABLE_SPAN_INVALID",
  "TABLE_SPAN_CONFLICT",
  "border-collapse",
  "border-spacing",
  "table-layout",
  "span-hybrid",
  "absolute-semantic",
]) {
  assert(analyzer.includes(evidence), `packaged table analyzer missing ${evidence}`);
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
  assert(!analyzer.includes(forbidden), `table layout core must not use ${forbidden}`);
}

const serviceWorker = text("runtime/service-worker.js");
for (const evidence of [
  "persistTableLayout",
  "writeTableLayoutResult",
  "deleteTableLayoutResult",
  "tableLayoutStorageKey",
  "tableCount",
  "tableCellCount",
]) {
  assert(
    serviceWorker.includes(evidence),
    `packaged service worker missing table integration ${evidence}`,
  );
}

if (failures.length > 0) {
  console.error(
    `NODE-18 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`NODE-18 package validation passed (${profile}).`);
}
