import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = resolve("apps/figma-plugin/src/font-diagnostics.ts");
const packageRoot = resolve("apps/figma-plugin");
const finalBundlePath = resolve("apps/figma-plugin/dist/code.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function substitutionDiagnostic() {
  return {
    renderNodeId: "node31_font_geometry_runtime",
    start: 0,
    end: 8,
    requestedFamily: "Unavailable Geometry Sans",
    requestedStyle: "Bold",
    chosenFamily: "Inter",
    chosenStyle: "Regular",
    reason: "default-font",
  };
}

function geometryTextNode({ targetWidth = 120, targetHeight = 20, fontSize, naturalHeight }) {
  const pluginData = new Map();
  const fontSizeWrites = [];
  let width = targetWidth;
  let height = targetHeight;
  let currentFontSize = fontSize;
  let textAutoResize = "NONE";

  return {
    pluginData,
    fontSizeWrites,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get textAutoResize() {
      return textAutoResize;
    },
    set textAutoResize(value) {
      textAutoResize = value;
      if (value === "HEIGHT") height = naturalHeight(currentFontSize);
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },
    getRangeFontSize() {
      return currentFontSize;
    },
    setRangeFontSize(start, end, nextFontSize) {
      fontSizeWrites.push({ start, end, fontSize: nextFontSize });
      currentFontSize = nextFontSize;
      if (textAutoResize === "HEIGHT") height = naturalHeight(currentFontSize);
    },
    setPluginData(key, value) {
      pluginData.set(key, value);
    },
  };
}

const tempRoot = await mkdtemp(join(tmpdir(), "w2f-node31-font-geometry-"));
const compiledPath = join(tempRoot, "font-diagnostics.mjs");

