import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "options.html",
  "shell.css",
  "runtime/service-worker.js",
  "runtime/source-runtime.js",
  "runtime/cdp-runtime.js",
  "runtime/css-cascade-runtime.js",
  "runtime/css-cascade-store.js",
  "runtime/environment-runtime.js",
  "runtime/environment-store.js",
  "runtime/source-providers/index.js",
  "runtime/source-providers/http-page-provider.js",
  "runtime/source-providers/file-tab-provider.js",
  "runtime/source-providers/local-folder-provider.js",
  "runtime/source-providers/registry.js",
  "runtime/source-providers/types.js",
  "runtime/source-providers/urls.js",
  "runtime/capture-core/index.js",
  "runtime/capture-core/types.js",
  "runtime/capture-core/validation.js",
  "runtime/css-cascade/index.js",
  "runtime/css-cascade/types.js",
  "runtime/css-cascade/cascade.js",
  "runtime/css-cascade/capture.js",
  "runtime/css-cascade/length.js",
  "runtime/css-cascade/tokens.js",
  "runtime/environment-capture/index.js",
  "runtime/environment-capture/types.js",
  "runtime/environment-capture/capture.js",
  "runtime/standard-capture-adapter/index.js",
  "runtime/standard-capture-adapter/capture.js",
  "runtime/standard-capture-adapter/cascade-capture.js",
  "runtime/standard-capture-adapter/environment-capture.js",
  "runtime/standard-capture-adapter/privacy.js",
  "runtime/standard-capture-adapter/types.js",
  "runtime/cdp-capture-adapter/index.js",
  "runtime/cdp-capture-adapter/normalize.js",
  "runtime/cdp-capture-adapter/types.js",
  "runtime/content-script.js",
  "runtime/popup.js",
  "runtime/options.js",
  "runtime/protocol.js",
  "runtime/job-state.js",
  "runtime/region-selection.js",
  "runtime/snapshot-store.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(`[${profile}] ${message}`);
}

async function walkJsFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(`${directory}/${entry.name}`, relativePath)));
    } else if (entry.name.endsWith(".js")) {
      files.push(relativePath);
    }
  }
  return files;
}

for (const relativePath of requiredFiles) {
  await access(`${outputRoot}/${relativePath}`);
}

const manifest = JSON.parse(await readFile(`${outputRoot}/manifest.json`, "utf8"));
assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(
  manifest.background?.service_worker === "runtime/service-worker.js",
  "service worker path drift",
);
assert(manifest.background?.type === "module", "service worker must be an ES module");
assert(manifest.action?.default_popup === "popup.html", "popup path drift");
assert(manifest.options_ui?.page === "options.html", "options path drift");
assert(manifest.options_ui?.open_in_tab === true, "options must open in a tab");

const expectedPermissions =
  profile === "high-fidelity"
    ? ["activeTab", "debugger", "downloads", "scripting", "storage"]
    : ["activeTab", "downloads", "scripting", "storage"];
const permissions = [...(manifest.permissions ?? [])].sort();
assert(
  JSON.stringify(permissions) === JSON.stringify([...expectedPermissions].sort()),
  `permissions must equal ${expectedPermissions.join("+")}`,
);
assert(
  profile === "high-fidelity"
    ? permissions.includes("debugger")
    : !permissions.includes("debugger"),
  "debugger permission must exist only in the High Fidelity profile",
);
const hostPermissions = [...(manifest.host_permissions ?? [])].sort();
assert(
  JSON.stringify(hostPermissions) === JSON.stringify(["file:///*"]),
  "capture profiles must request only file:///* host permission",
);
assert(!("content_scripts" in manifest), "content script must be injected only after user action");
assert(
  manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'self'",
  "extension page CSP must remain self-only",
);

const popup = await readFile(`${outputRoot}/popup.html`, "utf8");
const options = await readFile(`${outputRoot}/options.html`, "utf8");
assert(popup.includes('type="module" src="runtime/popup.js"'), "popup module entrypoint missing");
assert(
  options.includes('type="module" src="runtime/options.js"'),
  "options module entrypoint missing",
);

