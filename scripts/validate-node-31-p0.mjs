import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_798.json";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
const runtimeEvidencePath = "docs/qa/results/NODE-31_BROWSER_RUNTIME_EVIDENCE_764.json";
const fontEvidencePath = "docs/qa/results/NODE-31_FONT_EVIDENCE_781.json";
const pixelEvidencePath = "docs/qa/results/NODE-31_PIXEL_GROUND_TRUTH_EVIDENCE_798.json";
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

const requiredRuntimeBoundaries = [
  "visual-state-freeze-and-restore",
  "current-document-deterministic-online",
  "file-protocol-explicit-permission",
  "zero-known-critical-security-blockers",
  "zero-known-high-security-blockers",
  "class-a-visual-geometry-text-asset-structure-measurements",
  "class-b-browser-to-wtf-to-figma-measurements",
];

const expectedFontP0Items = ["exact-available-font-preferred", "nearest-mapping-with-diagnostic"];

const requiredFontBoundaries = [
  "geometry-preserving-correction-policy",
  "raster-text-only-when-policy-justifies",
  "current-document-deterministic-online",
  "file-protocol-explicit-permission",
  "choose-file-path",
  "drop-on-canvas-path",
  "zero-known-critical-security-blockers",
  "zero-known-high-security-blockers",
  "class-a-visual-geometry-text-asset-structure-measurements",
  "class-b-browser-to-wtf-to-figma-measurements",
];

const expectedPixelP0Items = ["profile-required-pixel-ground-truth-end-to-end"];

const requiredPixelBoundaries = [
  "current-document-deterministic-online",
  "file-protocol-explicit-permission",
  "region-intersections-and-structural-ancestors",
  "document-and-primary-app-scroll-root-semantics",
  "open-shadow-dom-slot-composed-tree",
  "same-origin-iframe",
  "inaccessible-cross-origin-frame-diagnostic",
  "visual-state-freeze-and-restore",
  "choose-file-path",
  "drop-on-canvas-path",
  "geometry-preserving-correction-policy",
  "raster-text-only-when-policy-justifies",
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

function validateSection(audit, sectionName, ids, allItems) {
  const entries = Array.isArray(audit?.[sectionName]) ? audit[sectionName] : [];
  const byId = new Map();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    assert(id.length > 0, `${sectionName} contains an entry without id`);
    assert(!byId.has(id), `${sectionName} duplicates ${id}`);
    byId.set(id, entry);
  }
  for (const id of ids) {
    assert(byId.has(id), `${sectionName} missing required P0 item ${id}`);
  }
  assert(entries.length === ids.length, `${sectionName} contains undeclared or missing P0 items`);

  for (const entry of entries) {
    const status = entry?.status;
    assert(
      status === "PASS" || status === "UNAVAILABLE" || status === "FAIL",
      `${sectionName}/${String(entry?.id)} has invalid status ${String(status)}`,
    );
    assert(status !== "FAIL", `${sectionName}/${String(entry?.id)} is a blocking FAIL`);
    assert(
      typeof entry?.reason === "string" && entry.reason.trim().length > 0,
      `${sectionName}/${String(entry?.id)} must explain its evidence status`,
    );
    const artifacts = Array.isArray(entry?.sourceArtifacts) ? entry.sourceArtifacts : [];
    assert(artifacts.length > 0, `${sectionName}/${String(entry?.id)} must name sourceArtifacts`);
    for (const artifact of artifacts) {
      assert(
        typeof artifact === "string" && artifact.length > 0,
        `${sectionName}/${String(entry?.id)} has invalid sourceArtifact`,
      );
      if (typeof artifact === "string" && artifact.length > 0) {
        assert(
          existsSync(resolve(root, artifact)),
          `${sectionName}/${String(entry?.id)} sourceArtifact does not exist: ${artifact}`,
        );
      }
    }
    allItems.push(entry);
  }
}

for (const path of [
  auditPath,
  manifestPath,
  runtimeEvidencePath,
  fontEvidencePath,
  pixelEvidencePath,
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
]) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

const audit = readJson(auditPath);
const manifest = readJson(manifestPath);
const runtimeEvidence = readJson(runtimeEvidencePath);
const fontEvidence = readJson(fontEvidencePath);
const pixelEvidence = readJson(pixelEvidencePath);

