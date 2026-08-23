import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of [
  "packages/pixel-ground-truth/package.json",
  "packages/pixel-ground-truth/tsconfig.json",
  "packages/pixel-ground-truth/tsconfig.build.json",
  "packages/pixel-ground-truth/src/types.ts",
  "packages/pixel-ground-truth/src/capture.ts",
  "packages/pixel-ground-truth/src/index.ts",
  "packages/pixel-ground-truth/test/pixel-ground-truth.test.ts",
  "apps/browser-extension/src/runtime/pixel-ground-truth-runtime.ts",
  "apps/browser-extension/src/runtime/pixel-ground-truth-store.ts",
  "apps/browser-extension/test/pixel-ground-truth-runtime.test.ts",
  "apps/browser-extension/test/pixel-ground-truth-store.test.ts",
  "apps/browser-extension/scripts/validate-node-14-package.mjs",
  "docs/PIXEL_GROUND_TRUTH_RASTER_V2.md",
  "docs/adr/ADR-0014-pixel-ground-truth-raster-tiles.md",
  "docs/nodes/NODE-14_PIXEL_GROUND_TRUTH_RASTER_ENGINE.md",
]) {
  assert(existsSync(resolve(root, path)), `NODE-14 missing ${path}`);
}

if (failures.length === 0) {
  const packageJson = JSON.parse(read("packages/pixel-ground-truth/package.json"));
  assert(
    packageJson.name === "@w2f/pixel-ground-truth",
    "NODE-14 Pixel Ground Truth package name drifted",
  );
  assert(
    packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "NODE-14 core must reuse the frozen W2F schema",
  );

  const types = read("packages/pixel-ground-truth/src/types.ts");
  for (const evidence of [
    'PIXEL_GROUND_TRUTH_VERSION = "1.0.0"',
    "DEFAULT_RASTER_TILE_SIZE_PX = 2048",
    "RasterTilePlan",
    "RasterReferenceInput",
    "RasterReferenceEvidence",
    "RasterTileResource",
    '"viewport"',
    '"full-page"',
    '"node-fallback"',
    '"canvas"',
    '"webgl"',
    '"video-frame"',
    '"RASTER_TILE_MISSING"',
    '"RASTER_UNSUPPORTED_SOURCE"',
  ]) {
    assert(types.includes(evidence), `NODE-14 contract missing ${evidence}`);
  }

  const core = read("packages/pixel-ground-truth/src/capture.ts");
  for (const evidence of [
    "planRasterTiles",
    "buildPixelGroundTruth",
    "summarizePixelGroundTruth",
    "toWtfReferenceTileDescriptors",
    "isPixelGroundTruth",
    "references/${sha256}.png",
    "RASTER_TILE_MISSING",
    "accepted.has(plan.id)",
  ]) {
    assert(core.includes(evidence), `NODE-14 core missing ${evidence}`);
  }
  for (const forbidden of [
    "chrome.",
    "document.",
    "window.",
    "indexedDB",
    "OffscreenCanvas",
    "createImageBitmap",
    "crypto.subtle",
  ]) {
    assert(
      !core.includes(forbidden),
      `NODE-14 core must remain platform-neutral; found ${forbidden}`,
    );
  }

  const runtime = read("apps/browser-extension/src/runtime/pixel-ground-truth-runtime.ts");
  for (const evidence of [
    "capturePixelGroundTruthForSnapshot",
    "chrome.tabs.captureVisibleTab",
    "createImageBitmap",
    "OffscreenCanvas",
    "captureHighFidelityRasterTiles",
    '"viewport:current"',
    '"full-page:current"',
    '"canvas-or-webgl-render-surface"',
    '"video-current-frame"',
    '"RASTER_UNSUPPORTED_SOURCE"',
    '"RASTER_TILE_MISSING"',
    "requireCompleteReference",
    "crypto.subtle.digest",
  ]) {
    assert(runtime.includes(evidence), `NODE-14 Browser runtime missing ${evidence}`);
  }
  for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", ".getContext("]) {
    assert(
      !runtime.includes(forbidden),
      `NODE-14 Browser runtime violates privacy/non-mutating boundary: ${forbidden}`,
    );
  }

  const cdpRuntime = read("apps/browser-extension/src/runtime/cdp-runtime.ts");
  for (const evidence of [
    "captureHighFidelityRasterTiles",
    '"Page.captureScreenshot"',
    "captureBeyondViewport: true",
    "scale: dpr",
    "api.detach",
  ]) {
    assert(cdpRuntime.includes(evidence), `NODE-14 CDP runtime missing ${evidence}`);
  }

  const store = read("apps/browser-extension/src/runtime/pixel-ground-truth-store.ts");
  for (const evidence of [
    'W2F_PIXEL_DB_NAME = "w2f-pixel-ground-truth"',
    'W2F_PIXEL_KEY_PREFIX = "pixel-ground-truth:"',
    "writePixelGroundTruth",
    "readPixelGroundTruth",
    "deletePixelGroundTruth",
  ]) {
    assert(store.includes(evidence), `NODE-14 Pixel Ground Truth store missing ${evidence}`);
  }

  const worker = read("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistPixelGroundTruth",
    "capturePixelGroundTruthForSnapshot",
    "writePixelGroundTruth",
    "deletePixelGroundTruth",
    "readAssetCapture",
    "ASSET_RASTER_FALLBACK_CODES",
    "pixelGroundTruthStorageKey",
    "rasterTileReferenceCount",
    "rasterUniqueByteCount",
  ]) {
    assert(worker.includes(evidence), `NODE-14 service worker missing ${evidence}`);
  }

  const jobState = read("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "pixelGroundTruthStorageKey",
    "pixelGroundTruthAdapter",
    "rasterReferenceCount",
    "rasterTileReferenceCount",
    "rasterUniqueTileCount",
    "rasterUniqueByteCount",
    "rasterDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `NODE-14 job receipt missing ${evidence}`);
  }

  const packaging = read("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packaging.includes('specifier: "@w2f/pixel-ground-truth"') &&
      packaging.includes('directory: "pixel-ground-truth"'),
    "NODE-14 Browser packaging must include Pixel Ground Truth modules",
  );

  const browserPackage = JSON.parse(read("apps/browser-extension/package.json"));
  assert(
    browserPackage.dependencies?.["@w2f/pixel-ground-truth"] === "workspace:*",
    "Browser Extension must consume @w2f/pixel-ground-truth",
  );
  for (const scriptName of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      String(browserPackage.scripts?.[scriptName] ?? "").includes("validate-node-14-package.mjs"),
      `Browser ${scriptName} must enforce NODE-14 package validation`,
    );
  }

  const schema = read("packages/w2f-schema/src/index.ts");
  for (const evidence of [
    '"pixel-ground-truth"',
    '"raster-tiles"',
    "WtfReferenceTileDescriptor",
    '"reference-tiles-index"',
    '"reference-tile"',
    "referenceTiles?: string",
  ]) {
    assert(schema.includes(evidence), `NODE-14 requires frozen schema evidence ${evidence}`);
  }

  const raw = read("packages/capture-core/src/types.ts");
  assert(
    raw.includes('RAW_SNAPSHOT_VERSION = "1.0.0"'),
    "NODE-14 must not version-bump RawSnapshot",
  );

  const normative = read("docs/PIXEL_GROUND_TRUTH_RASTER_V2.md");
  for (const evidence of [
    "PixelGroundTruth 1.0.0",
    "2048 × 2048 device pixels",
    "viewport:current",
    "full-page:current",
    "RASTER_TILE_MISSING",
    "captureVisibleTab",
    "Page.captureScreenshot",
    "canvas-or-webgl-render-surface",
    "video-current-frame",
    "NODE-20",
    "NODE-21",
    "NODE-28",
  ]) {
    assert(normative.includes(evidence), `NODE-14 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error("NODE-14 foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NODE-14 foundation validation passed.");
