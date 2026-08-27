import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_861.json";
const runtimeEvidencePath = "docs/qa/results/NODE-31_BROWSER_RUNTIME_EVIDENCE_764.json";
const fontEvidencePath = "docs/qa/results/NODE-31_FONT_EVIDENCE_781.json";
const pixelEvidencePath = "docs/qa/results/NODE-31_PIXEL_GROUND_TRUTH_EVIDENCE_798.json";
const standardCaptureEvidencePath =
  "docs/qa/results/NODE-31_STANDARD_CAPTURE_RUNTIME_EVIDENCE_847.json";
const pluginUiEvidencePath = "docs/qa/results/NODE-31_PLUGIN_UI_EVIDENCE_847.json";
const pluginCanvasEvidencePath = "docs/qa/results/NODE-31_PLUGIN_CANVAS_DROP_EVIDENCE_861.json";

const runtimeHarnessPath = "scripts/run-node-31-browser-runtime.mjs";
const runtimeProductSourcePath = "apps/browser-extension/src/runtime/content-script.ts";
const runtimeBuiltArtifactPath = "apps/browser-extension/dist/runtime/content-script.js";

const fontResolutionPath = "apps/figma-plugin/src/font-resolution.ts";
const fontDiagnosticsPath = "apps/figma-plugin/src/font-diagnostics.ts";
const fontRendererPath = "apps/figma-plugin/src/figma-visual-renderer.ts";
const fontResolutionTestPath = "apps/figma-plugin/test/font-resolution.test.ts";
const fontDiagnosticsTestPath = "apps/figma-plugin/test/font-diagnostics.test.ts";

const pixelRuntimePath = "apps/browser-extension/src/runtime/pixel-ground-truth-runtime.ts";
const pixelContractPath = "apps/browser-extension/src/runtime/pixel-ground-truth-contract.ts";
const profilePackagePath = "apps/browser-extension/src/runtime/profile-compliant-wtf-package.ts";
const wtfExportRuntimePath = "apps/browser-extension/src/runtime/wtf-export-runtime.ts";
const wtfPackageBuilderPath = "apps/browser-extension/src/runtime/wtf-package-builder.ts";
const pixelIntegrationTestPath =
  "apps/browser-extension/test/profile-compliant-wtf-package.test.ts";
const pixelRuntimeTestPath = "apps/browser-extension/test/pixel-ground-truth-runtime.test.ts";
const node21PackageValidatorPath = "apps/browser-extension/scripts/validate-node-21-package.mjs";

const standardCaptureHarnessPath = "scripts/run-node-31-standard-capture-runtime.mjs";
const standardCaptureSourcePath = "packages/standard-capture-adapter/src/capture.ts";
const standardCaptureBuiltArtifactPath =
  "apps/browser-extension/dist/runtime/standard-capture-adapter/capture.js";
const corpusValidatorPath = "scripts/validate-node-31-corpus.mjs";
const shadowFixturePath = "qa/corpus/node31/class-b/shadow-dom.html";
const iframeFixturePath = "qa/corpus/node31/class-b/iframe.html";
const p0StandardFixturePath = "qa/corpus/node31/p0/standard-capture-runtime.html";
const standardCaptureTestPath = "packages/standard-capture-adapter/test/capture-contract.test.ts";
const pluginUiHarnessPath = "scripts/run-node-31-plugin-ui-runtime.mjs";
const pluginUiStaticPath = "apps/figma-plugin/static/ui.html";
const pluginUiSourcePath = "apps/figma-plugin/src/ui.ts";
const pluginUiIntakePath = "apps/figma-plugin/src/intake-state.ts";
const pluginCanvasHarnessPath = "scripts/run-node-31-plugin-canvas-drop-runtime.mjs";
const pluginMainSourcePath = "apps/figma-plugin/src/main.ts";

const requiredIds = {
  capture: [
    "current-document-deterministic-online",
    "file-protocol-explicit-permission",
    "local-folder-relative-asset-resolution",
    "region-intersections-and-structural-ancestors",
    "document-and-primary-app-scroll-root-semantics",
    "open-shadow-dom-slot-composed-tree",
    "same-origin-iframe",
    "inaccessible-cross-origin-frame-diagnostic",
    "visual-state-freeze-and-restore",
    "finally-scroll-focus-temporary-style-restore",
  ],
  packageAcceptance: [
    "canonical-container-manifest-checksums-determinism",
    "malicious-package-fails-before-render",
    "profile-required-pixel-ground-truth-end-to-end",
  ],
  importAcceptance: [
    "choose-file-path",
    "drop-on-canvas-path",
    "secure-parse-before-render",
    "temporary-import-root-transaction",
    "rollback-on-fatal-error",
    "meaningful-layer-naming",
    "source-mapping-plugin-data",
    "render-strategy-diagnostics",
    "section-selective-import",
    "viewport-selection-and-focus-after-commit",
  ],
  fontAcceptance: [
    "exact-available-font-preferred",
    "nearest-mapping-with-diagnostic",
    "geometry-preserving-correction-policy",
    "raster-text-only-when-policy-justifies",
  ],
};

