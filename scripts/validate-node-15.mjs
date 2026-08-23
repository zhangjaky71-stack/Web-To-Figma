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
  "packages/responsive-capture/package.json",
  "packages/responsive-capture/tsconfig.json",
  "packages/responsive-capture/tsconfig.build.json",
  "packages/responsive-capture/src/types.ts",
  "packages/responsive-capture/src/capture.ts",
  "packages/responsive-capture/src/index.ts",
  "packages/responsive-capture/test/responsive-capture.test.ts",
  "apps/browser-extension/src/runtime/responsive-capture-runtime.ts",
  "apps/browser-extension/src/runtime/responsive-capture-store.ts",
  "apps/browser-extension/test/responsive-capture-runtime.test.ts",
  "apps/browser-extension/test/responsive-capture-store.test.ts",
  "apps/browser-extension/test/responsive-cdp-runtime.test.ts",
  "apps/browser-extension/scripts/validate-node-15-package.mjs",
  "docs/RESPONSIVE_CAPTURE_V2.md",
  "docs/adr/ADR-0015-responsive-multi-viewport-orchestration.md",
  "docs/nodes/NODE-15_MULTI_VIEWPORT_RESPONSIVE_CAPTURE.md",
]) {
  assert(existsSync(resolve(root, path)), `NODE-15 missing ${path}`);
}

