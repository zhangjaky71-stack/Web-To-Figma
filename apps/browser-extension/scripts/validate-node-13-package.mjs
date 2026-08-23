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
  "runtime/asset-resolver/discovery.js",
  "runtime/asset-resolver/acquisition.js",
  "runtime/asset-resolver/resolver.js",
  "runtime/standard-capture-adapter/asset-acquisition.js",
]) {
  await access(`${outputRoot}/${path}`);
}

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const evidence of [
  'from "./asset-resolver/index.js"',
  'from "./asset-runtime.js"',
  'from "./asset-store.js"',
  "persistAssets",
  "writeAssetCapture",
  "deleteAssetCapture",
  "assetReferenceCount",
  "assetDeduplicatedReferenceCount",
  "assetUniqueByteCount",
]) {
  assert(serviceWorker.includes(evidence), `service worker missing NODE-13 evidence ${evidence}`);
}

const runtime = await readFile(`${outputRoot}/runtime/asset-runtime.js`, "utf8");
for (const evidence of [
  "captureAssetsForSnapshot",
  "captureStandardAssetsInPage",
  "fetchHighFidelityResourceContents",
  "ASSET_FETCH_FAILED",
  "SHA-256",
  "buildAssetCapture",
]) {
  assert(runtime.includes(evidence), `asset runtime missing ${evidence}`);
}
assert(
  runtime.includes('from "./asset-resolver/index.js"'),
  "asset runtime must use packaged relative asset-resolver modules",
);
assert(
  runtime.includes('from "./cdp-runtime.js"'),
  "asset runtime must use the packaged High Fidelity alternate-provider boundary",
);

const cdpRuntime = await readFile(`${outputRoot}/runtime/cdp-runtime.js`, "utf8");
for (const evidence of [
  "fetchHighFidelityResourceContents",
  "Page.getResourceTree",
  "Page.getResourceContent",
  "api.attach",
  "api.detach",
]) {
  assert(cdpRuntime.includes(evidence), `CDP alternate asset provider missing ${evidence}`);
}

const store = await readFile(`${outputRoot}/runtime/asset-store.js`, "utf8");
assert(
  store.includes("indexedDB.open") && store.includes("w2f-assets") && store.includes("assets:"),
  "asset sidecar IndexedDB contract drifted",
);

const assetModules = ["resolver.js", "discovery.js", "acquisition.js"];
for (const moduleName of assetModules) {
  const source = await readFile(`${outputRoot}/runtime/asset-resolver/${moduleName}`, "utf8");
  assert(
    !source.includes("@w2f/"),
    `packaged asset-resolver/${moduleName} must not contain workspace imports`,
  );
}

const resolver = await readFile(`${outputRoot}/runtime/asset-resolver/resolver.js`, "utf8");
for (const evidence of [
  "sniffAssetMediaType",
  "buildAssetCapture",
  "asset:",
  "sha256",
  "embeddedPath",
  "deduplicatedReferenceCount",
]) {
  assert(resolver.includes(evidence), `packaged asset resolver missing ${evidence}`);
}
for (const forbidden of ["document.", "window.", "fetch(", "indexedDB"]) {
  assert(
    !resolver.includes(forbidden),
    `asset resolver core must remain platform-neutral: ${forbidden}`,
  );
}

const discovery = await readFile(`${outputRoot}/runtime/asset-resolver/discovery.js`, "utf8");
for (const evidence of [
  "extractCssUrls",
  "discoverAssetCandidates",
  "currentSrc",
  "svg-inline",
  "css-background",
]) {
  assert(discovery.includes(evidence), `packaged portable asset discovery missing ${evidence}`);
}

const acquisitionCore = await readFile(
  `${outputRoot}/runtime/asset-resolver/acquisition.js`,
  "utf8",
);
for (const evidence of ["decodeDataUrl", "acquireAssetCandidates", "SHA-256", "maxTotalBytes"]) {
  assert(acquisitionCore.includes(evidence), `packaged asset acquisition core missing ${evidence}`);
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
