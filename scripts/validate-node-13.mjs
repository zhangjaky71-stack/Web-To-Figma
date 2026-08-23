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
  "packages/asset-resolver/package.json",
  "packages/asset-resolver/tsconfig.json",
  "packages/asset-resolver/tsconfig.build.json",
  "packages/asset-resolver/src/types.ts",
  "packages/asset-resolver/src/discovery.ts",
  "packages/asset-resolver/src/acquisition.ts",
  "packages/asset-resolver/src/resolver.ts",
  "packages/asset-resolver/src/index.ts",
  "packages/asset-resolver/test/asset-resolver.test.ts",
  "packages/asset-resolver/test/discovery-acquisition.test.ts",
  "packages/standard-capture-adapter/src/asset-acquisition.ts",
  "apps/browser-extension/src/runtime/asset-runtime.ts",
  "apps/browser-extension/src/runtime/asset-store.ts",
  "apps/browser-extension/test/asset-runtime.test.ts",
  "apps/browser-extension/test/asset-store.test.ts",
  "apps/browser-extension/scripts/validate-node-13-package.mjs",
  "docs/ASSET_RESOLVER_V2.md",
  "docs/adr/ADR-0013-asset-resolution-sidecar.md",
  "docs/nodes/NODE-13_ASSET_RESOLVER.md",
]) {
  assert(existsSync(resolve(root, path)), `NODE-13 missing ${path}`);
}

