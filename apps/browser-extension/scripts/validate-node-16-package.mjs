import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[${profile}] ${message}`);
}

for (const path of [
  "runtime/responsive-inference-runtime.js",
  "runtime/responsive-inference-store.js",
  "runtime/responsive-inference/index.js",
  "runtime/responsive-inference/inference.js",
  "runtime/responsive-inference/types.js",
]) {
  await access(`${outputRoot}/${path}`);
}

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const evidence of [
  'from "./responsive-inference/index.js"',
  'from "./responsive-inference-runtime.js"',
  'from "./responsive-inference-store.js"',
  "loadResponsiveInferenceEvidence",
  "inferResponsiveCaptureEvidence",
  "writeResponsiveInference",
  "deleteResponsiveInference",
  "responsiveRuleCount",
  "breakpointCandidateCount",
  "responsiveSizingDecisionCount",
  "responsiveInferenceDiagnosticCount",
]) {
  assert(serviceWorker.includes(evidence), `service worker missing NODE-16 evidence ${evidence}`);
}

const runtime = await readFile(`${outputRoot}/runtime/responsive-inference-runtime.js`, "utf8");
for (const evidence of [
  "buildResponsiveInferenceInput",
  "inferResponsiveCaptureEvidence",
  "loadResponsiveInferenceEvidence",
  "present: false",
  "stableNodeId",
  "activeInSnapshotIds",
  "containerQueries",
  "readRawSnapshot",
  "readCssCascadeCapture",
  "readEnvironmentCapture",
]) {
  assert(runtime.includes(evidence), `Responsive Inference runtime missing ${evidence}`);
}
assert(
  runtime.includes('from "./responsive-inference/index.js"'),
  "Responsive Inference runtime must use packaged relative core modules",
);
for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "window.resizeTo"]) {
  assert(!runtime.includes(forbidden), `Responsive Inference runtime must not use ${forbidden}`);
}

const store = await readFile(`${outputRoot}/runtime/responsive-inference-store.js`, "utf8");
for (const evidence of [
  "indexedDB.open",
  "w2f-responsive-inference",
  "responsive-inference:",
  "writeResponsiveInference",
  "readResponsiveInference",
  "deleteResponsiveInference",
]) {
  assert(store.includes(evidence), `Responsive Inference store missing ${evidence}`);
}

const core = await readFile(`${outputRoot}/runtime/responsive-inference/inference.js`, "utf8");
assert(!core.includes("@w2f/"), "packaged Responsive Inference core must be self-contained");
for (const evidence of [
  "inferResponsiveBehavior",
  "observed-transition",
  "authored-media",
  "RESPONSIVE_INFERENCE_SIZING_CONFLICT",
  "sizing.",
  "visibility",
  "fill",
  "fixed",
  "hug",
  "unknown",
  "sourceRefs",
]) {
  assert(core.includes(evidence), `packaged Responsive Inference core missing ${evidence}`);
}

const types = await readFile(`${outputRoot}/runtime/responsive-inference/types.js`, "utf8");
assert(
  types.includes('RESPONSIVE_INFERENCE_VERSION = "1.0.0"'),
  "Responsive Inference version contract drifted",
);

const jobState = await readFile(`${outputRoot}/runtime/job-state.js`, "utf8");
for (const evidence of [
  "inferenceStorageKey",
  "responsiveRuleCount",
  "breakpointCandidateCount",
  "responsiveSizingDecisionCount",
  "responsiveInferenceDiagnosticCount",
]) {
  assert(jobState.includes(evidence), `responsive receipt missing ${evidence}`);
}

console.log(`NODE-16 Responsive Inference package validation (${profile}): PASS`);
