import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = `${appRoot}/dist-node31-measurement`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(await readFile(`${appRoot}/manifest.node31-measurement.json`, "utf8"));
assert(manifest.main === "dist-node31-measurement/code.js", "NODE-31 manifest main path mismatch");
assert(manifest.ui === "dist-node31-measurement/ui.html", "NODE-31 manifest UI path mismatch");
assert(
  JSON.stringify(manifest.networkAccess?.allowedDomains) === JSON.stringify(["none"]),
  "NODE-31 measurement harness must not request network access",
);
assert(
  JSON.stringify(manifest.editorType) === JSON.stringify(["figma"]),
  "NODE-31 measurement harness must target Figma design files only",
);

const [code, ui, branchHead] = await Promise.all([
  readFile(`${distRoot}/code.js`, "utf8"),
  readFile(`${distRoot}/ui.html`, "utf8"),
  readFile(`${distRoot}/branch-head.txt`, "utf8"),
]);
for (const [path, contents] of [
  ["code.js", code],
  ["ui.html", ui],
]) {
  assert((await stat(`${distRoot}/${path}`)).size > 100, `${path} is unexpectedly empty`);
  assert(!contents.includes("W2F_NODE31_UI_SCRIPT"), `${path} contains an unresolved UI marker`);
}
assert(/^[a-f0-9]{40}\n$/.test(branchHead), "NODE-31 built branch head is invalid");

for (const evidence of [
  "w2f-node31-desktop-measurement",
  "NODE31_MEASURE",
  "__W2F_NODE31_DESKTOP_MEASUREMENT__",
  "exportAsync",
  "evaluateStructureAndEditabilityQa",
]) {
  assert(code.includes(evidence), `NODE-31 main bundle missing ${evidence}`);
}
for (const evidence of [
  "Electron-backed Figma plugin UI detected",
  "Exact-head mismatch",
  "source identity mismatch",
  "node31-figma-desktop-evidence-archive",
  "pixel-ground-truth-normalized-rgb",
]) {
  assert(ui.includes(evidence), `NODE-31 UI bundle missing ${evidence}`);
}
assert(
  !ui.includes("figma-host-simulator"),
  "Desktop evidence UI must not relabel simulator output",
);

console.log("W2F NODE-31 Desktop measurement package validation passed.");