const expectedBlockingIds = [
  "file-protocol-explicit-permission",
  "visual-state-freeze-and-restore",
  "geometry-preserving-correction-policy",
  "raster-text-only-when-policy-justifies",
].sort();

const expectedRuntimeAssertions = [
  "cancel-restores-scroll",
  "cancel-restores-focus",
  "cancel-restores-inline-scroll-behavior",
  "cancel-removes-selector-overlay",
  "confirm-restores-scroll",
  "confirm-restores-focus",
  "confirm-restores-inline-scroll-behavior",
  "confirm-removes-selector-overlay",
  "confirm-returns-region-result",
].sort();

const expectedStandardCaptureAssertions = [
  "open-shadow-root-captured",
  "shadow-host-relationship-preserved",
  "named-slot-captured",
  "slotted-light-dom-source-parent-preserved",
  "slotted-light-dom-composed-parent-remapped",
  "slotted-light-dom-assigned-slot-id-preserved",
  "shadow-root-editable-text-captured",
  "same-origin-iframe-accessible-child-frame-captured",
  "same-origin-iframe-root-linked-to-boundary",
  "same-origin-iframe-editable-text-captured",
  "same-origin-iframe-no-inaccessible-diagnostic",
  "current-http-document-capture-repeat-10-normalized-identical",
  "document-scroll-root-live-position-preserved",
  "primary-app-scroll-root-identified",
  "primary-app-scroll-root-live-position-preserved",
  "cross-origin-iframe-inaccessible-frame-recorded",
  "cross-origin-iframe-diagnostic-linked-to-boundary",
  "cross-origin-iframe-no-editable-child-subtree-fabricated",
  "region-partial-intersection-retained",
  "region-geometry-free-structural-ancestor-retained",
  "region-non-intersecting-sibling-excluded",
  "region-relationship-closure-preserved",
].sort();

const expectedPluginUiAssertions = [
  "choose-button-opens-native-single-file-chooser",
  "native-file-input-receives-real-wtf-file",
  "intake-metadata-preserves-choose-source",
  "secure-parser-reaches-preview-ready",
  "secure-parser-preview-exposes-render-and-section-counts",
  "import-enabled-only-after-secure-parse",
  "choose-flow-emits-no-runtime-error",
  "parsed-render-tree-handoff-preserved",
  "parsed-source-graph-handoff-preserved",
  "render-request-emitted-after-user-import-action",
].sort();

const expectedPluginCanvasAssertions = [
  "final-main-registers-figma-canvas-drop-handler",
  "non-wtf-canvas-drop-passes-through-without-byte-read",
  "wtf-canvas-drop-consumed-by-plugin",
  "canvas-drop-file-bytes-read-once",
  "canvas-drop-bytes-forwarded-main-to-final-ui",
  "canvas-drop-source-preserved",
  "canvas-drop-absolute-point-preserved-in-intake-metadata",
  "canvas-drop-byte-length-preserved",
  "canvas-drop-secure-parser-reaches-preview-ready",
  "canvas-drop-import-disabled-until-secure-parse-completes",
  "canvas-drop-source-and-rounded-point-visible-in-ui",
  "trusted-import-pointer-emits-render-request",
  "canvas-drop-intake-identity-preserved-to-render-request",
  "canvas-drop-destination-preserved-to-render-request",
  "canvas-drop-parsed-render-tree-handoff-preserved",
  "canvas-drop-parsed-source-graph-handoff-preserved",
].sort();

const p0BoundaryIds = [
  ...expectedBlockingIds,
  "finally-scroll-focus-temporary-style-restore",
  "profile-required-pixel-ground-truth-end-to-end",
  "exact-available-font-preferred",
  "nearest-mapping-with-diagnostic",
];

const releaseBoundaries = [
  "zero-known-critical-security-blockers",
  "zero-known-high-security-blockers",
  "class-a-visual-geometry-text-asset-structure-measurements",
  "class-b-browser-to-wtf-to-figma-measurements",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    failures.push(`invalid JSON ${path}: ${String(error)}`);
    return null;
  }
}

function requireFiles(paths) {
  for (const path of paths) {
    assert(existsSync(resolve(root, path)), `missing ${path}`);
  }
}

function assertArrayEquals(actual, expected, message) {
  const normalizedActual = Array.isArray(actual) ? [...actual].sort() : [];
  const normalizedExpected = [...expected].sort();
  assert(JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected), message);
}

function assertIncludesAll(actual, expected, label) {
  const values = new Set(Array.isArray(actual) ? actual : []);
  for (const item of expected) {
    assert(values.has(item), `${label} missing ${item}`);
  }
}

