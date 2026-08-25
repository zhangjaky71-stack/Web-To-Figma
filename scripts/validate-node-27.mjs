import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-renderer/src/layout/types.ts",
  "packages/figma-renderer/src/layout/planner.ts",
  "packages/figma-renderer/test/layout-planner.test.ts",
  "apps/figma-plugin/src/figma-layout-renderer.ts",
  "apps/figma-plugin/src/main.ts",
  "docs/nodes/NODE-27_FIGMA_RESPONSIVE_LAYOUT_RENDERER.md",
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
  const types = text("packages/figma-renderer/src/layout/types.ts");
  for (const evidence of [
    "W2fAutoLayoutPlan",
    "W2fAutoLayoutChildPlan",
    "W2fGridLayoutPlan",
    "W2fGridChildPlan",
    '"FIXED"',
    '"HUG"',
    '"FILL"',
  ]) {
    assert(types.includes(evidence), `NODE-27 layout types missing ${evidence}`);
  }

  const planner = text("packages/figma-renderer/src/layout/planner.ts");
  for (const evidence of [
    "createAutoLayoutPlan",
    "createGridLayoutPlan",
    "nativeCompatible",
    "flex-wrap:wrap-reverse",
    "vertical flex wrapping",
    "grid-auto-flow",
    "minmax",
    "absolutePositioned",
    "counterAxisStretch",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
  ]) {
    assert(planner.includes(evidence), `NODE-27 planner missing ${evidence}`);
  }
  for (const forbidden of ["figma.", "fetch(", "XMLHttpRequest", "WebSocket", "eval("]) {
    assert(
      !planner.includes(forbidden),
      `NODE-27 planner must remain platform/local only: ${forbidden}`,
    );
  }

  const runtime = text("apps/figma-plugin/src/figma-layout-renderer.ts");
  for (const evidence of [
    "createAutoLayoutPlan",
    "createGridLayoutPlan",
    "layoutMode",
    'layoutPositioning = "ABSOLUTE"',
    "layoutSizingHorizontal",
    "layoutSizingVertical",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    'frame.layoutMode = "GRID"',
    "gridColumnSizes",
    "gridRowSizes",
    "setGridChildPosition",
    "gridRowSpan",
    "gridColumnSpan",
    "skippedIncompatibleFlexCount",
    "skippedIncompatibleGridCount",
  ]) {
    assert(runtime.includes(evidence), `NODE-27 Figma runtime missing ${evidence}`);
  }
  for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "eval(", "new Function("]) {
    assert(!runtime.includes(forbidden), `NODE-27 runtime must remain local/safe: ${forbidden}`);
  }

  const main = text("apps/figma-plugin/src/main.ts");
  const visualIndex = main.indexOf("await applyFigmaVisuals");
  const layoutIndex = main.indexOf("const layout = applyFigmaLayouts");
  assert(visualIndex >= 0, "NODE-27 main must keep NODE-26 visual reconstruction");
  assert(layoutIndex > visualIndex, "NODE-27 layout must run after NODE-26 node replacement");
  assert(
    main.includes("renderedRoot.remove()"),
    "NODE-27 failures/cancellation must preserve full-root rollback",
  );

  const tests = text("packages/figma-renderer/test/layout-planner.test.ts");
  for (const evidence of [
    "horizontal flex container",
    "unsupported vertical wrapping",
    "flex-grow",
    "absolute children",
    "unsupported flex semantics",
    "fixed/fr tracks",
    "numeric CSS grid lines and spans",
    "minmax(0, Nfr)",
    "intrinsic/named/column-flow Grid semantics",
  ]) {
    assert(tests.includes(evidence), `NODE-27 tests missing ${evidence}`);
  }

  const doc = text("docs/nodes/NODE-27_FIGMA_RESPONSIVE_LAYOUT_RENDERER.md");
  for (const evidence of ["Flex", "Grid", "NODE-28", "NODE-29", "silently approximated"]) {
    assert(doc.includes(evidence), `NODE-27 contract doc missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-27 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-27 foundation validation passed.");
}
