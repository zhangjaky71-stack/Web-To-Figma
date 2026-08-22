import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const requiredFiles = [
  "packages/cdp-capture-adapter/package.json",
  "packages/cdp-capture-adapter/tsconfig.json",
  "packages/cdp-capture-adapter/tsconfig.build.json",
  "packages/cdp-capture-adapter/src/index.ts",
  "packages/cdp-capture-adapter/src/types.ts",
  "packages/cdp-capture-adapter/src/normalize.ts",
  "packages/cdp-capture-adapter/test/normalize.test.ts",
  "apps/browser-extension/static/manifest.high-fidelity.json",
  "apps/browser-extension/src/runtime/cdp-runtime.ts",
  "apps/browser-extension/src/runtime/service-worker.ts",
  "apps/browser-extension/src/runtime/snapshot-store.ts",
  "apps/browser-extension/scripts/package-extension.mjs",
  "apps/browser-extension/scripts/validate-extension-package.mjs",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-09 missing ${file}`);
}

if (failures.length === 0) {
  const adapterPackage = readJson("packages/cdp-capture-adapter/package.json");
  assert(
    adapterPackage.dependencies?.["@w2f/capture-core"] === "workspace:*",
    "CDP adapter must normalize into shared capture-core RawSnapshot",
  );

  const adapterTypes = readText("packages/cdp-capture-adapter/src/types.ts");
  assert(
    adapterTypes.includes('CDP_CAPTURE_ADAPTER_VERSION = "1.0.0"'),
    "CDP adapter contract version drifted",
  );
  for (const evidence of [
    "CdpDomSnapshotResponse",
    "CdpLayoutMetricsResponse",
    "CdpFrameTreeResponse",
    "CdpScreenshotResponse",
    "devicePixelRatio",
  ]) {
    assert(adapterTypes.includes(evidence), `CDP evidence contract missing ${evidence}`);
  }

  const normalizer = readText("packages/cdp-capture-adapter/src/normalize.ts");
  for (const evidence of [
    'adapter: "cdp"',
    "paintOrder",
    "backendNodeId",
    "browserPageZoom",
    "visualViewportScale",
    "CDP_FRAME_DOCUMENT_UNAVAILABLE",
    "contentDocumentIndex",
  ]) {
    assert(normalizer.includes(evidence), `CDP RawSnapshot normalizer missing ${evidence}`);
  }
  for (const forbidden of ["inputValue", "textValue", "document.cookie", "localStorage", "sessionStorage"]) {
    assert(!normalizer.includes(forbidden), `CDP normalizer must not consume ${forbidden}`);
  }

  const captureCore = readText("packages/capture-core/src/types.ts");
  for (const contract of [
    'RawCaptureAdapter = "standard" | "cdp"',
    "paintOrder?: number",
    "backendNodeId?: number",
    "layoutMetrics?: RawLayoutMetricsEvidence",
  ]) {
    assert(captureCore.includes(contract), `RawSnapshot NODE-09 extension missing ${contract}`);
  }

  const standardManifest = readJson("apps/browser-extension/static/manifest.json");
  const highManifest = readJson("apps/browser-extension/static/manifest.high-fidelity.json");
  assert(
    JSON.stringify([...(standardManifest.permissions ?? [])].sort()) ===
      JSON.stringify(["activeTab", "scripting", "storage"].sort()),
    "Standard manifest must remain debugger-free",
  );
  assert(
    JSON.stringify([...(highManifest.permissions ?? [])].sort()) ===
      JSON.stringify(["activeTab", "debugger", "scripting", "storage"].sort()),
    "High Fidelity manifest must add debugger and nothing broader",
  );
  for (const manifest of [standardManifest, highManifest]) {
    assert(!("host_permissions" in manifest), "NODE-09 must not add broad host permissions");
    assert(!("content_scripts" in manifest), "NODE-09 must preserve user-action content injection");
  }

  const cdpRuntime = readText("apps/browser-extension/src/runtime/cdp-runtime.ts");
  for (const evidence of [
    "chrome.debugger.attach",
    "chrome.debugger.detach",
    '"DOMSnapshot.captureSnapshot"',
    '"Page.getLayoutMetrics"',
    '"Page.getFrameTree"',
    '"Page.captureScreenshot"',
    '"Runtime.evaluate"',
    "includePaintOrder: true",
    "includeDOMRects: true",
    "captureBeyondViewport: true",
  ]) {
    assert(cdpRuntime.includes(evidence), `Browser CDP platform adapter missing ${evidence}`);
  }
  assert(cdpRuntime.includes("finally"), "CDP debugger detach must be protected by finally");

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "capturePreferredDom",
    "captureHighFidelityWithCdp",
    "CDP_CAPTURE_FALLBACK_STANDARD",
    "fallbackFromCdp",
    "high-fidelity-capture-complete",
    "standard-fallback-complete",
    "writeReferenceScreenshot",
    "deleteCaptureArtifacts",
  ]) {
    assert(serviceWorker.includes(evidence), `Browser High Fidelity orchestration missing ${evidence}`);
  }

  const snapshotStore = readText("apps/browser-extension/src/runtime/snapshot-store.ts");
  for (const evidence of [
    'W2F_REFERENCE_SCREENSHOT_STORE_NAME = "referenceScreenshots"',
    "writeReferenceScreenshot",
    "readReferenceScreenshot",
    "deleteCaptureArtifacts",
  ]) {
    assert(snapshotStore.includes(evidence), `CDP screenshot persistence missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/cdp-capture-adapter"] === "workspace:*",
    "Browser must depend on the shared CDP adapter",
  );
  for (const script of ["build", "build:standard", "build:high-fidelity"]) {
    assert(typeof browserPackage.scripts?.[script] === "string", `Browser package missing ${script}`);
  }

  const packager = readText("apps/browser-extension/scripts/package-extension.mjs");
  for (const evidence of [
    "W2F_BROWSER_PROFILE",
    "dist-high-fidelity",
    "manifest.high-fidelity.json",
    "@w2f/cdp-capture-adapter",
    "relativePackageImport",
  ]) {
    assert(packager.includes(evidence), `Browser dual-profile packager missing ${evidence}`);
  }

  const packageValidator = readText("apps/browser-extension/scripts/validate-extension-package.mjs");
  for (const evidence of [
    "dist-high-fidelity",
    '"debugger"',
    "DOMSnapshot.captureSnapshot",
    "Page.captureScreenshot",
    "Page.getLayoutMetrics",
    "referenceScreenshots",
    "CDP_FRAME_DOCUMENT_UNAVAILABLE",
  ]) {
    assert(packageValidator.includes(evidence), `Browser package validation missing ${evidence}`);
  }

  const protocol = readText("apps/browser-extension/src/runtime/protocol.ts");
  assert(
    protocol.includes('W2F_EXTENSION_SHELL_VERSION = "1.3.0"') &&
      protocol.includes("cdpCaptureImplemented: true") &&
      protocol.includes("captureProfile") &&
      protocol.includes("cdpAvailable"),
    "Browser shell must expose NODE-09 CDP capability",
  );
}

if (failures.length > 0) {
  console.error(
    `NODE-09 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-09 foundation validation passed.");
}
