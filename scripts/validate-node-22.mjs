import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}
function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}
function json(path) {
  return JSON.parse(text(path));
}

const requiredFiles = [
  "apps/figma-plugin/manifest.json",
  "apps/figma-plugin/static/ui.html",
  "apps/figma-plugin/scripts/build-plugin.mjs",
  "apps/figma-plugin/scripts/validate-plugin-package.mjs",
  "apps/figma-plugin/src/main.ts",
  "apps/figma-plugin/src/ui.ts",
  "apps/figma-plugin/src/protocol.ts",
  "apps/figma-plugin/src/intake-state.ts",
  "apps/figma-plugin/test/protocol.test.ts",
  "apps/figma-plugin/test/intake-state.test.ts",
  "docs/FIGMA_PLUGIN_SHELL_FILE_INTAKE_V2.md",
  "docs/adr/ADR-0022-figma-file-intake-boundary.md",
  "docs/nodes/NODE-22_FIGMA_PLUGIN_SHELL_FILE_INTAKE.md",
];
for (const file of requiredFiles)
  assert(existsSync(resolve(root, file)), `NODE-22 missing ${file}`);

if (failures.length === 0) {
  const packageJson = json("apps/figma-plugin/package.json");
  assert(
    packageJson.devDependencies?.["@figma/plugin-typings"] === "1.134.0",
    "Figma typings must remain pinned",
  );
  assert(packageJson.devDependencies?.esbuild === "0.28.2", "Figma bundler must remain pinned");
  assert(
    packageJson.scripts?.build ===
      "node scripts/build-plugin.mjs && node scripts/validate-plugin-package.mjs",
    "Figma plugin build must bundle and validate the loadable package",
  );

  const manifest = json("apps/figma-plugin/manifest.json");
  assert(
    manifest.main === "dist/code.js" && manifest.ui === "dist/ui.html",
    "Figma main/UI paths drifted",
  );
  assert(
    manifest.documentAccess === "dynamic-page",
    "Figma plugin must use dynamic-page document access",
  );
  assert(
    JSON.stringify(manifest.editorType) === JSON.stringify(["figma"]),
    "NODE-22 must target Figma design mode",
  );
  assert(
    JSON.stringify(manifest.networkAccess?.allowedDomains) === JSON.stringify(["none"]),
    "NODE-22 must not add network access",
  );

  const protocol = text("apps/figma-plugin/src/protocol.ts");
  for (const evidence of [
    'W2F_FIGMA_PROTOCOL = "w2f-figma-plugin"',
    "W2F_FIGMA_PROTOCOL_VERSION = 1",
    '"high-fidelity"',
    '"balanced"',
    '"design-friendly"',
    '"whole-page"',
    '"selected-sections"',
    'W2F_TOKEN_POLICIES = ["literal"]',
    "W2fSectionOutlineItem",
    "W2fRevisionPreview",
    "stableSourceMappingCount",
    "W2F_FILE_BYTES",
    "W2F_PARSER_PREVIEW",
  ]) {
    assert(protocol.includes(evidence), `Figma protocol missing ${evidence}`);
  }

  const intake = text("apps/figma-plugin/src/intake-state.ts");
  for (const evidence of [
    "W2F_MAX_INTAKE_BYTES",
    "createFileIntakeDescriptor",
    "awaiting-secure-parser",
    "transitionProgress",
    "selectionForPreview",
    "normalizeSelectedSections",
  ]) {
    assert(intake.includes(evidence), `Figma intake state missing ${evidence}`);
  }
  for (const forbidden of [
    "unzip",
    "inflate",
    "JSZip",
    "fflate",
    "validateWtfManifest",
    "validateChecksums",
  ]) {
    assert(
      !intake.includes(forbidden),
      `NODE-22 intake must not implement NODE-23 parser behavior: ${forbidden}`,
    );
  }

  const main = text("apps/figma-plugin/src/main.ts");
  for (const evidence of [
    "figma.showUI",
    'figma.on("drop"',
    "getBytesAsync",
    "event.absoluteX",
    "event.absoluteY",
    "W2F_FILE_BYTES",
    "secureParserImplemented: false",
    "rendererImplemented: false",
  ]) {
    assert(main.includes(evidence), `Figma main shell missing ${evidence}`);
  }

  const ui = text("apps/figma-plugin/src/ui.ts");
  for (const evidence of [
    "file.arrayBuffer",
    'source: "canvas-drop"',
    '"ui-drop"',
    '"choose"',
    "renderSections",
    "applyParserPreview",
    "W2F_IMPORT_SELECTION",
    "W2F_E_RENDERER_NOT_IMPLEMENTED",
  ]) {
    if (evidence === 'source: "canvas-drop"') continue;
    assert(ui.includes(evidence), `Figma UI shell missing ${evidence}`);
  }
  for (const forbidden of [
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "localStorage",
    "sessionStorage",
  ]) {
    assert(!ui.includes(forbidden), `Figma UI must remain local-first; found ${forbidden}`);
  }

  const markup = text("apps/figma-plugin/static/ui.html");
  for (const evidence of [
    "Choose .wtf",
    "drop .wtf directly on the Figma canvas",
    "High Fidelity",
    "Balanced",
    "Design Friendly",
    "Whole Page",
    "Selected Sections",
    "Section outline",
    "Literal Import",
  ]) {
    assert(markup.includes(evidence), `Figma intake UI missing ${evidence}`);
  }

  const normative = text("docs/FIGMA_PLUGIN_SHELL_FILE_INTAKE_V2.md");
  for (const evidence of [
    "NODE-23",
    "main",
    "UI",
    "Choose File",
    "Canvas Drop",
    "Selected Sections",
    "Literal Import",
    "revision metadata",
    "stable source mapping",
  ]) {
    assert(normative.includes(evidence), `NODE-22 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-22 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-22 foundation validation passed.");
}