function assertQualityChecks(evidence, checks, label) {
  for (const check of checks) {
    assert(evidence?.ci?.qualityChecks?.[check] === "PASS", `${label} missing PASS ${check}`);
  }
}

function validateAuditSection(audit, sectionName, ids, allItems) {
  const entries = Array.isArray(audit?.[sectionName]) ? audit[sectionName] : [];
  const byId = new Map();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    assert(id.length > 0, `${sectionName} contains an entry without id`);
    assert(!byId.has(id), `${sectionName} duplicates ${id}`);
    byId.set(id, entry);
    assert(
      entry?.status === "PASS" || entry?.status === "UNAVAILABLE" || entry?.status === "FAIL",
      `${sectionName}/${id} has invalid status`,
    );
    assert(entry?.status !== "FAIL", `${sectionName}/${id} is a blocking FAIL`);
    assert(
      typeof entry?.reason === "string" && entry.reason.trim().length > 0,
      `${sectionName}/${id} must explain its evidence status`,
    );
    const artifacts = Array.isArray(entry?.sourceArtifacts) ? entry.sourceArtifacts : [];
    assert(artifacts.length > 0, `${sectionName}/${id} must name sourceArtifacts`);
    requireFiles(artifacts);
    allItems.push(entry);
  }
  for (const id of ids) {
    assert(byId.has(id), `${sectionName} missing required P0 item ${id}`);
  }
  assert(entries.length === ids.length, `${sectionName} contains undeclared or missing P0 items`);
}

requireFiles([
  manifestPath,
  auditPath,
  runtimeEvidencePath,
  fontEvidencePath,
  pixelEvidencePath,
  standardCaptureEvidencePath,
  pluginUiEvidencePath,
  pluginCanvasEvidencePath,
  runtimeHarnessPath,
  runtimeProductSourcePath,
  fontResolutionPath,
  fontDiagnosticsPath,
  fontRendererPath,
  fontResolutionTestPath,
  fontDiagnosticsTestPath,
  pixelRuntimePath,
  pixelContractPath,
  profilePackagePath,
  wtfExportRuntimePath,
  wtfPackageBuilderPath,
  pixelIntegrationTestPath,
  pixelRuntimeTestPath,
  node21PackageValidatorPath,
  standardCaptureHarnessPath,
  standardCaptureSourcePath,
  corpusValidatorPath,
  shadowFixturePath,
  iframeFixturePath,
  p0StandardFixturePath,
  standardCaptureTestPath,
  pluginUiHarnessPath,
  pluginUiStaticPath,
  pluginUiSourcePath,
  pluginUiIntakePath,
  pluginCanvasHarnessPath,
  pluginMainSourcePath,
]);

const manifest = readJson(manifestPath);
const audit = readJson(auditPath);
const runtimeEvidence = readJson(runtimeEvidencePath);
const fontEvidence = readJson(fontEvidencePath);
const pixelEvidence = readJson(pixelEvidencePath);
const standardCaptureEvidence = readJson(standardCaptureEvidencePath);
const pluginUiEvidence = readJson(pluginUiEvidencePath);
const pluginCanvasEvidence = readJson(pluginCanvasEvidencePath);

if (runtimeEvidence) {
  assert(runtimeEvidence.version === "1.0.0", "browser runtime evidence version mismatch");
  assert(
    runtimeEvidence.evidenceType === "node31-browser-runtime",
    "browser runtime evidenceType mismatch",
  );
  assert(runtimeEvidence.status === "PASS", "browser runtime evidence must PASS");
  assert(runtimeEvidence.ci?.runNumber === 764, "browser runtime must identify CI #764");
  assert(runtimeEvidence.ci?.runId === 32830737350, "browser runtime run id mismatch");
  assert(runtimeEvidence.ci?.jobId === 97748603856, "browser runtime job id mismatch");
  assert(
    runtimeEvidence.ci?.branchHead === "c5b3cbdbd0326951ceb23ff2271055c9acbaad19",
    "browser runtime branch head mismatch",
  );
  assert(
    runtimeEvidence.ci?.mergeRef === "b4603e0e74e9b3c00f7355d01db9d710e9af7c74",
    "browser runtime merge ref mismatch",
  );
  assertQualityChecks(
    runtimeEvidence,
    [
      "node31Validator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "format",
    ],
    "browser runtime",
  );
  assert(
    runtimeEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "browser runtime Chrome mismatch",
  );
  assert(
    runtimeEvidence.harnessArtifact === runtimeHarnessPath,
    "browser runtime harness mismatch",
  );
  assert(
    runtimeEvidence.productSourceArtifact === runtimeProductSourcePath,
    "browser runtime source mismatch",
  );
  assert(
    runtimeEvidence.loadedBuiltArtifact === runtimeBuiltArtifactPath,
    "browser runtime built artifact mismatch",
  );
  assertArrayEquals(
    runtimeEvidence.assertions,
    expectedRuntimeAssertions,
    "browser runtime assertion set mismatch",
  );
  assertArrayEquals(
    runtimeEvidence.provesP0Items,
    ["finally-scroll-focus-temporary-style-restore"],
    "browser runtime must prove exactly the cleanup P0 item",
  );
  assertIncludesAll(
    runtimeEvidence.notProvenByThisArtifact,
    [
      "current-document-deterministic-online",
      "file-protocol-explicit-permission",
      "visual-state-freeze-and-restore",
      ...releaseBoundaries,
    ],
    "browser runtime not-proven boundary",
  );
}