const runtimeFiles = await walkJsFiles(`${outputRoot}/runtime`);
for (const file of runtimeFiles) {
  const source = await readFile(`${outputRoot}/runtime/${file}`, "utf8");
  assert(!/https?:\/\//i.test(source), `remote code URL found in runtime/${file}`);
  assert(
    !/from\s+["']@w2f\//.test(source),
    `unresolved @w2f runtime import found in runtime/${file}`,
  );
}

const sourceRuntime = await readFile(`${outputRoot}/runtime/source-runtime.js`, "utf8");
assert(
  sourceRuntime.includes('from "./source-providers/index.js"'),
  "source runtime must use packaged relative source-provider modules",
);

const serviceWorker = await readFile(`${outputRoot}/runtime/service-worker.js`, "utf8");
for (const importPath of [
  "./capture-core/index.js",
  "./standard-capture-adapter/index.js",
  "./cdp-runtime.js",
  "./css-cascade-runtime.js",
  "./css-cascade-store.js",
  "./environment-runtime.js",
  "./environment-store.js",
]) {
  assert(serviceWorker.includes(`from "${importPath}"`), `service worker missing ${importPath}`);
}
assert(
  serviceWorker.includes("capturePreferredDom") &&
    serviceWorker.includes("CDP_CAPTURE_FALLBACK_STANDARD") &&
    serviceWorker.includes("high-fidelity-capture-complete"),
  "service worker must preserve CDP preference, explicit fallback and completion paths",
);
assert(
  serviceWorker.includes("persistCssCascade") &&
    serviceWorker.includes("deleteAllCaptureArtifacts"),
  "service worker must persist and clean up NODE-11 CSS sidecars",
);
assert(
  serviceWorker.includes("persistEnvironment") &&
    serviceWorker.includes("writeEnvironmentCapture") &&
    serviceWorker.includes("deleteEnvironmentCapture"),
  "service worker must persist and clean up NODE-12 environment sidecars",
);

const cdpRuntime = await readFile(`${outputRoot}/runtime/cdp-runtime.js`, "utf8");
for (const evidence of [
  "api.attach",
  "api.detach",
  "DOMSnapshot.captureSnapshot",
  "Page.captureScreenshot",
  "Page.getLayoutMetrics",
  "Page.getFrameTree",
  "Runtime.evaluate",
  "includePaintOrder",
  "includeDOMRects",
]) {
  assert(cdpRuntime.includes(evidence), `CDP runtime missing ${evidence}`);
}
assert(
  cdpRuntime.includes('from "./cdp-capture-adapter/index.js"'),
  "CDP runtime must use packaged relative CDP adapter modules",
);

const cssCascadeRuntime = await readFile(`${outputRoot}/runtime/css-cascade-runtime.js`, "utf8");
for (const evidence of [
  "DOM.pushNodesByBackendIdsToFrontend",
  "CSS.getMatchedStylesForNode",
  "CSS.getComputedStyleForNode",
  "normalizeCdpMatchedStyleAcquisition",
  "captureStandardCascadeInPage",
  "CSS_CAPTURE_BUDGET_EXCEEDED",
]) {
  assert(cssCascadeRuntime.includes(evidence), `NODE-11 CSS runtime missing ${evidence}`);
}
assert(
  cssCascadeRuntime.includes('from "./css-cascade/index.js"'),
  "NODE-11 CSS runtime must use packaged relative css-cascade modules",
);
assert(
  cssCascadeRuntime.includes('from "./standard-capture-adapter/index.js"'),
  "NODE-11 Standard CSS acquisition must use packaged adapter modules",
);

const cdpNormalizer = await readFile(
  `${outputRoot}/runtime/cdp-capture-adapter/normalize.js`,
  "utf8",
);
assert(
  !cdpNormalizer.includes("@w2f/"),
  "nested CDP adapter must not contain unresolved workspace imports",
);
assert(cdpNormalizer.includes("paintOrder"), "CDP adapter must preserve paint order evidence");
assert(
  cdpNormalizer.includes("CDP_FRAME_DOCUMENT_UNAVAILABLE"),
  "CDP adapter must diagnose frame tree entries unavailable in the root DOMSnapshot",
);
assert(
  !cdpNormalizer.includes("document.nodes.inputValue"),
  "CDP adapter must not consume input runtime value evidence fields",
);
assert(
  !cdpNormalizer.includes("document.nodes.textValue"),
  "CDP adapter must not consume textarea runtime value evidence fields",
);

const snapshotStore = await readFile(`${outputRoot}/runtime/snapshot-store.js`, "utf8");
assert(snapshotStore.includes("indexedDB.open"), "capture evidence must use IndexedDB persistence");
assert(
  snapshotStore.includes("referenceScreenshots") &&
    snapshotStore.includes("writeReferenceScreenshot"),
  "CDP Page screenshot evidence must be persisted outside chrome.storage.local",
);

const cssCascadeStore = await readFile(`${outputRoot}/runtime/css-cascade-store.js`, "utf8");
assert(
  cssCascadeStore.includes("indexedDB.open"),
  "NODE-11 CSS sidecar must use IndexedDB persistence",
);
assert(
  cssCascadeStore.includes("w2f-css-cascade") && cssCascadeStore.includes("css-cascade:"),
  "NODE-11 CSS sidecar store/key contract drifted",
);

const environmentRuntime = await readFile(`${outputRoot}/runtime/environment-runtime.js`, "utf8");
for (const evidence of [
  "captureEnvironmentForSnapshot",
  "captureEnvironmentMediaFeaturesInPage",
  "prefers-color-scheme",
  "prefers-reduced-motion",
  "prefers-contrast",
  "forced-colors",
]) {
  assert(environmentRuntime.includes(evidence), `NODE-12 environment runtime missing ${evidence}`);
}
assert(
  environmentRuntime.includes('from "./environment-capture/index.js"'),
  "NODE-12 environment runtime must use packaged relative environment-capture modules",
);

const environmentStore = await readFile(`${outputRoot}/runtime/environment-store.js`, "utf8");
assert(
  environmentStore.includes("indexedDB.open") &&
    environmentStore.includes("w2f-environment") &&
    environmentStore.includes("environment:"),
  "NODE-12 environment sidecar store/key contract drifted",
);

const environmentCore = await readFile(
  `${outputRoot}/runtime/environment-capture/capture.js`,
  "utf8",
);
assert(
  !environmentCore.includes("@w2f/"),
  "packaged environment-capture core must not contain unresolved workspace imports",
);
assert(
  environmentCore.includes("createEnvironmentCapture") &&
    environmentCore.includes("toWtfMediaRuleTraces") &&
    environmentCore.includes("toWtfContainerQueryInfo"),
  "packaged environment-capture core must preserve NODE-12 normalization/IR bridges",
);

const captureCore = await readFile(`${outputRoot}/runtime/capture-core/validation.js`, "utf8");
assert(
  !captureCore.includes("@w2f/w2f-schema"),
  "Browser capture-core runtime must remain self-contained",
);

const cssCascadeCore = await readFile(`${outputRoot}/runtime/css-cascade/capture.js`, "utf8");
assert(
  !cssCascadeCore.includes("@w2f/"),
  "packaged css-cascade core must not contain unresolved workspace imports",
);
assert(
  cssCascadeCore.includes("matched-unresolved") && cssCascadeCore.includes("isCssCascadeCapture"),
  "packaged css-cascade core must validate non-fabricated authored evidence",
);

const standardCapture = await readFile(
  `${outputRoot}/runtime/standard-capture-adapter/capture.js`,
  "utf8",
);
for (const evidence of [
  "assignedNodes",
  "shadowRoot",
  "contentDocument",
  "STANDARD_CAPTURE_FRAME_INACCESSIBLE",
  "getClientRects",
]) {
  assert(standardCapture.includes(evidence), `Standard capture runtime missing ${evidence}`);
}
assert(!standardCapture.includes("document.cookie"), "Standard capture must not read cookies");
assert(!standardCapture.includes("localStorage"), "Standard capture must not read localStorage");
assert(
  !standardCapture.includes("sessionStorage"),
  "Standard capture must not read sessionStorage",
);

const standardCascade = await readFile(
  `${outputRoot}/runtime/standard-capture-adapter/cascade-capture.js`,
  "utf8",
);
for (const evidence of [
  "styleSheets",
  "adoptedStyleSheets",
  "CSSMediaRule",
  "matchMedia",
  "matched-unresolved",
  "CSS_STYLESHEET_INACCESSIBLE",
]) {
  assert(standardCascade.includes(evidence), `Standard authored CSS runtime missing ${evidence}`);
}
assert(!standardCascade.includes("document.cookie"), "Standard authored CSS must not read cookies");
assert(
  !standardCascade.includes("localStorage"),
  "Standard authored CSS must not read localStorage",
);
assert(
  !standardCascade.includes("sessionStorage"),
  "Standard authored CSS must not read sessionStorage",
);

const standardEnvironment = await readFile(
  `${outputRoot}/runtime/standard-capture-adapter/environment-capture.js`,
  "utf8",
);
for (const evidence of [
  "CSSMediaRule",
  "CSSContainerRule",
  "matchMedia",
  "container-name",
  "container-type",
  "ENV_PAGE_ZOOM_UNAVAILABLE",
]) {
  assert(
    standardEnvironment.includes(evidence),
    `Standard environment runtime missing ${evidence}`,
  );
}
for (const forbidden of ["document.cookie", "localStorage", "sessionStorage"]) {
  assert(
    !standardEnvironment.includes(forbidden),
    `Standard environment runtime must not read ${forbidden}`,
  );
}

const contentScript = await readFile(`${outputRoot}/runtime/content-script.js`, "utf8");
assert(
  !/^\s*(?:import|export)\s/m.test(contentScript),
  "content script must remain a classic injected script",
);
assert(
  contentScript.includes("W2F_CONTENT_REGION_RESULT") &&
    contentScript.includes("W2F_CONTENT_SELECTION_CANCELLED"),
  "content runtime must keep region selection result/cancellation paths",
);

const protocol = await readFile(`${outputRoot}/runtime/protocol.js`, "utf8");
const shellVersionMatch = protocol.match(/W2F_EXTENSION_SHELL_VERSION = "(\d+)\.(\d+)\.(\d+)"/);
assert(
  shellVersionMatch && Number(shellVersionMatch[1]) === 1 && Number(shellVersionMatch[2]) >= 3,
  "Browser shell protocol must preserve NODE-09 compatibility while allowing additive 1.x minor versions",
);

console.log(`Browser extension package validation (${profile}): PASS`);
