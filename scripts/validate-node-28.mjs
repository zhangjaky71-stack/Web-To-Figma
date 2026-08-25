import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/hybrid/types.ts",
  "packages/figma-renderer/src/hybrid/planner.ts",
  "packages/figma-renderer/test/hybrid-raster-planner.test.ts",
  "apps/figma-plugin/src/figma-hybrid-renderer.ts",
  "apps/figma-plugin/test/hybrid-renderer.test.ts",
  "apps/figma-plugin/src/main.ts",
  "apps/figma-plugin/src/ui.ts",
  "apps/figma-plugin/scripts/validate-plugin-package.mjs",
  "docs/nodes/NODE-28_HYBRID_NATIVE_RASTER_RENDERER.md",
  "docs/adr/ADR-0028-evidence-backed-local-raster-boundaries.md",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of required) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

if (failures.length === 0) {
  const types = text("packages/figma-renderer/src/hybrid/types.ts");
  for (const evidence of [
    "W2fHybridRasterPlan",
    "W2fRasterBoundaryReadyPlan",
    "W2fRasterBoundaryMissingPlan",
    "W2fRasterTilePlan",
    'state: "ready"',
    'state: "missing"',
  ]) {
    assert(types.includes(evidence), `NODE-28 hybrid types missing ${evidence}`);
  }

  const planner = text("packages/figma-renderer/src/hybrid/planner.ts");
  for (const evidence of [
    "createHybridRasterPlan",
    'renderStrategy === "raster"',
    "hasRasterAncestor",
    "encodeURIComponent",
    '"node-fallback"',
    '"canvas"',
    '"video-frame"',
    "horizontal tile gap or overlap",
    "vertical tile gap or overlap",
    "missing raster tile",
    "No packaged local raster reference matched",
  ]) {
    assert(planner.includes(evidence), `NODE-28 planner missing ${evidence}`);
  }
  for (const forbidden of ["figma.", "fetch(", "XMLHttpRequest", "WebSocket", "eval("]) {
    assert(!planner.includes(forbidden), `NODE-28 planner must stay platform/local only: ${forbidden}`);
  }

  const runtime = text("apps/figma-plugin/src/figma-hybrid-renderer.ts");
  for (const evidence of [
    "applyFigmaHybridRaster",
    "rasterSafeLayoutTree",
    "figma.createImage",
    "figma.createFrame",
    "figma.createRectangle",
    "__W2F_RASTER_TILE__",
    "w2f.rasterTileId",
    "w2f.rasterTileSha256",
    "w2f.rasterReferenceId",
    "w2f.rasterSourceNodeId",
    "clipsContent = true",
    "missingTilePayloadCount",
    "keptNativeBoundaryCount",
    "nodes.delete(descendantId)",
  ]) {
    assert(runtime.includes(evidence), `NODE-28 Figma runtime missing ${evidence}`);
  }
  for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "eval(", "new Function("]) {
    assert(!runtime.includes(forbidden), `NODE-28 Figma runtime must remain local-only: ${forbidden}`);
  }

  const ui = text("apps/figma-plugin/src/ui.ts");
  for (const evidence of [
    "referenceTiles",
    "referenceTilePayloadsById",
    "parsed.binaryPayloads.get(tile.path)",
    "localRendererPayload",
  ]) {
    assert(ui.includes(evidence), `NODE-28 UI handoff missing ${evidence}`);
  }

  const main = text("apps/figma-plugin/src/main.ts");
  const visualIndex = main.indexOf("await applyFigmaVisuals");
  const hybridIndex = main.indexOf("applyFigmaHybridRaster");
  const layoutIndex = main.indexOf("applyFigmaLayouts");
  assert(visualIndex >= 0, "NODE-28 main must retain NODE-26 visual reconstruction");
  assert(hybridIndex > visualIndex, "NODE-28 raster execution must follow NODE-26 visual replacement");
  assert(layoutIndex > hybridIndex, "NODE-27 parent layout must run after raster boundary replacement");
  assert(main.includes("rasterSafeLayoutTree"), "NODE-28 must protect raster tile geometry from container layout");
  assert(main.includes("renderedRoot.remove()"), "NODE-28 fatal mutations must preserve full-root rollback");

  const plannerTests = text("packages/figma-renderer/test/hybrid-raster-planner.test.ts");
  for (const evidence of [
    "source-addressed packaged tile",
    "row-major local coordinates",
    "URL-sensitive source ids",
    "canvas/video reference kinds",
    "evidence is incomplete",
    "suppresses nested raster roots",
    "ignores native nodes",
  ]) {
    assert(plannerTests.includes(evidence), `NODE-28 planner tests missing ${evidence}`);
  }

  const packageValidator = text("apps/figma-plugin/scripts/validate-plugin-package.mjs");
  for (const evidence of [
    "__W2F_RASTER_TILE__",
    "w2f.rasterReferenceId",
    "referenceTilePayloadsById",
    "binaryPayloads.get(tile.path)",
  ]) {
    assert(packageValidator.includes(evidence), `NODE-28 package validator missing ${evidence}`);
  }

  const doc = text("docs/nodes/NODE-28_HYBRID_NATIVE_RASTER_RENDERER.md");
  for (const evidence of [
    "NODE-20 Compositing & Fallback Boundary",
    "Missing evidence policy",
    "Whole-page rasterization",
    "NODE-29",
  ]) {
    assert(doc.includes(evidence), `NODE-28 implementation doc missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-28 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-28 foundation validation passed.");
}