if (fontEvidence) {
  assert(fontEvidence.version === "1.0.0", "font evidence version mismatch");
  assert(fontEvidence.evidenceType === "node31-font-policy", "font evidenceType mismatch");
  assert(fontEvidence.status === "PASS", "font evidence must PASS");
  assert(fontEvidence.ci?.runNumber === 781, "font evidence must identify CI #781");
  assert(fontEvidence.ci?.runId === 32833779725, "font evidence run id mismatch");
  assert(fontEvidence.ci?.jobId === 97758035952, "font evidence job id mismatch");
  assert(
    fontEvidence.ci?.branchHead === "50d234bf977741a31b99b53f5bf579698c5d64c5",
    "font evidence branch head mismatch",
  );
  assert(
    fontEvidence.ci?.mergeRef === "c2210996b4a40317102d3967275544db738f3baa",
    "font evidence merge ref mismatch",
  );
  assertQualityChecks(
    fontEvidence,
    [
      "node31Validator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "figmaPluginPackage",
      "browserRuntime",
      "format",
    ],
    "font evidence",
  );
  assertIncludesAll(
    fontEvidence.sourceArtifacts,
    [fontResolutionPath, fontDiagnosticsPath, fontRendererPath],
    "font evidence source",
  );
  const fontTests = new Map(
    (Array.isArray(fontEvidence.testArtifacts) ? fontEvidence.testArtifacts : []).map((entry) => [
      entry?.path,
      entry,
    ]),
  );
  assert(
    fontTests.get(fontResolutionTestPath)?.testCount === 5 &&
      fontTests.get(fontResolutionTestPath)?.status === "PASS",
    "font resolution test evidence mismatch",
  );
  assert(
    fontTests.get(fontDiagnosticsTestPath)?.testCount === 2 &&
      fontTests.get(fontDiagnosticsTestPath)?.status === "PASS",
    "font diagnostics test evidence mismatch",
  );
  assert(
    fontEvidence.figmaPluginSuite?.testFiles === 6 &&
      fontEvidence.figmaPluginSuite?.testCount === 25 &&
      fontEvidence.figmaPluginSuite?.status === "PASS",
    "font evidence Figma suite mismatch",
  );
  assertArrayEquals(
    fontEvidence.provesP0Items,
    ["exact-available-font-preferred", "nearest-mapping-with-diagnostic"],
    "font evidence must prove exactly two intended P0 items",
  );
  assertIncludesAll(
    fontEvidence.notProvenByThisArtifact,
    [
      "geometry-preserving-correction-policy",
      "raster-text-only-when-policy-justifies",
      ...releaseBoundaries,
    ],
    "font evidence not-proven boundary",
  );
}

