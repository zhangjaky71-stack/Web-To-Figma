import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const evidencePath = "docs/qa/results/NODE-31_KNOWN_LIMITATIONS_AUDIT_1125.json";
const limitationsPath = "docs/KNOWN_LIMITATIONS.md";
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V2.json";
const standardCapturePath = "packages/standard-capture-adapter/src/capture.ts";
const rasterPolicyPath = "apps/figma-plugin/src/raster-text-policy.ts";
const fontDiagnosticsPath = "apps/figma-plugin/src/font-diagnostics.ts";
const packagerPath = "packages/wtf-packager/src/packager.ts";
const stableIdentityTypesPath = "packages/stable-identity/src/types.ts";

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(text(path));
  } catch (error) {
    failures.push(`invalid JSON ${path}: ${String(error)}`);
    return null;
  }
}

for (const path of [
  evidencePath,
  limitationsPath,
  manifestPath,
  standardCapturePath,
  rasterPolicyPath,
  fontDiagnosticsPath,
  packagerPath,
  stableIdentityTypesPath,
]) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

const evidence = readJson(evidencePath);
const manifest = readJson(manifestPath);
const limitations = text(limitationsPath);
const standardCapture = text(standardCapturePath);
const rasterPolicy = text(rasterPolicyPath);
const fontDiagnostics = text(fontDiagnosticsPath);
const packager = text(packagerPath);
const stableIdentityTypes = text(stableIdentityTypesPath);

