import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = `${appRoot}/dist`;
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "options.html",
  "shell.css",
  "runtime/service-worker.js",
  "runtime/source-runtime.js",
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
  "runtime/standard-capture-adapter/index.js",
  "runtime/standard-capture-adapter/capture.js",
  "runtime/standard-capture-adapter/privacy.js",
  "runtime/standard-capture-adapter/types.js",
  "runtime/content-script.js",
  "runtime/popup.js",
  "runtime/options.js",
  "runtime/protocol.js",
  "runtime/job-state.js",
  "runtime/region-selection.js",
  "runtime/snapshot-store.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

const permissions = [...(manifest.permissions ?? [])].sort();
assert(
  JSON.stringify(permissions) === JSON.stringify(["activeTab", "scripting", "storage"].sort()),
  "browser permissions must remain activeTab+scripting+storage",
);
assert(
  !("host_permissions" in manifest),
  "Standard capture must not request broad host permissions",
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
assert(
  serviceWorker.includes('from "./capture-core/index.js"') &&
    serviceWorker.includes('from "./standard-capture-adapter/index.js"'),
  "service worker must use packaged Standard capture modules",
);
assert(
  serviceWorker.includes("captureStandardSnapshotInPage") &&
    serviceWorker.includes("standard-capture-complete"),
  "service worker must execute and complete NODE-08 Standard capture",
);

const snapshotStore = await readFile(`${outputRoot}/runtime/snapshot-store.js`, "utf8");
assert(snapshotStore.includes("indexedDB.open"), "RawSnapshots must use IndexedDB persistence");
assert(
  snapshotStore.includes('from "./capture-core/index.js"'),
  "snapshot store must validate persisted RawSnapshots with packaged capture-core",
);

const captureCore = await readFile(`${outputRoot}/runtime/capture-core/validation.js`, "utf8");
assert(
  !captureCore.includes("@w2f/w2f-schema"),
  "Browser capture-core runtime must remain self-contained",
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
assert(!standardCapture.includes("sessionStorage"), "Standard capture must not read sessionStorage");

const contentScript = await readFile(`${outputRoot}/runtime/content-script.js`, "utf8");
assert(
  !/^\s*(?:import|export)\s/m.test(contentScript),
  "content script must remain a classic injected script",
);
assert(
  contentScript.includes("W2F_CONTENT_REGION_RESULT") &&
    contentScript.includes("W2F_CONTENT_SELECTION_CANCELLED"),
  "content runtime must keep NODE-07 region selection result/cancellation paths",
);
assert(
  contentScript.includes("attachShadow") && contentScript.includes("elementsFromPoint"),
  "region selector must package its isolated overlay and smart-element hit testing",
);

const protocol = await readFile(`${outputRoot}/runtime/protocol.js`, "utf8");
assert(
  protocol.includes('W2F_EXTENSION_SHELL_VERSION = "1.2.0"'),
  "Browser shell protocol must expose the NODE-08 version",
);

console.log("Browser extension package validation: PASS");