if (pixelEvidence) {
  assert(pixelEvidence.version === "1.0.0", "Pixel evidence version mismatch");
  assert(
    pixelEvidence.evidenceType === "node31-profile-pixel-ground-truth",
    "Pixel evidenceType mismatch",
  );
  assert(pixelEvidence.status === "PASS", "Pixel evidence must PASS");
  assert(pixelEvidence.ci?.runNumber === 798, "Pixel evidence must identify CI #798");
  assert(pixelEvidence.ci?.runId === 32852849393, "Pixel evidence run id mismatch");
  assert(pixelEvidence.ci?.jobId === 97817648113, "Pixel evidence job id mismatch");
  assert(
    pixelEvidence.ci?.branchHead === "281b193027202eaea4a0b4ca9c21bf8e15e66c06",
    "Pixel evidence branch head mismatch",
  );
  assert(
    pixelEvidence.ci?.mergeRef === "8ae000a9adc256c006cbd0844a258bad067820c3",
    "Pixel evidence merge ref mismatch",
  );
  assertQualityChecks(
    pixelEvidence,
    [
      "node31Validator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "format",
    ],
    "Pixel evidence",
  );
  assertIncludesAll(
    pixelEvidence.sourceArtifacts,
    [
      pixelRuntimePath,
      pixelContractPath,
      profilePackagePath,
      wtfExportRuntimePath,
      wtfPackageBuilderPath,
      node21PackageValidatorPath,
    ],
    "Pixel evidence source",
  );
  const pixelTests = new Map(
    (Array.isArray(pixelEvidence.testArtifacts) ? pixelEvidence.testArtifacts : []).map((entry) => [
      entry?.path,
      entry,
    ]),
  );
  assert(
    pixelTests.get(pixelIntegrationTestPath)?.testCount === 4 &&
      pixelTests.get(pixelIntegrationTestPath)?.status === "PASS",
    "Pixel integration test evidence mismatch",
  );
  assert(
    pixelTests.get(pixelRuntimeTestPath)?.testCount === 4 &&
      pixelTests.get(pixelRuntimeTestPath)?.status === "PASS",
    "Pixel runtime test evidence mismatch",
  );
  assert(
    pixelEvidence.browserExtensionSuite?.testFiles === 27 &&
      pixelEvidence.browserExtensionSuite?.testCount === 74 &&
      pixelEvidence.browserExtensionSuite?.status === "PASS",
    "Pixel browser extension suite mismatch",
  );
  for (const profile of ["standard", "highFidelity"]) {
    const validation = pixelEvidence.packageValidation?.[profile];
    assert(validation?.extension === "PASS", `Pixel ${profile} extension package must PASS`);
    assert(validation?.node14PixelGroundTruth === "PASS", `Pixel ${profile} NODE-14 must PASS`);
    assert(validation?.node21WtfExport === "PASS", `Pixel ${profile} NODE-21 must PASS`);
  }
  assertArrayEquals(
    pixelEvidence.provesP0Items,
    ["profile-required-pixel-ground-truth-end-to-end"],
    "Pixel evidence must prove exactly the intended P0 item",
  );
  assertIncludesAll(
    pixelEvidence.notProvenByThisArtifact,
    ["open-shadow-dom-slot-composed-tree", "same-origin-iframe", ...releaseBoundaries],
    "Pixel evidence not-proven boundary",
  );
}

if (standardCaptureEvidence) {
  assert(standardCaptureEvidence.version === "1.1.0", "Standard capture evidence version mismatch");
  assert(
    standardCaptureEvidence.evidenceType === "node31-standard-capture-browser-runtime",
    "Standard capture evidenceType mismatch",
  );
  assert(standardCaptureEvidence.status === "PASS", "Standard capture evidence must PASS");
  assert(standardCaptureEvidence.ci?.runNumber === 847, "Standard capture must identify CI #847");
  assert(standardCaptureEvidence.ci?.runId === 33049035729, "Standard capture run id mismatch");
  assert(standardCaptureEvidence.ci?.jobId === 98439753613, "Standard capture job id mismatch");
  assert(
    standardCaptureEvidence.ci?.branchHead === "a563cf2046b613d64ba7402034979c70e567bd7a",
    "Standard capture branch head mismatch",
  );
  assert(
    standardCaptureEvidence.ci?.mergeRef === "778f68f85c9b4032b39dc8053c7496a743fe5322",
    "Standard capture merge ref mismatch",
  );
  assert(
    standardCaptureEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "Standard capture base mismatch",
  );
  assertQualityChecks(
    standardCaptureEvidence,
    [
      "node31Validator",
      "node31CorpusValidator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "standardCaptureRuntime",
      "pluginUiChooseFileRuntime",
      "format",
    ],
    "Standard capture evidence",
  );
  assert(
    standardCaptureEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "Standard capture Chrome mismatch",
  );
  assert(standardCaptureEvidence.environment?.node === "24.19.0", "Standard capture Node mismatch");
  assert(standardCaptureEvidence.environment?.pnpm === "11.22.0", "Standard capture pnpm mismatch");
  assert(
    standardCaptureEvidence.harnessArtifact === standardCaptureHarnessPath,
    "Standard capture harness mismatch",
  );
  assert(
    standardCaptureEvidence.loadedBuiltArtifact === standardCaptureBuiltArtifactPath,
    "Standard capture built artifact mismatch",
  );
  assertArrayEquals(
    standardCaptureEvidence.fixtureArtifacts,
    [shadowFixturePath, iframeFixturePath, p0StandardFixturePath],
    "Standard capture fixture set mismatch",
  );
  assertIncludesAll(
    standardCaptureEvidence.supportingSourceArtifacts,
    [standardCaptureSourcePath, standardCaptureTestPath, corpusValidatorPath],
    "Standard capture source",
  );
  assert(
    Array.isArray(standardCaptureEvidence.transportBoundary?.mocked) &&
      standardCaptureEvidence.transportBoundary.mocked.length === 0,
    "Standard capture runtime must not mock the capture boundary",
  );
  assertArrayEquals(
    standardCaptureEvidence.assertions,
    expectedStandardCaptureAssertions,
    "Standard capture assertion set mismatch",
  );
  assert(
    standardCaptureEvidence.suiteEvidence?.browserExtension?.testFiles === 27 &&
      standardCaptureEvidence.suiteEvidence?.browserExtension?.testCount === 74 &&
      standardCaptureEvidence.suiteEvidence?.browserExtension?.status === "PASS",
    "Standard capture browser extension suite mismatch",
  );
  assert(
    standardCaptureEvidence.suiteEvidence?.standardCaptureAdapter?.testFiles === 2 &&
      standardCaptureEvidence.suiteEvidence?.standardCaptureAdapter?.testCount === 7 &&
      standardCaptureEvidence.suiteEvidence?.standardCaptureAdapter?.status === "PASS",
    "Standard capture adapter suite mismatch",
  );
  assertArrayEquals(
    standardCaptureEvidence.provesP0Items,
    [
      "current-document-deterministic-online",
      "region-intersections-and-structural-ancestors",
      "document-and-primary-app-scroll-root-semantics",
      "open-shadow-dom-slot-composed-tree",
      "same-origin-iframe",
      "inaccessible-cross-origin-frame-diagnostic",
    ],
    "Standard capture proven P0 set mismatch",
  );
  assertIncludesAll(
    standardCaptureEvidence.notProvenByThisArtifact,
    [...expectedBlockingIds, "choose-file-path", ...releaseBoundaries],
    "Standard capture not-proven boundary",
  );
}

