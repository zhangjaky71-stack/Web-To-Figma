import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[${profile}] ${message}`);
}

for (const path of [
  "runtime/pixel-ground-truth-runtime.js",
  "runtime/pixel-ground-truth-store.js",
  "runtime/pixel-ground-truth/index.js",
  "runtime/pixel-ground-truth/types.js",
  "runtime/pixel-ground-truth/capture.js",
]) {
  await access(`${outputRoot}/${path}`);
}

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const evidence of [
  'from "./pixel-ground-truth-runtime.js"',
  'from "./pixel-ground-truth-store.js"',
  "persistPixelGroundTruth",
  "writePixelGroundTruth",
  "deletePixelGroundTruth",
  "ASSET_RASTER_FALLBACK_CODES",
  "readAssetCapture",
  "rasterTileReferenceCount",
  "rasterUniqueByteCount",
]) {
  assert(serviceWorker.includes(evidence), `service worker missing NODE-14 evidence ${evidence}`);
}

const runtime = await readFile(`${outputRoot}/runtime/pixel-ground-truth-runtime.js`, "utf8");
for (const evidence of [
  "capturePixelGroundTruthForSnapshot",
  "captureVisibleTab",
  "createImageBitmap",
  "OffscreenCanvas",
  "captureHighFidelityRasterTiles",
  "full-page:current",
  "viewport:current",
  "canvas-or-webgl-render-surface",
  "video-current-frame",
  "RASTER_UNSUPPORTED_SOURCE",
  "RASTER_TILE_MISSING",
  "SHA-256",
]) {
  assert(runtime.includes(evidence), `Pixel Ground Truth runtime missing ${evidence}`);
}
assert(
  runtime.includes('from "./pixel-ground-truth/index.js"'),
  "Pixel Ground Truth runtime must use packaged relative core modules",
);
for (const forbidden of ["document.cookie", "localStorage", "sessionStorage"]) {
  assert(!runtime.includes(forbidden), `Pixel Ground Truth runtime must not read ${forbidden}`);
}

const cdpRuntime = await readFile(`${outputRoot}/runtime/cdp-runtime.js`, "utf8");
for (const evidence of [
  "captureHighFidelityRasterTiles",
  "Page.captureScreenshot",
  "captureBeyondViewport",
  "clip",
  "scale: dpr",
]) {
  assert(cdpRuntime.includes(evidence), `CDP raster runtime missing ${evidence}`);
}

const store = await readFile(`${outputRoot}/runtime/pixel-ground-truth-store.js`, "utf8");
for (const evidence of [
  "indexedDB.open",
  "w2f-pixel-ground-truth",
  "pixel-ground-truth:",
  "writePixelGroundTruth",
  "readPixelGroundTruth",
  "deletePixelGroundTruth",
]) {
  assert(store.includes(evidence), `Pixel Ground Truth store missing ${evidence}`);
}

const core = await readFile(`${outputRoot}/runtime/pixel-ground-truth/capture.js`, "utf8");
assert(
  !core.includes("@w2f/"),
  "packaged Pixel Ground Truth core must not contain workspace imports",
);
for (const evidence of [
  "planRasterTiles",
  "buildPixelGroundTruth",
  "DEFAULT_RASTER_TILE_SIZE_PX",
  "RASTER_TILE_MISSING",
  "references/",
  "toWtfReferenceTileDescriptors",
  "isPixelGroundTruth",
]) {
  assert(core.includes(evidence), `packaged Pixel Ground Truth core missing ${evidence}`);
}

const types = await readFile(`${outputRoot}/runtime/pixel-ground-truth/types.js`, "utf8");
assert(
  types.includes('PIXEL_GROUND_TRUTH_VERSION = "1.0.0"') &&
    types.includes("DEFAULT_RASTER_TILE_SIZE_PX = 2048"),
  "Pixel Ground Truth version/tile-size contract drifted",
);

console.log(`NODE-14 Pixel Ground Truth package validation (${profile}): PASS`);