if (runtimeEvidence) {
  assert(runtimeEvidence.version === "1.0.0", "NODE-31 browser runtime version must be 1.0.0");
  assert(
    runtimeEvidence.evidenceType === "node31-browser-runtime",
    "NODE-31 browser runtime evidenceType mismatch",
  );
  assert(runtimeEvidence.status === "PASS", "NODE-31 browser runtime status must be PASS");
  assert(runtimeEvidence.ci?.runNumber === 764, "NODE-31 browser runtime must identify CI #764");
  assert(runtimeEvidence.ci?.runId === 32830737350, "NODE-31 browser runtime run id mismatch");
  assert(runtimeEvidence.ci?.jobId === 97748603856, "NODE-31 browser runtime job id mismatch");
  assert(runtimeEvidence.ci?.conclusion === "PASS", "NODE-31 browser runtime CI must be PASS");
  assert(
    runtimeEvidence.ci?.branchHead === "c5b3cbdbd0326951ceb23ff2271055c9acbaad19",
    "NODE-31 browser runtime branch head mismatch",
  );
  assert(
    runtimeEvidence.ci?.mergeRef === "b4603e0e74e9b3c00f7355d01db9d710e9af7c74",
    "NODE-31 browser runtime merge ref mismatch",
  );
  assert(
    runtimeEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "NODE-31 browser runtime base mismatch",
  );
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "browserRuntime",
    "format",
  ]) {
    assert(
      runtimeEvidence.ci?.qualityChecks?.[check] === "PASS",
      `NODE-31 browser runtime missing PASS ${check}`,
    );
  }
  assert(
    runtimeEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "NODE-31 browser runtime Chrome version mismatch",
  );
  assert(
    runtimeEvidence.harnessArtifact === runtimeHarnessPath,
    "NODE-31 browser runtime harness path mismatch",
  );
  assert(
    runtimeEvidence.productSourceArtifact === runtimeProductSourcePath,
    "NODE-31 browser runtime product source mismatch",
  );
  assert(
    runtimeEvidence.loadedBuiltArtifact === runtimeBuiltArtifactPath,
    "NODE-31 browser runtime built artifact mismatch",
  );
  const mockedBoundary = Array.isArray(runtimeEvidence.transportBoundary?.mocked)
    ? runtimeEvidence.transportBoundary.mocked
    : [];
  assert(
    mockedBoundary.length === 1 &&
      mockedBoundary[0] === "chrome.runtime.onMessage message transport only",
    "NODE-31 browser runtime must mock only chrome.runtime.onMessage transport",
  );
  const runtimeAssertions = Array.isArray(runtimeEvidence.assertions)
    ? [...runtimeEvidence.assertions].sort()
    : [];
  assert(
    JSON.stringify(runtimeAssertions) === JSON.stringify(expectedRuntimeAssertions),
    "NODE-31 browser runtime assertion set mismatch",
  );
  const proves = Array.isArray(runtimeEvidence.provesP0Items) ? runtimeEvidence.provesP0Items : [];
  assert(
    proves.length === 1 && proves[0] === "finally-scroll-focus-temporary-style-restore",
    "NODE-31 browser runtime must prove only the intended P0 item",
  );
  const notProven = new Set(
    Array.isArray(runtimeEvidence.notProvenByThisArtifact)
      ? runtimeEvidence.notProvenByThisArtifact
      : [],
  );
  for (const boundary of requiredRuntimeBoundaries) {
    assert(
      notProven.has(boundary),
      `NODE-31 browser runtime must preserve not-proven boundary ${boundary}`,
    );
  }
}