if (pluginUiEvidence) {
  assert(pluginUiEvidence.version === "1.0.0", "Plugin UI evidence version mismatch");
  assert(
    pluginUiEvidence.evidenceType === "node31-plugin-ui-choose-file-runtime",
    "Plugin UI evidenceType mismatch",
  );
  assert(pluginUiEvidence.status === "PASS", "Plugin UI evidence must PASS");
  assert(pluginUiEvidence.ci?.runNumber === 847, "Plugin UI evidence must identify CI #847");
  assert(pluginUiEvidence.ci?.runId === 33049035729, "Plugin UI run id mismatch");
  assert(pluginUiEvidence.ci?.jobId === 98439753613, "Plugin UI job id mismatch");
  assert(
    pluginUiEvidence.ci?.branchHead === "a563cf2046b613d64ba7402034979c70e567bd7a",
    "Plugin UI branch head mismatch",
  );
  assert(
    pluginUiEvidence.ci?.mergeRef === "778f68f85c9b4032b39dc8053c7496a743fe5322",
    "Plugin UI merge ref mismatch",
  );
  assert(
    pluginUiEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "Plugin UI base mismatch",
  );
  assertQualityChecks(
    pluginUiEvidence,
    [
      "node31Validator",
      "node31CorpusValidator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "standardCaptureRuntime",
      "pluginUiChooseFileRuntime",
      "format",
    ],
    "Plugin UI evidence",
  );
  assert(
    pluginUiEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "Plugin UI Chrome mismatch",
  );
  assert(pluginUiEvidence.harnessArtifact === pluginUiHarnessPath, "Plugin UI harness mismatch");
  assert(
    pluginUiEvidence.loadedBuiltArtifact === "apps/figma-plugin/dist/ui.html",
    "Plugin UI built artifact mismatch",
  );
  assert(
    pluginUiEvidence.fixtureProducer === "packages/wtf-packager/dist/index.js",
    "Plugin UI fixture producer mismatch",
  );
  assert(
    pluginUiEvidence.fixtureArchiveSha256 ===
      "ab7f99170edd51a1d89536303977fb14c2635c6c181a217b2f537d3ab91ac97c",
    "Plugin UI fixture archive hash mismatch",
  );
  assertIncludesAll(
    pluginUiEvidence.productSourceArtifacts,
    [pluginUiStaticPath, pluginUiSourcePath, pluginUiIntakePath],
    "Plugin UI source",
  );
  assertArrayEquals(
    pluginUiEvidence.assertions,
    expectedPluginUiAssertions,
    "Plugin UI assertion set mismatch",
  );
  assertArrayEquals(
    pluginUiEvidence.provesP0Items,
    ["choose-file-path"],
    "Plugin UI proven P0 set mismatch",
  );
  assertIncludesAll(
    pluginUiEvidence.notProvenByThisArtifact,
    [...expectedBlockingIds, ...releaseBoundaries],
    "Plugin UI not-proven boundary",
  );
}

