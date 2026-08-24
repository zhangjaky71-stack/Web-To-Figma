import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/package.json",
  "packages/figma-renderer/tsconfig.json",
  "packages/figma-renderer/tsconfig.build.json",
  "packages/figma-renderer/src/index.ts",
  "packages/figma-renderer/src/types.ts",
  "packages/figma-renderer/src/planner.ts",
  "packages/figma-renderer/src/transaction.ts",
  "packages/figma-renderer/test/basic-renderer.test.ts",
  "apps/figma-plugin/src/figma-basic-adapter.ts",
  "apps/figma-plugin/src/main.ts",
  "apps/figma-plugin/src/protocol.ts",
  "apps/figma-plugin/src/ui.ts",
  "apps/figma-plugin/test/protocol.test.ts",
  "docs/adr/ADR-0025-transactional-basic-figma-renderer.md",
  "docs/nodes/NODE-25_BASIC_FIGMA_RENDERER.md",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}
function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of required) assert(existsSync(resolve(root, path)), `missing ${path}`);

if (failures.length === 0) {
  const pkg = JSON.parse(text("packages/figma-renderer/package.json"));
  assert(pkg.name === "@w2f/figma-renderer", "NODE-25 package name drifted");
  assert(
    pkg.dependencies?.["@w2f/figma-capability-resolver"] === "workspace:*",
    "renderer must consume NODE-24 capability resolver through workspace-only resolution",
  );
  assert(
    pkg.dependencies?.["@w2f/w2f-ir"] === "workspace:*",
    "renderer must consume W2F IR through workspace-only resolution",
  );
  assert(
    !pkg.dependencies?.["@figma/plugin-typings"] && !pkg.devDependencies?.["@figma/plugin-typings"],
    "platform-independent renderer core must not bind Figma typings",
  );

  const types = text("packages/figma-renderer/src/types.ts");
  for (const evidence of [
    "__W2F_IMPORTING__",
    "w2f.nodeId",
    "w2f.sourceNodeIds",
    "w2f.sourceStableIds",
    "w2f.renderStrategy",
    "w2f.revisionHashes",
    "w2f.importVersion",
    "w2f.tokenPolicy",
    "W2fBasicFigmaAdapter",
    "FRAME",
    "RECTANGLE",
  ]) {
    assert(types.includes(evidence), `NODE-25 types missing ${evidence}`);
  }

  const planner = text("packages/figma-renderer/src/planner.ts");
  for (const evidence of [
    "geometryRelativeTo",
    "absolute.x - parentOrigin.x",
    "absolute.y - parentOrigin.y",
    "childIds",
    "selectedRoots",
    "sourceStableIds",
    "revisionHashes",
    'input.tokenPolicy ?? "literal"',
    "normalizeRenderProfile",
    "Cycle detected",
  ]) {
    assert(planner.includes(evidence), `NODE-25 planner missing ${evidence}`);
  }
  for (const forbidden of ["Math.round(", "figma.", "createFrame(", "createRectangle("]) {
    assert(!planner.includes(forbidden), `NODE-25 planner must remain platform/precision neutral: ${forbidden}`);
  }

  const transaction = text("packages/figma-renderer/src/transaction.ts");
  for (const evidence of [
    "W2F_IMPORTING_ROOT_NAME",
    "adapter.createFrame()",
    "adapter.createRectangle()",
    "adapter.appendChild",
    "adapter.remove(root)",
    '"committed"',
    "setSelection",
    "focusNodes",
  ]) {
    assert(transaction.includes(evidence), `NODE-25 transaction missing ${evidence}`);
  }

  const tests = text("packages/figma-renderer/test/basic-renderer.test.ts");
  for (const evidence of [
    "10.25",
    "5.75",
    "appendOrder",
    "sourceStableIds",
    "revisionHashes",
    "selected-roots",
    "explicit canvas destination",
    "rolls back the temporary root",
    "malformed trees before any adapter mutation",
    "same plan for the same validated input",
  ]) {
    assert(tests.includes(evidence), `NODE-25 tests missing ${evidence}`);
  }

  const adapter = text("apps/figma-plugin/src/figma-basic-adapter.ts");
  for (const evidence of [
    "figma.createFrame()",
    "figma.createRectangle()",
    "node.setPluginData",
    "node.resize",
    "currentPage.selection",
    "scrollAndZoomIntoView",
  ]) {
    assert(adapter.includes(evidence), `NODE-25 Figma adapter missing ${evidence}`);
  }

  const protocol = text("apps/figma-plugin/src/protocol.ts");
  for (const evidence of [
    "W2F_RENDER_BASIC_REQUEST",
    "W2F_RENDER_RESULT",
    "W2fBasicRenderRequest",
    "rendererImplemented: true",
    'tokenPolicy: "literal"',
  ]) {
    assert(protocol.includes(evidence), `NODE-25 protocol missing ${evidence}`);
  }

  const main = text("apps/figma-plugin/src/main.ts");
  assert(main.includes("renderBasicFigmaScene"), "NODE-25 Figma main must invoke renderer transaction");
  assert(main.includes("createFigmaBasicAdapter"), "NODE-25 Figma main must use real adapter");
  assert(main.includes("W2F_RENDER_RESULT"), "NODE-25 Figma main must report renderer success");

  const ui = text("apps/figma-plugin/src/ui.ts");
  assert(ui.includes("parsed.ir.renderTree"), "NODE-25 UI must hand validated Render Tree to main");
  assert(ui.includes("parsed.ir.sourceGraph"), "NODE-25 UI must hand validated Source Graph to main");
  assert(ui.includes("selectedRenderRootIds"), "NODE-25 UI must support Selected Sections handoff");
  assert(
    !ui.includes("W2F_E_RENDERER_NOT_IMPLEMENTED"),
    "NODE-25 must remove the old renderer-not-implemented boundary",
  );

  const nodeDoc = text("docs/nodes/NODE-25_BASIC_FIGMA_RENDERER.md");
  assert(nodeDoc.includes("Basic Figma Renderer"), "NODE-25 implementation doc missing");
  for (const boundary of ["NODE-26", "NODE-27", "NODE-28"]) {
    assert(nodeDoc.includes(boundary), `NODE-25 boundary missing ${boundary}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-25 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-25 foundation validation passed.");
}
