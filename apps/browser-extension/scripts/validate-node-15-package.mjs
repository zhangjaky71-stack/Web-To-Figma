import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[${profile}] ${message}`);
}

for (const path of [
  "runtime/responsive-capture-runtime.js",
  "runtime/responsive-capture-store.js",
  "runtime/responsive-capture/index.js",
  "runtime/responsive-capture/types.js",
  "runtime/responsive-capture/capture.js",
  "runtime/stable-identity/index.js",
  "runtime/stable-identity/identity.js",
  "runtime/stable-identity/hash.js",
  "runtime/w2f-schema/index.js",
  "runtime/popup.js",
  "popup.html",
]) {
  await access(`${outputRoot}/${path}`);
}

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const evidence of [
  "startResponsiveJob",
  "planResponsiveViewports",
  "responsiveArtifactId",
  "withHighFidelityViewportOverride",
  "buildResponsiveStableNodeEvidence",
  "writeResponsiveCapture",
  "deleteResponsiveArtifacts",
  "capturing-responsive-",
  "Responsive capture incomplete",
]) {
  assert(serviceWorker.includes(evidence), `service worker missing NODE-15 evidence ${evidence}`);
}
assert(
  serviceWorker.includes('from "./responsive-capture/index.js"') &&
    serviceWorker.includes('from "./responsive-capture-runtime.js"') &&
    serviceWorker.includes('from "./responsive-capture-store.js"'),
  "service worker must use packaged responsive runtime modules",
);

const responsiveRuntime = await readFile(
  `${outputRoot}/runtime/responsive-capture-runtime.js`,
  "utf8",
);
for (const evidence of [
  "buildResponsiveStableNodeEvidence",
  "assignStableIdentities",
  "createDocumentIdentity",
  "probeCurrentViewport",
  "assertSnapshotMatchesResponsivePlan",
  "sourceParentStableNodeId",
]) {
  assert(responsiveRuntime.includes(evidence), `responsive runtime missing ${evidence}`);
}
assert(
  responsiveRuntime.includes('from "./stable-identity/index.js"'),
  "responsive runtime must use packaged Stable Identity modules",
);

const cdpRuntime = await readFile(`${outputRoot}/runtime/cdp-runtime.js`, "utf8");
for (const evidence of [
  "activeSessions",
  "withCdpSession",
  "withHighFidelityViewportOverride",
  "Emulation.setDeviceMetricsOverride",
  "Emulation.clearDeviceMetricsOverride",
  "deviceScaleFactor",
]) {
  assert(cdpRuntime.includes(evidence), `responsive CDP runtime missing ${evidence}`);
}

const protocol = await readFile(`${outputRoot}/runtime/protocol.js`, "utf8");
for (const evidence of [
  'W2F_EXTENSION_SHELL_VERSION = "1.4.0"',
  "W2F_START_RESPONSIVE_JOB",
  "custom",
  "common",
]) {
  assert(protocol.includes(evidence), `responsive protocol missing ${evidence}`);
}

const popup = await readFile(`${outputRoot}/runtime/popup.js`, "utf8");
const popupHtml = await readFile(`${outputRoot}/popup.html`, "utf8");
for (const evidence of [
  "responsive-current",
  "responsive-common",
  "responsive-custom",
  "capture-responsive",
]) {
  assert(popupHtml.includes(evidence), `popup missing responsive UI ${evidence}`);
}
for (const evidence of [
  "W2F_START_RESPONSIVE_JOB",
  "syntheticResponsiveAvailable",
  "selectedResponsiveRequest",
]) {
  assert(popup.includes(evidence), `popup runtime missing ${evidence}`);
}

const store = await readFile(`${outputRoot}/runtime/responsive-capture-store.js`, "utf8");
for (const evidence of [
  "indexedDB.open",
  "w2f-responsive-capture",
  "responsive:",
  "writeResponsiveCapture",
  "readResponsiveCapture",
  "deleteResponsiveCapture",
]) {
  assert(store.includes(evidence), `responsive store missing ${evidence}`);
}

const core = await readFile(`${outputRoot}/runtime/responsive-capture/capture.js`, "utf8");
assert(
  !core.includes("@w2f/"),
  "packaged Responsive Capture core must not contain workspace imports",
);
for (const evidence of [
  "planResponsiveViewports",
  "buildResponsiveCapture",
  "responsiveArtifactId",
  "toWtfResponsiveSnapshotRefs",
  "summarizeResponsiveCapture",
  "RESPONSIVE_DEFAULT_WIDTHS",
]) {
  assert(core.includes(evidence), `packaged Responsive Capture core missing ${evidence}`);
}

const types = await readFile(`${outputRoot}/runtime/responsive-capture/types.js`, "utf8");
for (const evidence of [
  'RESPONSIVE_CAPTURE_VERSION = "1.0.0"',
  "RESPONSIVE_COMMON_WIDTHS = [1440, 1280, 1024, 768, 390]",
  "RESPONSIVE_DEFAULT_WIDTHS = [1440, 768, 390]",
  "RESPONSIVE_MAX_VIEWPORTS = 8",
]) {
  assert(types.includes(evidence), `responsive contract drifted: ${evidence}`);
}

const stableIdentity = await readFile(`${outputRoot}/runtime/stable-identity/identity.js`, "utf8");
assert(
  !stableIdentity.includes("@w2f/"),
  "packaged Stable Identity must not contain workspace imports",
);
assert(
  stableIdentity.includes('from "../w2f-schema/index.js"'),
  "packaged Stable Identity must resolve W2F Schema relatively",
);

const manifest = JSON.parse(await readFile(`${outputRoot}/manifest.json`, "utf8"));
const permissions = manifest.permissions ?? [];
if (profile === "high-fidelity") {
  assert(
    permissions.includes("debugger"),
    "High Fidelity responsive capture requires debugger permission",
  );
} else {
  assert(
    !permissions.includes("debugger"),
    "Standard responsive capture must not add debugger permission",
  );
}

for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "window.resizeTo"]) {
  assert(!serviceWorker.includes(forbidden), `responsive orchestration must not use ${forbidden}`);
  assert(!responsiveRuntime.includes(forbidden), `responsive runtime must not use ${forbidden}`);
}

console.log(`NODE-15 Responsive Capture package validation (${profile}): PASS`);