if (fontEvidence) {
  assert(fontEvidence.version === "1.0.0", "NODE-31 font evidence version must be 1.0.0");
  assert(fontEvidence.evidenceType === "node31-font-policy", "NODE-31 font evidenceType mismatch");
  assert(fontEvidence.status === "PASS", "NODE-31 font evidence status must be PASS");
  assert(fontEvidence.ci?.runNumber === 781, "NODE-31 font evidence must identify CI #781");
  assert(fontEvidence.ci?.runId === 32833779725, "NODE-31 font evidence run id mismatch");
  assert(fontEvidence.ci?.jobId === 97758035952, "NODE-31 font evidence job id mismatch");
  assert(fontEvidence.ci?.conclusion === "PASS", "NODE-31 font evidence CI must be PASS");
  assert(
    fontEvidence.ci?.branchHead === "50d234bf977741a31b99b53f5bf579698c5d64c5",
    "NODE-31 font evidence branch head mismatch",
  );
  assert(
    fontEvidence.ci?.mergeRef === "c2210996b4a40317102d3967275544db738f3baa",
    "NODE-31 font evidence merge ref mismatch",
  );
  assert(
    fontEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "NODE-31 font evidence base mismatch",
  );
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "figmaPluginPackage",
    "browserRuntime",
    "format",
  ]) {
    assert(
      fontEvidence.ci?.qualityChecks?.[check] === "PASS",
      `NODE-31 font evidence missing PASS ${check}`,
    );
  }
  assert(fontEvidence.environment?.node === "24.19.0", "NODE-31 font Node version mismatch");
  assert(fontEvidence.environment?.pnpm === "11.22.0", "NODE-31 font pnpm version mismatch");
  assert(
    fontEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "NODE-31 font Chrome version mismatch",
  );
  const sourceArtifacts = new Set(
    Array.isArray(fontEvidence.sourceArtifacts) ? fontEvidence.sourceArtifacts : [],
  );
  for (const artifact of [fontResolutionPath, fontDiagnosticsPath, fontRendererPath]) {
    assert(sourceArtifacts.has(artifact), `NODE-31 font evidence missing source ${artifact}`);
  }
  const tests = new Map(
    (Array.isArray(fontEvidence.testArtifacts) ? fontEvidence.testArtifacts : []).map((entry) => [
      entry?.path,
      entry,
    ]),
  );
  assert(
    tests.get(fontResolutionTestPath)?.testCount === 5 &&
      tests.get(fontResolutionTestPath)?.status === "PASS",
    "NODE-31 font resolution evidence must record five PASS tests",
  );
  assert(
    tests.get(fontDiagnosticsTestPath)?.testCount === 2 &&
      tests.get(fontDiagnosticsTestPath)?.status === "PASS",
    "NODE-31 font diagnostic evidence must record two PASS tests",
  );
  assert(
    fontEvidence.figmaPluginSuite?.testFiles === 6 &&
      fontEvidence.figmaPluginSuite?.testCount === 25 &&
      fontEvidence.figmaPluginSuite?.status === "PASS",
    "NODE-31 font evidence Figma plugin suite mismatch",
  );
  const proves = Array.isArray(fontEvidence.provesP0Items) ? fontEvidence.provesP0Items : [];
  assert(
    JSON.stringify(proves) === JSON.stringify(expectedFontP0Items),
    "NODE-31 font evidence must prove exactly the intended two font P0 items",
  );
  const notProven = new Set(
    Array.isArray(fontEvidence.notProvenByThisArtifact) ? fontEvidence.notProvenByThisArtifact : [],
  );
  for (const boundary of requiredFontBoundaries) {
    assert(
      notProven.has(boundary),
      `NODE-31 font evidence must preserve not-proven boundary ${boundary}`,
    );
  }
}

