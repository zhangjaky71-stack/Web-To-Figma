import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[${profile}] ${message}`);
}

for (const path of [
  "runtime/asset-runtime.js",
  "runtime/asset-store.js",
  "runtime/asset-resolver/index.js",
  "runtime/asset-resolver/types.js",
  "runtime/asset-resolver/resolver.js",
  "runtime/standard-capture-adapter/asset-acquisition.js",
]) {
  await access(`${outputRoot}/${path}`);
}

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const evidence of [
  'from "./asset-runtime.js"',
  'from "./asset-store.js"',
  "persistAssets",
  "writeAssetCapture",
  "deleteAssetCapture",
  "assetDeduplicatedReferenceCount",
]) {
  assert(serviceWorker.includes(evidence), `service worker missing NODE-13 evidence ${evidence}`);
}

const runtime = await readFile(`${outputRoot}/runtime/asset-runtime.js`, "utf8");
for (const evidence of [
  "captureAssetsForSnapshot",
  "captureStandardAssetsInPage",
  "SHA-256",
  "buildAssetCapture",
]) {
  assert(runtime.includes(evidence), `asset runtime missing ${evidence}`);
}
assert(
  runtime.includes('from "./asset-resolver/index.js"'),
  "asset runtime must use packaged relative asset-resolver modules",
);

const store = await readFile(`${outputRoot}/runtime/asset-store.js`, "utf8");
assert(
  store.includes("indexedDB.open") && store.includes("w2f-assets") && store.includes("assets:"),
  "asset sidecar IndexedDB contract drifted",
);

const resolver = await readFile(`${outputRoot}/runtime/asset-resolver/resolver.js`, "utf8");
assert(!resolver.includes("@w2f/"), "packaged asset resolver must not contain workspace imports");
for (const evidence of [
  "sniffAssetMediaType",
  "buildAssetCapture",
  "asset:",
  "sha256",
  "deduplicatedReferenceCount",
]) {
  assert(resolver.includes(evidence), `packaged asset resolver missing ${evidence}`);
}
for (const forbidden of ["document.", "window.", "fetch(", "indexedDB"] ) {
  assert(!resolver.includes(forbidden), `asset resolver core must remain platform-neutral: ${forbidden}`);
}

const acquisition = await readFile(
  `${outputRoot}/runtime/standard-capture-adapter/asset-acquisition.js`,
  "utf8",
);
for (const evidence of [
  "currentSrc",
  "background-image",
  "mask-image",
  "border-image-source",
  "svg-inline",
  "svg-external",
  "data-url",
  "blob",
  "TextEncoder",
  "fetch(",
  "ASSET_TOTAL_BUDGET_EXCEEDED",
]) {
  assert(acquisition.includes(evidence), `Standard asset acquisition missing ${evidence}`);
}
for (const forbidden of ["document.cookie", "localStorage", "sessionStorage"]) {
  assert(!acquisition.includes(forbidden), `Standard asset acquisition must not read ${forbidden}`);
}

console.log(`NODE-13 Browser asset package validation (${profile}): PASS`);