if (pluginCanvasEvidence) {
  assert(pluginCanvasEvidence.version === "1.0.0", "Plugin canvas evidence version mismatch");
  assert(
    pluginCanvasEvidence.evidenceType === "node31-plugin-canvas-drop-integration-runtime",
    "Plugin canvas evidenceType mismatch",
  );
  assert(pluginCanvasEvidence.status === "PASS", "Plugin canvas evidence must PASS");
  assert(
    pluginCanvasEvidence.contract === "docs/ACCEPTANCE_CONTRACT_V2.md",
    "Plugin canvas contract mismatch",
  );
  assert(
    pluginCanvasEvidence.ci?.runNumber === 861,
    "Plugin canvas evidence must identify CI #861",
  );
  assert(pluginCanvasEvidence.ci?.runId === 33074321682, "Plugin canvas run id mismatch");
  assert(pluginCanvasEvidence.ci?.jobId === 98524433660, "Plugin canvas job id mismatch");
  assert(
    pluginCanvasEvidence.ci?.branchHead === "6195def8a960843c2ea2883638c84386e2ef733a",
    "Plugin canvas branch head mismatch",
  );
  assert(
    pluginCanvasEvidence.ci?.mergeRef === "0b1bd9b0278471c1621d4c502c5579bef05e185c",
    "Plugin canvas merge ref mismatch",
  );
  assert(
    pluginCanvasEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "Plugin canvas base mismatch",
  );
  assertQualityChecks(
    pluginCanvasEvidence,
    [
      "node31Validator",
      "node31CorpusValidator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "standardCaptureRuntime",
      "pluginUiChooseFileRuntime",
      "pluginCanvasDropRuntime",
      "format",
    ],
    "Plugin canvas evidence",
  );
  assert(
    pluginCanvasEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "Plugin canvas Chrome mismatch",
  );
  assert(pluginCanvasEvidence.environment?.node === "24.19.0", "Plugin canvas Node mismatch");
  assert(pluginCanvasEvidence.environment?.pnpm === "11.22.0", "Plugin canvas pnpm mismatch");
  assert(
    pluginCanvasEvidence.harnessArtifact === pluginCanvasHarnessPath,
    "Plugin canvas harness mismatch",
  );
  assertIncludesAll(
    pluginCanvasEvidence.productSourceArtifacts,
    [pluginMainSourcePath, pluginUiSourcePath, pluginUiIntakePath],
    "Plugin canvas source",
  );
  assert(
    pluginCanvasEvidence.mainBundleArtifact === "apps/figma-plugin/dist/code.js",
    "Plugin canvas main bundle artifact mismatch",
  );
  assert(
    pluginCanvasEvidence.uiBundleArtifact === "apps/figma-plugin/dist/ui.html",
    "Plugin canvas UI bundle artifact mismatch",
  );
  assert(
    pluginCanvasEvidence.mainBundleSha256 ===
      "a4a4ccd413f3830542ddd0d96ed669a9c3883ffdbb601c2f9b669bf662822711",
    "Plugin canvas main bundle hash mismatch",
  );
  assert(
    pluginCanvasEvidence.uiBundleSha256 ===
      "d71609a9fd4041ad34060d74b64163163d4fc44b8f07f46ed980bb9382137147",
    "Plugin canvas UI bundle hash mismatch",
  );
  assert(
    pluginCanvasEvidence.fixtureProducer === "packages/wtf-packager/dist/index.js",
    "Plugin canvas fixture producer mismatch",
  );
  assert(
    pluginCanvasEvidence.fixtureArchiveSha256 ===
      "9e02cd0d1b6ae6369d1c7553f395c5cd020f4dcfcea63decccf05bebf38b9cb6",
    "Plugin canvas fixture archive hash mismatch",
  );
  assert(
    pluginCanvasEvidence.hostBoundary?.figmaApi === "simulated",
    "Plugin canvas host boundary mismatch",
  );
  assert(
    typeof pluginCanvasEvidence.hostBoundary?.note === "string" &&
      pluginCanvasEvidence.hostBoundary.note.includes("not a claim of Figma Desktop execution"),
    "Plugin canvas evidence must preserve the non-Desktop claim boundary",
  );
  assertArrayEquals(
    pluginCanvasEvidence.assertions,
    expectedPluginCanvasAssertions,
    "Plugin canvas assertion set mismatch",
  );
  assertArrayEquals(
    pluginCanvasEvidence.provesP0Items,
    ["drop-on-canvas-path"],
    "Plugin canvas proven P0 set mismatch",
  );
  assertIncludesAll(
    pluginCanvasEvidence.notProvenByThisArtifact,
    [...expectedBlockingIds, ...releaseBoundaries],
    "Plugin canvas not-proven boundary",
  );
}