if (pixelEvidence) {
  assert(pixelEvidence.version === "1.0.0", "NODE-31 Pixel evidence version must be 1.0.0");
  assert(
    pixelEvidence.evidenceType === "node31-profile-pixel-ground-truth",
    "NODE-31 Pixel evidenceType mismatch",
  );
  assert(pixelEvidence.status === "PASS", "NODE-31 Pixel evidence status must be PASS");
  assert(pixelEvidence.ci?.runNumber === 798, "NODE-31 Pixel evidence must identify CI #798");
  assert(pixelEvidence.ci?.runId === 32852849393, "NODE-31 Pixel evidence run id mismatch");
  assert(pixelEvidence.ci?.jobId === 97817648113, "NODE-31 Pixel evidence job id mismatch");
  assert(pixelEvidence.ci?.conclusion === "PASS", "NODE-31 Pixel evidence CI must be PASS");
  assert(
    pixelEvidence.ci?.branchHead === "281b193027202eaea4a0b4ca9c21bf8e15e66c06",
    "NODE-31 Pixel evidence branch head mismatch",
  );
  assert(
    pixelEvidence.ci?.mergeRef === "8ae000a9adc256c006cbd0844a258bad067820c3",
    "NODE-31 Pixel evidence merge ref mismatch",
  );
  assert(
    pixelEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "NODE-31 Pixel evidence base mismatch",
  );
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "browserRuntime",
    "format",
  ]) {
    assert(
      pixelEvidence.ci?.qualityChecks?.[check] === "PASS",
      `NODE-31 Pixel evidence missing PASS ${check}`,
    );
  }
  assert(pixelEvidence.environment?.node === "24.19.0", "NODE-31 Pixel Node version mismatch");
  assert(pixelEvidence.environment?.pnpm === "11.22.0", "NODE-31 Pixel pnpm version mismatch");
  assert(
    pixelEvidence.environment?.chrome === "Chrome/151.0.7922.137",
    "NODE-31 Pixel Chrome version mismatch",
  );
  const sourceArtifacts = new Set(
    Array.isArray(pixelEvidence.sourceArtifacts) ? pixelEvidence.sourceArtifacts : [],
  );
  for (const artifact of [
    pixelRuntimePath,
    pixelContractPath,
    profilePackagePath,
    wtfExportRuntimePath,
    wtfPackageBuilderPath,
    node21PackageValidatorPath,
  ]) {
    assert(sourceArtifacts.has(artifact), `NODE-31 Pixel evidence missing source ${artifact}`);
  }
  const tests = new Map(
    (Array.isArray(pixelEvidence.testArtifacts) ? pixelEvidence.testArtifacts : []).map((entry) => [
      entry?.path,
      entry,
    ]),
  );
  assert(
    tests.get(pixelIntegrationTestPath)?.testCount === 4 &&
      tests.get(pixelIntegrationTestPath)?.status === "PASS",
    "NODE-31 Pixel integration evidence must record four PASS tests",
  );
  assert(
    tests.get(pixelRuntimeTestPath)?.testCount === 4 &&
      tests.get(pixelRuntimeTestPath)?.status === "PASS",
    "NODE-31 Pixel runtime evidence must record four PASS tests",
  );
  assert(
    pixelEvidence.browserExtensionSuite?.testFiles === 27 &&
      pixelEvidence.browserExtensionSuite?.testCount === 74 &&
      pixelEvidence.browserExtensionSuite?.status === "PASS",
    "NODE-31 Pixel browser-extension suite mismatch",
  );
  for (const profile of ["standard", "highFidelity"]) {
    const validation = pixelEvidence.packageValidation?.[profile];
    assert(
      validation?.extension === "PASS",
      `NODE-31 Pixel ${profile} extension package must PASS`,
    );
    assert(
      validation?.node14PixelGroundTruth === "PASS",
      `NODE-31 Pixel ${profile} NODE-14 package must PASS`,
    );
    assert(
      validation?.node21WtfExport === "PASS",
      `NODE-31 Pixel ${profile} NODE-21 package must PASS`,
    );
  }
  const proves = Array.isArray(pixelEvidence.provesP0Items) ? pixelEvidence.provesP0Items : [];
  assert(
    JSON.stringify(proves) === JSON.stringify(expectedPixelP0Items),
    "NODE-31 Pixel evidence must prove exactly the intended P0 item",
  );
  const notProven = new Set(
    Array.isArray(pixelEvidence.notProvenByThisArtifact)
      ? pixelEvidence.notProvenByThisArtifact
      : [],
  );
  for (const boundary of requiredPixelBoundaries) {
    assert(
      notProven.has(boundary),
      `NODE-31 Pixel evidence must preserve not-proven boundary ${boundary}`,
    );
  }
}

