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
  "runtime/content-script.js",
  "runtime/popup.js",
  "runtime/options.js",
  "runtime/protocol.js",
  "runtime/job-state.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  "NODE-05 permissions must remain activeTab+scripting+storage",
);
assert(!("host_permissions" in manifest), "NODE-05 must not request broad host permissions");
assert(
  !("content_scripts" in manifest),
  "NODE-05 content script must be injected only after user action",
);
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

const runtimeFiles = await readdir(`${outputRoot}/runtime`);
for (const file of runtimeFiles.filter((name) => name.endsWith(".js"))) {
  const source = await readFile(`${outputRoot}/runtime/${file}`, "utf8");
  assert(!/https?:\/\//i.test(source), `remote code URL found in runtime/${file}`);
}

const contentScript = await readFile(`${outputRoot}/runtime/content-script.js`, "utf8");
assert(
  !/^\s*(?:import|export)\s/m.test(contentScript),
  "content script must remain a classic injected script",
);

console.log("Browser extension package validation: PASS");
