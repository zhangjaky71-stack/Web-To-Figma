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
  "runtime/compositing-runtime.js",
  "runtime/compositing-store.js",
  "runtime/compositing-engine/index.js",
  "runtime/compositing-engine/engine.js",
  "runtime/compositing-engine/types.js",
  "runtime/compositing-engine/validation.js",
  "runtime/service-worker.js",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const engine = text("runtime/compositing-engine/engine.js");
for (const evidence of [
  "analyzeCompositing",
  "mix-blend-mode",
  "backdrop-filter",
  "opacity-group",
  "isolation",
  "fallback-boundary",
  "COMPOSITING_FALLBACK_PROMOTED",
]) {
  assert(engine.includes(evidence), `packaged compositing engine missing ${evidence}`);
}
for (const forbidden of ["window.", "document.", "chrome.", "indexedDB", "fetch(", "Math.random", "Date.now"] ) {
  assert(!engine.includes(forbidden), `compositing core must not use ${forbidden}`);
}

const runtime = text("runtime/compositing-runtime.js");
assert(runtime.includes("readRenderTreeOptimization"), "compositing runtime must consume persisted Render Tree");
assert(runtime.includes("analyzePersistedCompositing"), "compositing runtime entrypoint missing");

const store = text("runtime/compositing-store.js");
for (const evidence of ["w2f-compositing", "compositing:", "writeCompositingAnalysis", "readCompositingAnalysis", "deleteCompositingAnalysis"]) {
  assert(store.includes(evidence), `packaged compositing store missing ${evidence}`);
}

const worker = text("runtime/service-worker.js");
for (const evidence of [
  "persistCompositingAnalysis",
  "writeCompositingAnalysis",
  "deleteCompositingAnalysis",
  "fallbackBoundaryCount",
  "promotedFallbackBoundaryCount",
  "readCompositingAnalysis",
  "compositing-boundary:",
]) {
  assert(worker.includes(evidence), `packaged service worker missing ${evidence}`);
}

if (failures.length > 0) {
  console.error(`NODE-20 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`NODE-20 package validation passed (${profile}).`);
}