try {
  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      "src/font-diagnostics.ts",
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node24",
      `--outfile=${compiledPath}`,
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );

  const [sourceBytes, compiledBytes, finalBundleBytes] = await Promise.all([
    readFile(sourcePath),
    readFile(compiledPath),
    readFile(finalBundlePath),
  ]);
  const finalBundle = finalBundleBytes.toString("utf8");
  for (const marker of [
    "w2f.font.geometryCorrectionVersion",
    "w2f.font.geometryCorrectionStatus",
    "w2f.font.geometryCorrection",
  ]) {
    assert(
      finalBundle.includes(marker),
      `Final plugin bundle is missing geometry marker: ${marker}`,
    );
  }

  const policy = await import(`${pathToFileURL(compiledPath).href}?node31=${Date.now()}`);
  assert(
    policy.W2F_FONT_GEOMETRY_CORRECTION_VERSION === "1.0.0",
    "Unexpected font geometry correction policy version",
  );

  const successNode = geometryTextNode({
    fontSize: 11,
    naturalHeight: (fontSize) => fontSize * 2,
  });
  policy.persistFontSubstitutionDiagnostics(successNode, [substitutionDiagnostic()]);
  const success = JSON.parse(successNode.pluginData.get("w2f.font.geometryCorrection") ?? "{}");
  assert(success.status === "corrected", `Expected corrected status, received ${success.status}`);
  assert(success.attempted === true, "Geometry drift did not trigger correction");
  assert(success.adjustedRangeCount === 1, "Exactly one substituted range must be corrected");
  assert(
    Math.abs(success.measuredHeightBefore - 22) < 1e-6,
    "Pre-correction height was not measured",
  );
  assert(Math.abs(success.measuredHeightAfter - 20) < 1e-6, "Corrected height was not remeasured");
  assert(success.errorRatioAfter <= 0.02, "Corrected geometry exceeds the 2% tolerance");
  assert(success.scale >= 0.85 && success.scale <= 1.15, "Correction scale escaped policy bounds");
  assert(
    successNode.width === 120 && successNode.height === 20,
    "Successful correction changed fixed bounds",
  );
  assert(
    successNode.textAutoResize === "NONE",
    "Successful correction did not restore fixed text sizing",
  );
  assert(
    successNode.fontSizeWrites.length === 1 &&
      successNode.fontSizeWrites[0].start === 0 &&
      successNode.fontSizeWrites[0].end === 8,
    "Correction was not limited to the substituted text range",
  );

  const failClosedNode = geometryTextNode({
    fontSize: 20,
    naturalHeight: (fontSize) => fontSize * 2,
  });
  policy.persistFontSubstitutionDiagnostics(failClosedNode, [substitutionDiagnostic()]);
  const failClosed = JSON.parse(
    failClosedNode.pluginData.get("w2f.font.geometryCorrection") ?? "{}",
  );
  assert(
    failClosed.status === "attempted-unvalidated",
    `Uncorrectable geometry must fail closed, received ${failClosed.status}`,
  );
  assert(failClosed.scale === 0.85, "Uncorrectable geometry did not respect lower scale bound");
  assert(failClosed.errorRatioAfter > 0.02, "Unvalidated correction incorrectly claims tolerance");
  assert(
    failClosedNode.width === 120 && failClosedNode.height === 20,
    "Fail-closed correction changed fixed bounds",
  );
  assert(
    failClosedNode.textAutoResize === "NONE",
    "Fail-closed correction did not restore fixed text sizing",
  );
  assert(
    !failClosedNode.pluginData.has("w2f.raster.reason"),
    "Geometry correction failure must not silently authorize raster text",
  );

  const toleranceNode = geometryTextNode({
    fontSize: 10.1,
    naturalHeight: (fontSize) => fontSize * 2,
  });
  policy.persistFontSubstitutionDiagnostics(toleranceNode, [substitutionDiagnostic()]);
  const tolerance = JSON.parse(toleranceNode.pluginData.get("w2f.font.geometryCorrection") ?? "{}");
  assert(
    tolerance.status === "within-tolerance",
    `Small geometry drift should remain within tolerance, received ${tolerance.status}`,
  );
  assert(tolerance.attempted === false, "Within-tolerance geometry must not be rescaled");
  assert(toleranceNode.fontSizeWrites.length === 0, "Within-tolerance geometry changed font size");
  assert(
    toleranceNode.width === 120 && toleranceNode.height === 20,
    "Within-tolerance path changed fixed bounds",
  );

  assert(
    policy.fontGeometryCorrectionScale(20, 40) === 0.85 &&
      policy.fontGeometryCorrectionScale(20, 10) === 1.15,
    "Geometry correction bounds are not deterministic",
  );

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        evidenceType: "node31-font-geometry-policy-runtime",
        status: "PASS",
        productionSource: "apps/figma-plugin/src/font-diagnostics.ts",
        finalPluginArtifact: "apps/figma-plugin/dist/code.js",
        productionSourceSha256: sha256(sourceBytes),
        compiledPolicySha256: sha256(compiledBytes),
        finalPluginSha256: sha256(finalBundleBytes),
        hostBoundary: {
          figmaApi: "simulated-text-metrics",
          note: "The production font geometry policy is compiled with the plugin package's pinned esbuild and executed against a deterministic narrow TextNode metric simulator. The final built plugin bundle is independently checked for the production geometry diagnostic markers. This does not claim Figma Desktop font rasterization or metric parity.",
        },
        assertions: [
          "production-policy-version-is-1.0.0",
          "final-plugin-bundle-contains-geometry-policy-markers",
          "fallback-natural-height-measured-before-correction",
          "drift-over-two-percent-triggers-correction",
          "correction-scale-bounded-between-0.85-and-1.15",
          "only-substituted-range-font-size-adjusted",
          "successful-correction-remeasured-within-two-percent",
          "successful-correction-restores-exact-fixed-bounds",
          "uncorrectable-drift-emits-attempted-unvalidated",
          "uncorrectable-drift-restores-exact-fixed-bounds",
          "geometry-failure-does-not-authorize-raster-text",
          "within-tolerance-drift-does-not-rescale-text",
        ],
        provesP0Items: ["geometry-preserving-correction-policy"],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