if (failures.length === 0) {
  const packageJson = JSON.parse(read("packages/responsive-capture/package.json"));
  assert(
    packageJson.name === "@w2f/responsive-capture",
    "NODE-15 Responsive Capture package name drifted",
  );
  assert(
    packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "NODE-15 core must reuse frozen W2F schema",
  );

  const types = read("packages/responsive-capture/src/types.ts");
  for (const evidence of [
    'RESPONSIVE_CAPTURE_VERSION = "1.0.0"',
    "RESPONSIVE_COMMON_WIDTHS = [1440, 1280, 1024, 768, 390]",
    "RESPONSIVE_DEFAULT_WIDTHS = [1440, 768, 390]",
    "RESPONSIVE_MAX_VIEWPORTS = 8",
    '"current"',
    '"common"',
    '"custom"',
    "ResponsiveStableNodeEvidence",
    "ResponsiveSnapshotArtifactRefs",
  ]) {
    assert(types.includes(evidence), `NODE-15 contract missing ${evidence}`);
  }

  const core = read("packages/responsive-capture/src/capture.ts");
  for (const evidence of [
    "planResponsiveViewports",
    "buildResponsiveCapture",
    "responsiveArtifactId",
    "toWtfResponsiveSnapshotRefs",
    "summarizeResponsiveCapture",
    "viewport:",
  ]) {
    assert(core.includes(evidence), `NODE-15 core missing ${evidence}`);
  }
  for (const forbidden of [
    "chrome.",
    "document.",
    "window.",
    "indexedDB",
    "Emulation.",
    "breakpoint detection",
    "FILL",
    "HUG",
  ]) {
    assert(!core.includes(forbidden), `NODE-15 core boundary violation: ${forbidden}`);
  }

  const cdpRuntime = read("apps/browser-extension/src/runtime/cdp-runtime.ts");
  for (const evidence of [
    "activeSessions",
    "withCdpSession",
    "withHighFidelityViewportOverride",
    '"Emulation.setDeviceMetricsOverride"',
    '"Emulation.clearDeviceMetricsOverride"',
    "deviceScaleFactor",
    "api.detach",
  ]) {
    assert(cdpRuntime.includes(evidence), `NODE-15 CDP runtime missing ${evidence}`);
  }

  const responsiveRuntime = read(
    "apps/browser-extension/src/runtime/responsive-capture-runtime.ts",
  );
  for (const evidence of [
    "assignStableIdentities",
    "createDocumentIdentity",
    "buildResponsiveStableNodeEvidence",
    "sourceParentStableNodeId",
    "probeCurrentViewport",
    "assertSnapshotMatchesResponsivePlan",
  ]) {
    assert(responsiveRuntime.includes(evidence), `NODE-15 Browser runtime missing ${evidence}`);
  }
  for (const forbidden of [
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "window.resizeTo",
  ]) {
    assert(
      !responsiveRuntime.includes(forbidden),
      `NODE-15 Browser runtime violates boundary ${forbidden}`,
    );
  }

  const worker = read("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "startResponsiveJob",
    "planResponsiveViewports",
    "responsiveArtifactId",
    "withHighFidelityViewportOverride",
    "captureCdpDom",
    "buildResponsiveStableNodeEvidence",
    "writeResponsiveCapture",
    "deleteResponsiveArtifacts",
    "responsivePlan",
    "capturing-responsive-",
  ]) {
    assert(worker.includes(evidence), `NODE-15 service worker missing ${evidence}`);
  }
  assert(
    worker.includes("Common and Custom responsive capture require the High Fidelity build"),
    "NODE-15 Standard synthetic capability boundary missing",
  );
  for (const forbidden of ["window.resizeTo", "chrome.windows.update", "breakpoint detection"]) {
    assert(!worker.includes(forbidden), `NODE-15 service worker must not use ${forbidden}`);
  }

  const protocol = read("apps/browser-extension/src/runtime/protocol.ts");
  for (const evidence of [
    'W2F_EXTENSION_SHELL_VERSION = "1.4.0"',
    '"W2F_START_RESPONSIVE_JOB"',
    "responsiveCaptureImplemented",
    "syntheticResponsiveAvailable",
  ]) {
    assert(protocol.includes(evidence), `NODE-15 protocol missing ${evidence}`);
  }

  const jobState = read("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    '"responsive"',
    "ResponsiveCaptureReceipt",
    "responsivePlan",
    "stableNodeEvidenceCount",
    "viewportWidths",
  ]) {
    assert(jobState.includes(evidence), `NODE-15 job state missing ${evidence}`);
  }

  const store = read("apps/browser-extension/src/runtime/responsive-capture-store.ts");
  for (const evidence of [
    'W2F_RESPONSIVE_DB_NAME = "w2f-responsive-capture"',
    'W2F_RESPONSIVE_KEY_PREFIX = "responsive:"',
    "writeResponsiveCapture",
    "readResponsiveCapture",
    "deleteResponsiveCapture",
  ]) {
    assert(store.includes(evidence), `NODE-15 store missing ${evidence}`);
  }

  const popupHtml = read("apps/browser-extension/static/popup.html");
  for (const evidence of [
    "responsive-current",
    "responsive-common",
    "responsive-custom",
    "capture-responsive",
    "1440 / 768 / 390",
  ]) {
    assert(popupHtml.includes(evidence), `NODE-15 popup missing ${evidence}`);
  }

  const packaging = read("apps/browser-extension/scripts/package-extension.mjs");
  for (const evidence of [
    'specifier: "@w2f/responsive-capture"',
    'specifier: "@w2f/stable-identity"',
    'specifier: "@w2f/w2f-schema"',
  ]) {
    assert(packaging.includes(evidence), `NODE-15 packaging missing ${evidence}`);
  }

  const browserPackage = JSON.parse(read("apps/browser-extension/package.json"));
  assert(
    browserPackage.dependencies?.["@w2f/responsive-capture"] === "workspace:*",
    "Browser Extension must consume @w2f/responsive-capture",
  );
  for (const scriptName of ["build", "build:standard", "build:high-fidelity"]) {
    assert(
      String(browserPackage.scripts?.[scriptName] ?? "").includes("validate-node-15-package.mjs"),
      `Browser ${scriptName} must enforce NODE-15 package validation`,
    );
  }

  const schema = read("packages/w2f-schema/src/index.ts");
  assert(
    schema.includes("WtfResponsiveSnapshotRef"),
    "NODE-15 must reuse WtfResponsiveSnapshotRef",
  );
  const raw = read("packages/capture-core/src/types.ts");
  assert(
    raw.includes('RAW_SNAPSHOT_VERSION = "1.0.0"'),
    "NODE-15 must not version-bump RawSnapshot",
  );

  const normative = read("docs/RESPONSIVE_CAPTURE_V2.md");
  for (const evidence of [
    "ResponsiveCapture 1.0.0",
    "1440 / 768 / 390",
    "Emulation.setDeviceMetricsOverride",
    "Emulation.clearDeviceMetricsOverride",
    "WtfResponsiveSnapshotRef",
    "stableNodeId",
    "NODE-16",
    "NODE-21",
    "NODE-27",
  ]) {
    assert(normative.includes(evidence), `NODE-15 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error("NODE-15 foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NODE-15 foundation validation passed.");
