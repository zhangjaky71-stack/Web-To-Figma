import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "packages/figma-capability-resolver/package.json",
  "packages/figma-capability-resolver/tsconfig.json",
  "packages/figma-capability-resolver/tsconfig.build.json",
  "packages/figma-capability-resolver/src/index.ts",
  "packages/figma-capability-resolver/src/types.ts",
  "packages/figma-capability-resolver/src/registry.ts",
  "packages/figma-capability-resolver/src/policy.ts",
  "packages/figma-capability-resolver/src/resolver.ts",
  "packages/figma-capability-resolver/test/resolver.test.ts",
  "docs/adr/ADR-0024-figma-capability-resolver.md",
  "docs/nodes/NODE-24_FIGMA_CAPABILITY_RESOLVER.md",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}
function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of required) assert(existsSync(resolve(root, path)), `missing ${path}`);

if (failures.length === 0) {
  const pkg = JSON.parse(text("packages/figma-capability-resolver/package.json"));
  assert(pkg.name === "@w2f/figma-capability-resolver", "NODE-24 package name drifted");
  assert(pkg.dependencies?.["@w2f/w2f-ir"] === "workspace:*", "resolver must consume W2F IR through workspace-only resolution");
  assert(!pkg.dependencies?.["@figma/plugin-typings"] && !pkg.devDependencies?.["@figma/plugin-typings"], "resolver policy package must not hard-bind Figma typings");

  const types = text("packages/figma-capability-resolver/src/types.ts");
  for (const evidence of [
    "NATIVE", "EMULATED", "WRAPPER", "ABSOLUTE", "RASTER", "UNSUPPORTED",
    "native", "emulated", "partial", "unsupported",
    "fidelity", "balanced", "design-friendly",
    "preservesRevisionMetadata", "preservesStableSourceMapping", 'tokenPolicy: "literal"',
  ]) assert(types.includes(evidence), `NODE-24 types missing ${evidence}`);

  const registry = text("packages/figma-capability-resolver/src/registry.ts");
  for (const evidence of [
    "figma-plugin-api-2026-08-24", 'pluginTypingsVersion: "1.134.0"',
    "autoLayout", "fillSizing", "hugSizing", "grid", "gridSpan", "minMaxSizing",
    "svgImport", "textMixedStyles", "absoluteInAutoLayout", "imageTransform",
    "layoutMode:GRID", "gridRowSpan", "minWidth", "figma.createNodeFromSvg",
    "setRangeFontName", "layoutPositioning:ABSOLUTE", "ImagePaint.imageTransform:CROP",
  ]) assert(registry.includes(evidence), `NODE-24 registry missing ${evidence}`);

  const policy = text("packages/figma-capability-resolver/src/policy.ts");
  assert(policy.includes("PROFILE_ORDER"), "NODE-24 must centralize RenderProfile ordering");
  assert(policy.includes('profile === "high-fidelity" ? "fidelity"'), "NODE-24 must normalize the NODE-22 Fidelity transport id");

  const resolver = text("packages/figma-capability-resolver/src/resolver.ts");
  for (const evidence of [
    "availableStrategies", "safetyBoundary", "resolveFigmaCapability", "resolveRenderNodeCapability",
    "preservesRevisionMetadata: true", "preservesStableSourceMapping: true", 'tokenPolicy: request.tokenPolicy ?? "literal"',
  ]) assert(resolver.includes(evidence), `NODE-24 resolver missing ${evidence}`);
  for (const forbidden of ["figma.", "@figma/plugin-typings", "createFrame(", "createRectangle("]) {
    assert(!policy.includes(forbidden) && !resolver.includes(forbidden), `NODE-24 policy must not create or directly probe Figma nodes: ${forbidden}`);
  }

  const tests = text("packages/figma-capability-resolver/test/resolver.test.ts");
  for (const outcome of ["NATIVE", "EMULATED", "WRAPPER", "ABSOLUTE", "RASTER", "UNSUPPORTED"]) {
    assert(tests.includes(`toBe(\"${outcome}\")`), `NODE-24 tests missing ${outcome} fixture`);
  }
  for (const evidence of ["high-fidelity", "design-friendly", "revisionHashes", "stable-a", 'toBe("literal")']) {
    assert(tests.includes(evidence), `NODE-24 tests missing ${evidence}`);
  }

  const nodeDoc = text("docs/nodes/NODE-24_FIGMA_CAPABILITY_RESOLVER.md");
  assert(nodeDoc.includes("Figma Capability Resolver"), "NODE-24 implementation doc missing");
  assert(nodeDoc.includes("NODE-28 executes raster fallback"), "NODE-24/NODE-28 raster boundary must remain explicit");
}

if (failures.length > 0) {
  console.error(`NODE-24 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-24 foundation validation passed.");
}
