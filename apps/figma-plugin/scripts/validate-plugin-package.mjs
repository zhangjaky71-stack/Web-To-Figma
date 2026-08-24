import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}
function text(path) {
  return readFileSync(resolve(appRoot, path), "utf8");
}

for (const path of ["manifest.json", "dist/code.js", "dist/ui.html"]) {
  assert(existsSync(resolve(appRoot, path)), `missing ${path}`);
}

if (failures.length === 0) {
  const manifest = JSON.parse(text("manifest.json"));
  assert(manifest.api === "1.0.0", "Figma manifest API contract drifted");
  assert(
    JSON.stringify(manifest.editorType) === JSON.stringify(["figma"]),
    "plugin must target Figma design mode",
  );
  assert(manifest.main === "dist/code.js", "Figma main bundle path drifted");
  assert(manifest.ui === "dist/ui.html", "Figma UI bundle path drifted");
  assert(
    manifest.documentAccess === "dynamic-page",
    "new Figma plugin must use dynamic-page access",
  );
  assert(
    JSON.stringify(manifest.networkAccess?.allowedDomains) === JSON.stringify(["none"]),
    "Figma import must remain local-first with no network domains",
  );

  const main = text("dist/code.js");
  for (const evidence of [
    "w2f-figma-plugin",
    "W2F_FILE_BYTES",
    "W2F_IMPORT_SELECTION",
    "W2F_RENDER_BASIC_REQUEST",
    "W2F_RENDER_RESULT",
    "W2F_CANCEL_IMPORT",
    "secureParserImplemented",
    "rendererImplemented",
    "__W2F_IMPORTING__",
    "w2f.transactionState",
    "createFrame",
    "createRectangle",
    "createText",
    "loadFontAsync",
    "listAvailableFontsAsync",
    "setRangeFontName",
    "createImage",
    "createNodeFromSvg",
    "GRADIENT_LINEAR",
    "setPluginData",
    "scrollAndZoomIntoView",
    'figma.on("drop"',
    "getBytesAsync",
    "showUI",
  ]) {
    assert(main.includes(evidence), `packaged Figma main missing ${evidence}`);
  }
  for (const forbidden of [
    "require(",
    'from "@w2f/',
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "eval(",
  ]) {
    assert(!main.includes(forbidden), `packaged Figma main must not contain ${forbidden}`);
  }

  const ui = text("dist/ui.html");
  for (const evidence of [
    "Choose .wtf",
    "Selected Sections",
    "High Fidelity",
    "Balanced",
    "Design Friendly",
    "Literal Import",
    "arrayBuffer",
    "W2F_INTAKE_METADATA",
    "W2F_RENDER_BASIC_REQUEST",
    "assetPayloadsById",
    "sanitizedSvgById",
    "section-outline",
    "Validating archive",
    "Secure validation complete",
    "WTF_PARSER_ZIP_SIGNATURE",
    "WTF_PARSER_CHECKSUM_MISMATCH",
    "WTF_PARSER_SVG_UNSAFE",
    "v2-compatible-pass-through",
  ]) {
    assert(ui.includes(evidence), `packaged Figma UI missing ${evidence}`);
  }
  for (const forbidden of [
    "https://",
    "http://",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "eval(",
    "new Function(",
  ]) {
    assert(
      !ui.includes(forbidden),
      `packaged Figma UI must remain local-only/data-only; found ${forbidden}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    `Figma plugin package validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("Figma plugin package validation passed.");
}