if (audit) {
  assert(audit.version === "1.0.0", "P0 audit version mismatch");
  assert(audit.evidenceType === "node31-p0-audit", "P0 audit evidenceType mismatch");
  assert(audit.contract === "docs/ACCEPTANCE_CONTRACT_V2.md", "P0 audit contract mismatch");
  assert(
    audit.auditedAgainstBranchHead === "6195def8a960843c2ea2883638c84386e2ef733a",
    "P0 audit must stay anchored to exact-head CI #861",
  );
  assert(audit.ci?.runNumber === 861, "P0 audit must identify CI #861");
  assert(audit.ci?.runId === 33074321682, "P0 audit run id mismatch");
  assert(audit.ci?.jobId === 98524433660, "P0 audit job id mismatch");
  assert(
    audit.ci?.branchHead === "6195def8a960843c2ea2883638c84386e2ef733a",
    "P0 audit branch head mismatch",
  );
  assert(
    audit.ci?.mergeRef === "0b1bd9b0278471c1621d4c502c5579bef05e185c",
    "P0 audit merge ref mismatch",
  );
  assert(audit.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23", "P0 audit base mismatch");
  assert(audit.ci?.conclusion === "PASS", "P0 audit CI must PASS");
  assertQualityChecks(
    audit,
    [
      "node31Validator",
      "node31CorpusValidator",
      "node31P0Validator",
      "lint",
      "typecheck",
      "tests",
      "build",
      "browserRuntime",
      "standardCaptureRuntime",
      "pluginUiChooseFileRuntime",
      "pluginCanvasDropRuntime",
      "format",
    ],
    "P0 audit",
  );
  assert(audit.policy?.unavailableIsPass === false, "P0 audit must fail closed on UNAVAILABLE");
  assert(
    audit.policy?.overallStatus === "UNAVAILABLE",
    "P0 audit overall status must remain UNAVAILABLE",
  );

  const allItems = [];
  for (const [sectionName, ids] of Object.entries(requiredIds)) {
    validateAuditSection(audit, sectionName, ids, allItems);
  }
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));

  const standardP0RuntimeProvenance = [
    standardCaptureSourcePath,
    standardCaptureTestPath,
    p0StandardFixturePath,
    standardCaptureHarnessPath,
    standardCaptureEvidencePath,
  ];
  const requiredPassProvenance = new Map([
    [
      "finally-scroll-focus-temporary-style-restore",
      [runtimeProductSourcePath, runtimeHarnessPath, runtimeEvidencePath],
    ],
    [
      "exact-available-font-preferred",
      [fontResolutionPath, fontRendererPath, fontResolutionTestPath, fontEvidencePath],
    ],
    [
      "nearest-mapping-with-diagnostic",
      [
        fontResolutionPath,
        fontDiagnosticsPath,
        fontRendererPath,
        fontResolutionTestPath,
        fontDiagnosticsTestPath,
        fontEvidencePath,
      ],
    ],
    [
      "profile-required-pixel-ground-truth-end-to-end",
      [
        pixelRuntimePath,
        pixelContractPath,
        profilePackagePath,
        wtfExportRuntimePath,
        wtfPackageBuilderPath,
        pixelIntegrationTestPath,
        node21PackageValidatorPath,
        pixelEvidencePath,
      ],
    ],
    ["current-document-deterministic-online", standardP0RuntimeProvenance],
    ["region-intersections-and-structural-ancestors", standardP0RuntimeProvenance],
    ["document-and-primary-app-scroll-root-semantics", standardP0RuntimeProvenance],
    [
      "open-shadow-dom-slot-composed-tree",
      [
        standardCaptureSourcePath,
        shadowFixturePath,
        corpusValidatorPath,
        standardCaptureHarnessPath,
        standardCaptureEvidencePath,
      ],
    ],
    [
      "same-origin-iframe",
      [
        standardCaptureSourcePath,
        iframeFixturePath,
        corpusValidatorPath,
        standardCaptureHarnessPath,
        standardCaptureEvidencePath,
      ],
    ],
    ["inaccessible-cross-origin-frame-diagnostic", standardP0RuntimeProvenance],
    [
      "choose-file-path",
      [
        pluginUiStaticPath,
        pluginUiSourcePath,
        pluginUiIntakePath,
        pluginUiHarnessPath,
        pluginUiEvidencePath,
      ],
    ],
    [
      "drop-on-canvas-path",
      [
        pluginMainSourcePath,
        pluginUiSourcePath,
        pluginUiIntakePath,
        pluginCanvasHarnessPath,
        pluginCanvasEvidencePath,
      ],
    ],
  ]);

  for (const [id, artifacts] of requiredPassProvenance) {
    const entry = byId.get(id);
    assert(entry?.status === "PASS", `P0 item ${id} must be PASS`);
    assertIncludesAll(entry?.sourceArtifacts, artifacts, `P0 item ${id} provenance`);
  }

  const unavailableIds = allItems
    .filter((entry) => entry.status === "UNAVAILABLE")
    .map((entry) => entry.id)
    .sort();
  assertArrayEquals(unavailableIds, expectedBlockingIds, "P0 unavailable set mismatch");
  assertArrayEquals(
    audit.blockingUnavailableIds,
    expectedBlockingIds,
    "P0 declared blocker set mismatch",
  );
  assert(audit.blockingUnavailableCount === 4, "P0 audit must retain exactly 4 blockers");

  if (manifest) {
    assert(manifest.p0?.status === "UNAVAILABLE", "manifest P0 must remain UNAVAILABLE");
    assert(manifest.p0?.evidenceArtifact === auditPath, "manifest P0 evidenceArtifact mismatch");
    assert(manifest.p0?.blockingUnavailableCount === 4, "manifest P0 blocker count must be 4");
  }
}

if (failures.length > 0) {
  console.error(`NODE-31 P0 validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-31 P0 validation passed.");
}
