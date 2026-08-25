import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/qa/types.ts",
  "packages/figma-renderer/src/qa/pixel.ts",
  "packages/figma-renderer/src/qa/structure.ts",
  "packages/figma-renderer/test/qa.test.ts",
  "apps/figma-plugin/src/figma-qa.ts",
  "apps/figma-plugin/src/main.ts",
  "docs/nodes/NODE-29_VISUAL_STRUCTURE_EDITABILITY_QA.md",
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
  const types = text("packages/figma-renderer/src/qa/types.ts");
  for (const evidence of [
    "W2F_NODE29_QA_VERSION",
    "deterministicVisualSimilarity: 0.99",
    "deterministicStructureScore: 0.95",
    "supportedEditableAreaRatio: 0.9",
    "supportedRasterAreaRatio: 0.15",
    "editableAreaRatio",
    "rasterAreaRatio",
  ]) {
    assert(types.includes(evidence), `NODE-29 QA types missing ${evidence}`);
  }

  const pixel = text("packages/figma-renderer/src/qa/pixel.ts");
  for (const evidence of [
    "compareRgbaPixels",
    "changedPixelRatio",
    "normalizedSimilarity",
    "evaluateVisualQa",
    "deterministicVisualSimilarity",
    "realisticVisualSimilarity",
  ]) {
    assert(pixel.includes(evidence), `NODE-29 pixel QA missing ${evidence}`);
  }

  const structure = text("packages/figma-renderer/src/qa/structure.ts");
  for (const evidence of [
    "evaluateStructureAndEditabilityQa",
    "mappingCompleteness",
    "parentCorrectness",
    "siblingOrderCorrectness",
    "metadataCorrectness",
    "editableAreaRatio",
    "rasterAreaRatio",
    "Unauthorized rasterization of native render node",
    "minimal-local-fallback",
  ]) {
    assert(structure.includes(evidence), `NODE-29 structure QA missing ${evidence}`);
  }

  const figmaQa = text("apps/figma-plugin/src/figma-qa.ts");
  for (const evidence of [
    "inspectFigmaSceneForQa",
    'return "raster"',
    'return "text"',
    'return "vector"',
    'return "image"',
    "nearestMappedParent",
    "siblingIndex",
  ]) {
    assert(figmaQa.includes(evidence), `NODE-29 Figma inspection missing ${evidence}`);
  }

  const main = text("apps/figma-plugin/src/main.ts");
  const qaIndex = main.indexOf("evaluateStructureAndEditabilityQa");
  const rasterIndex = main.indexOf("applyFigmaHybridRasterFallbacks");
  assert(qaIndex >= 0, "NODE-29 structure/editability QA is not wired into Figma import");
  assert(rasterIndex >= 0, "NODE-29 must preserve NODE-28 hybrid raster pass");
  for (const evidence of [
    "w2f.qa.structureStatus",
    "w2f.qa.structureScore",
    "w2f.qa.editableAreaRatio",
    "w2f.qa.rasterAreaRatio",
    "w2f.qa.failureCount",
    "inspectFigmaSceneForQa",
  ]) {
    assert(main.includes(evidence), `NODE-29 Figma runtime missing ${evidence}`);
  }

  const tests = text("packages/figma-renderer/test/qa.test.ts");
  for (const evidence of [
    "passes a fully mapped editable native hierarchy",
    "suppresses descendants only behind an explicit minimal raster boundary",
    "fails native text that was rasterized to improve pixel similarity",
    "returns 100% similarity for identical RGBA pixels",
    "reports deterministic visual regressions below the 99% contract",
  ]) {
    assert(tests.includes(evidence), `NODE-29 QA tests missing ${evidence}`);
  }

  const doc = text("docs/nodes/NODE-29_VISUAL_STRUCTURE_EDITABILITY_QA.md");
  for (const evidence of [
    "99%",
    "95%",
    "90%",
    "15%",
    "Anti-cheating",
    "No whole-page screenshot substitution",
    "NODE-30",
  ]) {
    assert(doc.includes(evidence), `NODE-29 contract doc missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-29 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-29 foundation validation passed.");
}