const sectionIds = [...limitations.matchAll(/^##\s+(\d+)\./gm)].map((match) => Number(match[1]));
const expectedSectionIds = Array.from({ length: 37 }, (_, index) => index + 1);
assert(
  JSON.stringify(sectionIds) === JSON.stringify(expectedSectionIds),
  "Known limitations must contain exactly contiguous sections 1 through 37",
);
assert(
  limitations.includes("**Status:** ACTIVE PRODUCT CONTRACT"),
  "Known limitations document must remain an active product contract",
);
for (const marker of [
  "Silent data loss is not an acceptable limitation strategy.",
  "## 14. Canvas",
  "## 15. WebGL",
  "## 31. Stable identity is probabilistic in ambiguous DOMs",
  "## 37. Compatibility policy",
]) {
  assert(limitations.includes(marker), `Known limitations missing contract marker: ${marker}`);
}

if (evidence) {
  assert(evidence.version === "1.0.0", "Known limitations evidence version mismatch");
  assert(
    evidence.evidenceType === "node31-known-limitations-currentness-audit",
    "Known limitations evidence type mismatch",
  );
  assert(evidence.status === "PASS", "Known limitations evidence must PASS");
  assert(evidence.sourceDocument === limitationsPath, "Known limitations source document mismatch");
  assert(
    evidence.sourceDocumentStatus === "ACTIVE PRODUCT CONTRACT",
    "Source document status mismatch",
  );
  assert(evidence.sectionCount === 37, "Known limitations evidence section count must be 37");
  assert(
    JSON.stringify(evidence.sectionIds) === JSON.stringify(expectedSectionIds),
    "Known limitations evidence section ids mismatch",
  );
  assert(evidence.ciAnchor?.runNumber === 1125, "Known limitations evidence must anchor CI #1125");
  assert(evidence.ciAnchor?.runId === 33740760898, "Known limitations evidence run id mismatch");
  assert(evidence.ciAnchor?.jobId === 100601847724, "Known limitations evidence job id mismatch");
  assert(
    evidence.ciAnchor?.branchHead === "4ef870e2a963155c4b0119bfbd72fda4b0af902b",
    "Known limitations evidence branch head mismatch",
  );
  assert(evidence.ciAnchor?.conclusion === "PASS", "Known limitations evidence CI must PASS");
  assert(
    evidence.supportClassificationAudit?.standardHtmlCssEntriesMustRemainNativeSupported === true,
    "Standard HTML/CSS support classification boundary missing",
  );
  assert(
    evidence.supportClassificationAudit?.silentDataLossAcceptable === false,
    "Silent data loss must remain unacceptable",
  );
  for (const category of ["canvas", "webgl"]) {
    assert(
      evidence.supportClassificationAudit?.expectedFallbackCategories?.includes(category),
      `Expected fallback category missing ${category}`,
    );
  }
  for (const boundary of [
    "exhaustive-absence-of-undocumented-limitations",
    "Class-A-visual-geometry-text-asset-structure-thresholds",
    "Class-B-browser-to-wtf-to-Figma-thresholds",
    "Figma-Desktop-host-parity-for-simulated-runtime-evidence",
    "universal-browser-compatibility",
    "final-release-readiness",
  ]) {
    assert(
      evidence.notProvenByThisArtifact?.includes(boundary),
      `Known limitations evidence must not overclaim ${boundary}`,
    );
  }
  for (const group of evidence.auditGroups ?? []) {
    for (const path of group.sourceArtifacts ?? []) {
      assert(existsSync(resolve(root, path)), `Known limitations source anchor missing: ${path}`);
    }
  }
}

for (const marker of [
  "STANDARD_CAPTURE_NODE_LIMIT",
  "captureShadowRoot",
  "isPrimaryApplicationScrollRoot",
]) {
  assert(standardCapture.includes(marker), `Standard capture limitation anchor missing ${marker}`);
}

for (const marker of [
  "TEXT_QUALITY_REASON_PATTERNS",
  'profile === "design-friendly"',
  "explicit visual/compositing dependency",
]) {
  assert(rasterPolicy.includes(marker), `Raster text limitation anchor missing ${marker}`);
}

for (const marker of [
  "FONT_GEOMETRY_TOLERANCE_RATIO = 0.02",
  "MIN_FONT_GEOMETRY_SCALE = 0.85",
  "MAX_FONT_GEOMETRY_SCALE = 1.15",
  '"attempted-unvalidated"',
]) {
  assert(fontDiagnostics.includes(marker), `Font limitation anchor missing ${marker}`);
}

for (const marker of [
  "WTF_HARD_SECURITY_LIMITS",
  "package exceeds entry-count limit",
  "generated archive exceeds limit",
  "validatePortablePath",
]) {
  assert(packager.includes(marker), `Package limitation anchor missing ${marker}`);
}

for (const marker of ['"ambiguous"', "confidence: number;"]) {
  assert(
    stableIdentityTypes.includes(marker),
    `Stable identity limitation anchor missing ${marker}`,
  );
}

if (manifest) {
  assert(manifest.knownLimitations?.status === "PASS", "RC V2 known limitations status must PASS");
  assert(
    manifest.knownLimitations?.evidenceArtifact === evidencePath,
    "RC V2 known limitations evidenceArtifact mismatch",
  );
  for (const item of manifest.classB ?? []) {
    if (item.standardHtmlCss === true) {
      assert(
        item.supportClass === "native-supported",
        `Standard HTML/CSS ${item.id} must remain native-supported`,
      );
    }
  }
  const canvas = (manifest.classB ?? []).find((item) => item.category === "canvas");
  const webgl = (manifest.classB ?? []).find((item) => item.category === "webgl");
  assert(canvas?.supportClass === "expected-fallback", "Canvas must remain expected-fallback");
  assert(
    canvas?.fallbackContract === `${limitationsPath}#14-canvas`,
    "Canvas fallback contract mismatch",
  );
  assert(webgl?.supportClass === "expected-fallback", "WebGL must remain expected-fallback");
  assert(
    webgl?.fallbackContract === `${limitationsPath}#15-webgl`,
    "WebGL fallback contract mismatch",
  );
  for (const item of manifest.classA ?? []) {
    assert(
      item.measurementStatus === "UNAVAILABLE",
      `Known limitations promotion must not silently promote Class A ${item.id}`,
    );
  }
  for (const item of manifest.classB ?? []) {
    assert(
      item.measurementStatus === "UNAVAILABLE",
      `Known limitations promotion must not silently promote Class B ${item.id}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-31 known limitations validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-31 known limitations currentness validation passed.");
}