if (audit) {
  assert(audit.version === "1.0.0", "NODE-31 P0 audit version must be 1.0.0");
  assert(audit.evidenceType === "node31-p0-audit", "NODE-31 P0 audit evidenceType mismatch");
  assert(
    audit.auditedAgainstBranchHead === "281b193027202eaea4a0b4ca9c21bf8e15e66c06",
    "NODE-31 P0 audit must stay anchored to exact-head CI #798 until regenerated",
  );
  assert(audit.ci?.runNumber === 798, "NODE-31 P0 audit must identify CI #798");
  assert(audit.ci?.runId === 32852849393, "NODE-31 P0 audit run id mismatch");
  assert(audit.ci?.jobId === 97817648113, "NODE-31 P0 audit job id mismatch");
  assert(audit.ci?.conclusion === "PASS", "NODE-31 P0 audit CI conclusion must be PASS");
  for (const check of [
    "node31Validator",
    "node31P0Validator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "browserRuntime",
    "format",
  ]) {
    assert(audit.ci?.qualityChecks?.[check] === "PASS", `NODE-31 P0 audit missing PASS ${check}`);
  }
  assert(
    audit.policy?.unavailableIsPass === false,
    "NODE-31 P0 audit must fail closed on UNAVAILABLE",
  );

  const allItems = [];
  for (const [sectionName, ids] of Object.entries(requiredIds)) {
    validateSection(audit, sectionName, ids, allItems);
  }

  const runtimeItem = allItems.find(
    (entry) => entry.id === "finally-scroll-focus-temporary-style-restore",
  );
  assert(runtimeItem?.status === "PASS", "NODE-31 Chrome-backed cleanup P0 item must be PASS");
  const runtimeArtifacts = Array.isArray(runtimeItem?.sourceArtifacts)
    ? runtimeItem.sourceArtifacts
    : [];
  for (const artifact of [runtimeProductSourcePath, runtimeHarnessPath, runtimeEvidencePath]) {
    assert(
      runtimeArtifacts.includes(artifact),
      `NODE-31 Chrome-backed cleanup P0 item missing provenance ${artifact}`,
    );
  }

  const exactFontItem = allItems.find((entry) => entry.id === "exact-available-font-preferred");
  assert(exactFontItem?.status === "PASS", "NODE-31 exact-font P0 item must be PASS");
  const exactFontArtifacts = Array.isArray(exactFontItem?.sourceArtifacts)
    ? exactFontItem.sourceArtifacts
    : [];
  for (const artifact of [
    fontResolutionPath,
    fontRendererPath,
    fontResolutionTestPath,
    fontEvidencePath,
  ]) {
    assert(
      exactFontArtifacts.includes(artifact),
      `NODE-31 exact-font P0 item missing provenance ${artifact}`,
    );
  }

  const mappedFontItem = allItems.find((entry) => entry.id === "nearest-mapping-with-diagnostic");
  assert(mappedFontItem?.status === "PASS", "NODE-31 mapped-font P0 item must be PASS");
  const mappedFontArtifacts = Array.isArray(mappedFontItem?.sourceArtifacts)
    ? mappedFontItem.sourceArtifacts
    : [];
  for (const artifact of [
    fontResolutionPath,
    fontDiagnosticsPath,
    fontRendererPath,
    fontResolutionTestPath,
    fontDiagnosticsTestPath,
    fontEvidencePath,
  ]) {
    assert(
      mappedFontArtifacts.includes(artifact),
      `NODE-31 mapped-font P0 item missing provenance ${artifact}`,
    );
  }

  const pixelItem = allItems.find(
    (entry) => entry.id === "profile-required-pixel-ground-truth-end-to-end",
  );
  assert(pixelItem?.status === "PASS", "NODE-31 profile Pixel Ground Truth P0 item must be PASS");
  const pixelArtifacts = Array.isArray(pixelItem?.sourceArtifacts) ? pixelItem.sourceArtifacts : [];
  for (const artifact of [
    pixelRuntimePath,
    pixelContractPath,
    profilePackagePath,
    wtfExportRuntimePath,
    wtfPackageBuilderPath,
    pixelIntegrationTestPath,
    node21PackageValidatorPath,
    pixelEvidencePath,
  ]) {
    assert(
      pixelArtifacts.includes(artifact),
      `NODE-31 profile Pixel Ground Truth P0 item missing provenance ${artifact}`,
    );
  }

  for (const id of [
    "geometry-preserving-correction-policy",
    "raster-text-only-when-policy-justifies",
  ]) {
    assert(
      allItems.find((entry) => entry.id === id)?.status === "UNAVAILABLE",
      `NODE-31 font policy ${id} must remain UNAVAILABLE until direct evidence exists`,
    );
  }

  const unavailableIds = allItems
    .filter((entry) => entry.status === "UNAVAILABLE")
    .map((entry) => entry.id)
    .sort();
  const declaredBlocking = Array.isArray(audit.blockingUnavailableIds)
    ? [...audit.blockingUnavailableIds].sort()
    : [];
  assert(
    JSON.stringify(declaredBlocking) === JSON.stringify(unavailableIds),
    "NODE-31 P0 blockingUnavailableIds must exactly match UNAVAILABLE items",
  );
  assert(unavailableIds.length === 12, "NODE-31 P0 audit must retain exactly 12 unavailable items");
  assert(
    audit.blockingUnavailableCount === unavailableIds.length,
    "NODE-31 P0 audit blockingUnavailableCount mismatch",
  );
  const derivedStatus = unavailableIds.length === 0 ? "PASS" : "UNAVAILABLE";
  assert(
    audit.policy?.overallStatus === derivedStatus,
    `NODE-31 P0 audit overallStatus must be ${derivedStatus}`,
  );

  if (manifest) {
    assert(
      manifest.p0?.status === derivedStatus,
      `NODE-31 manifest P0 status must be ${derivedStatus}`,
    );
    assert(
      manifest.p0?.evidenceArtifact === auditPath,
      "NODE-31 manifest P0 evidenceArtifact must point to the P0 audit",
    );
    assert(
      manifest.p0?.blockingUnavailableCount === unavailableIds.length,
      "NODE-31 manifest P0 blockingUnavailableCount mismatch",
    );
  }
}

if (failures.length > 0) {
  console.error(`NODE-31 P0 validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-31 P0 validation passed.");
}