if (failures.length === 0) {
  const packageJson = JSON.parse(read("packages/asset-resolver/package.json"));
  assert(packageJson.name === "@w2f/asset-resolver", "NODE-13 asset package name drifted");
  for (const dependency of [
    "@w2f/capture-core",
    "@w2f/css-cascade",
    "@w2f/source-providers",
    "@w2f/w2f-ir",
  ]) {
    assert(
      packageJson.dependencies?.[dependency] === "workspace:*",
      `NODE-13 asset resolver must declare ${dependency}`,
    );
  }

  const types = read("packages/asset-resolver/src/types.ts");
  for (const evidence of [
    'ASSET_CAPTURE_VERSION = "1.0.0"',
    "AssetResourceProvenance",
    "AssetDomEvidence",
    "AssetResourceCandidate",
    "AssetAcquiredResource",
    "ResolvedAssetResource",
    "AssetCapture",
    "ASSET_FETCH_FAILED",
    "ASSET_TOTAL_BUDGET_EXCEEDED",
    "ASSET_UNSUPPORTED_MEDIA_TYPE",
    '"img"',
    '"picture"',
    '"css-background"',
    '"svg-inline"',
    '"svg-external"',
    '"data-url"',
    '"blob"',
  ]) {
    assert(types.includes(evidence), `NODE-13 asset contract missing ${evidence}`);
  }

  const discovery = read("packages/asset-resolver/src/discovery.ts");
  for (const evidence of [
    "discoverAssetCandidates",
    "extractCssUrls",
    "currentSrc",
    "authoredSrc",
    "resolveUrlReference",
    "background-image",
    "stylesheetRef",
    "svg-inline",
  ]) {
    assert(discovery.includes(evidence), `NODE-13 discovery missing ${evidence}`);
  }

  const genericAcquisition = read("packages/asset-resolver/src/acquisition.ts");
  for (const evidence of [
    "acquireAssetCandidates",
    "decodeDataUrl",
    "AssetBinaryFetcher",
    "ASSET_COUNT_BUDGET_EXCEEDED",
    "ASSET_TOTAL_BUDGET_EXCEEDED",
    "fetchCache",
  ]) {
    assert(genericAcquisition.includes(evidence), `NODE-13 generic acquisition missing ${evidence}`);
  }

  const resolver = read("packages/asset-resolver/src/resolver.ts");
  for (const evidence of [
    "sniffAssetMediaType",
    "extensionForMediaType",
    "buildAssetCapture",
    "summarizeAssetCapture",
    "toWtfAssetRecords",
    "isAssetCapture",
    "asset:${sha256}",
    "embeddedPath",
    "mergeProvenances",
    "deduplicatedReferenceCount",
  ]) {
    assert(resolver.includes(evidence), `NODE-13 resolver missing ${evidence}`);
  }
  for (const forbidden of ["document.", "window.", "fetch(", "indexedDB", "crypto.subtle"]) {
    assert(
      !resolver.includes(forbidden),
      `NODE-13 resolver normalization core must remain platform-neutral; found ${forbidden}`,
    );
  }

  const acquisition = read("packages/standard-capture-adapter/src/asset-acquisition.ts");
  for (const evidence of [
    "currentSrc",
    "naturalWidth",
    "naturalHeight",
    "background-image",
    "mask-image",
    "border-image-source",
    "content",
    "XMLSerializer",
    "svg-inline",
    "svg-external",
    "data-url",
    "blob",
    "fetch(url",
    "maxAssetBytes",
    "maxTotalBytes",
    "ASSET_TOTAL_BUDGET_EXCEEDED",
    "ASSET_COUNT_BUDGET_EXCEEDED",
  ]) {
    assert(acquisition.includes(evidence), `NODE-13 Standard acquisition missing ${evidence}`);
  }
  for (const forbidden of [
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "instanceof HTMLImageElement",
    "instanceof SVGSVGElement",
  ]) {
    assert(
      !acquisition.includes(forbidden),
      `NODE-13 Standard acquisition violates privacy/frame-realm boundary: ${forbidden}`,
    );
  }

  const runtime = read("apps/browser-extension/src/runtime/asset-runtime.ts");
  for (const evidence of [
    "buildStandardAssetInput",
    "captureStandardAssetsInPage",
    "captureAssetsForSnapshot",
    "crypto.subtle.digest",
    '"SHA-256"',
    "buildAssetCapture",
  ]) {
    assert(runtime.includes(evidence), `NODE-13 Browser asset runtime missing ${evidence}`);
  }

  const store = read("apps/browser-extension/src/runtime/asset-store.ts");
  for (const evidence of [
    'W2F_ASSET_DB_NAME = "w2f-assets"',
    'W2F_ASSET_KEY_PREFIX = "assets:"',
    "writeAssetCapture",
    "readAssetCapture",
    "deleteAssetCapture",
  ]) {
    assert(store.includes(evidence), `NODE-13 Browser asset store missing ${evidence}`);
  }

  const worker = read("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "persistAssets",
    "captureAssetsForSnapshot",
    "writeAssetCapture",
    "deleteAssetCapture",
    "assetReferenceCount",
    "assetDeduplicatedReferenceCount",
    "assetUniqueByteCount",
  ]) {
    assert(worker.includes(evidence), `NODE-13 service worker missing ${evidence}`);
  }

  const jobState = read("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "assetStorageKey",
    "assetAdapter",
    "assetCount",
    "assetReferenceCount",
    "assetDeduplicatedReferenceCount",
    "assetUniqueByteCount",
    "assetDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `NODE-13 job receipt missing ${evidence}`);
  }

  const packaging = read("apps/browser-extension/scripts/package-extension.mjs");
  assert(
    packaging.includes('specifier: "@w2f/asset-resolver"') &&
      packaging.includes('directory: "asset-resolver"'),
    "NODE-13 Browser packaging must include asset-resolver runtime modules",
  );

  const browserPackage = JSON.parse(read("apps/browser-extension/package.json"));
  assert(
    browserPackage.dependencies?.["@w2f/asset-resolver"] === "workspace:*",
    "Browser Extension must consume @w2f/asset-resolver",
  );
  const standardPackage = JSON.parse(read("packages/standard-capture-adapter/package.json"));
  assert(
    standardPackage.dependencies?.["@w2f/asset-resolver"] === "workspace:*",
    "Standard adapter must consume @w2f/asset-resolver",
  );

  const ir = read("packages/w2f-ir/src/types.ts");
  for (const evidence of [
    "WtfAssetRecord",
    "WtfAssetProvenance",
    "WtfAssetsPayload",
    "currentSrc",
    "authoredSrc",
    "intrinsicWidth",
    "intrinsicHeight",
  ]) {
    assert(ir.includes(evidence), `NODE-13 requires existing IR asset contract ${evidence}`);
  }

  const raw = read("packages/capture-core/src/types.ts");
  assert(
    raw.includes('RAW_SNAPSHOT_VERSION = "1.0.0"'),
    "NODE-13 must not version-bump RawSnapshot",
  );

  const normative = read("docs/ASSET_RESOLVER_V2.md");
  for (const evidence of [
    "AssetCapture 1.0.0",
    "currentSrc",
    "SHA-256",
    "data:",
    "blob:",
    "Resource Provenance",
    "CORS/origin",
    "NODE-14",
    "NODE-21",
  ]) {
    assert(normative.includes(evidence), `NODE-13 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error("NODE-13 foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NODE-13 foundation validation passed.");
