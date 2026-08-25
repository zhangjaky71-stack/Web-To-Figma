import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/transaction.ts",
  "packages/figma-renderer/test/raster-boundary.test.ts",
  "apps/figma-plugin/src/protocol.ts",
  "apps/figma-plugin/src/raster-payload.ts",
  "apps/figma-plugin/src/figma-hybrid-renderer.ts",
  "apps/figma-plugin/test/hybrid-raster.test.ts",
  "apps/figma-plugin/src/main.ts",
  "docs/nodes/NODE-28_HYBRID_NATIVE_RASTER_RENDERER.md",
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
  const transaction = text("packages/figma-renderer/src/transaction.ts");
  for (const evidence of [
    "rasterBoundaryIds",
    "suppressedRenderNodeIds",
    'nodePlan.renderStrategy === "raster"',
    "adapter.createFrame()",
  ]) {
    assert(transaction.includes(evidence), `NODE-28 transaction missing ${evidence}`);
  }

  const protocol = text("apps/figma-plugin/src/protocol.ts");
  for (const evidence of [
    "W2F_RASTER_REFERENCE_KINDS",
    '"node-fallback"',
    '"canvas"',
    '"webgl"',
    '"video-frame"',
    "rasterReferences",
    "rasterTilePayloadsByPath",
    "isW2fRasterReferenceEvidence",
  ]) {
    assert(protocol.includes(evidence), `NODE-28 protocol missing ${evidence}`);
  }
  for (const forbiddenKind of ['"viewport"', '"full-page"']) {
    const kindsBlock = protocol.slice(
      protocol.indexOf("W2F_RASTER_REFERENCE_KINDS"),
      protocol.indexOf("] as const", protocol.indexOf("W2F_RASTER_REFERENCE_KINDS")),
    );
    assert(
      !kindsBlock.includes(forbiddenKind),
      `NODE-28 fallback protocol must not allow ${forbiddenKind}`,
    );
  }

  const payload = text("apps/figma-plugin/src/raster-payload.ts");
  for (const evidence of [
    "manifest.entrypoints.referenceTiles",
    "parsed.jsonPayloads.get",
    "parsed.binaryPayloads.get",
    'node.renderStrategy === "raster"',
    "rasterSourceNodeIds",
  ]) {
    assert(payload.includes(evidence), `NODE-28 raster payload missing ${evidence}`);
  }

  const hybrid = text("apps/figma-plugin/src/figma-hybrid-renderer.ts");
  for (const evidence of [
    "effectiveSelectedRootIds",
    "nearestRasterBoundary",
    "renderTreeForNativePass",
    "sourceNodeIds",
    "containsBounds",
    "createHybridRasterPlan",
    "applyFigmaHybridRasterFallbacks",
    'target.layoutMode = "NONE"',
    "target.clipsContent = true",
    "figma.createImage(bytes)",
    "figma.createRectangle()",
    'mode, "minimal-local-fallback"',
  ]) {
    assert(hybrid.includes(evidence), `NODE-28 hybrid renderer missing ${evidence}`);
  }
  for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "eval(", "new Function("]) {
    assert(
      !hybrid.includes(forbidden),
      `NODE-28 hybrid renderer must stay local/safe: ${forbidden}`,
    );
    assert(
      !payload.includes(forbidden),
      `NODE-28 raster payload must stay local/safe: ${forbidden}`,
    );
  }

  const main = text("apps/figma-plugin/src/main.ts");
  const visualIndex = main.indexOf("await applyFigmaVisuals");
  const layoutIndex = main.indexOf("const layout = applyFigmaLayouts");
  const rasterIndex = main.indexOf("const raster = applyFigmaHybridRasterFallbacks", layoutIndex);
  assert(visualIndex >= 0, "NODE-28 must preserve editable NODE-26 visual reconstruction");
  assert(layoutIndex > visualIndex, "NODE-28 must preserve NODE-27 layout after visuals");
  assert(rasterIndex > layoutIndex, "NODE-28 raster materialization must run after native layout");
  assert(
    main.includes("renderedRoot.remove()"),
    "NODE-28 failures/cancellation must preserve full-root rollback",
  );

  const rendererTests = text("packages/figma-renderer/test/raster-boundary.test.ts");
  for (const evidence of [
    "suppresses only its native descendants",
    "whole import root is the raster boundary",
  ]) {
    assert(rendererTests.includes(evidence), `NODE-28 renderer tests missing ${evidence}`);
  }

  const pluginTests = text("apps/figma-plugin/test/hybrid-raster.test.ts");
  for (const evidence of [
    "nearest minimal raster boundary",
    "source-scoped local evidence",
    "does not cover the fallback boundary",
    "rejects full-page evidence",
  ]) {
    assert(pluginTests.includes(evidence), `NODE-28 plugin tests missing ${evidence}`);
  }

  const doc = text("docs/nodes/NODE-28_HYBRID_NATIVE_RASTER_RENDERER.md");
  for (const evidence of [
    "No whole-page screenshot substitution",
    "Minimal safe boundary only",
    "Source-bound evidence only",
    "Fail closed",
    "NODE-29",
  ]) {
    assert(doc.includes(evidence), `NODE-28 contract doc missing ${evidence}`);
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
