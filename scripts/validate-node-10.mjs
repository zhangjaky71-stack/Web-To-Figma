import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const requiredFiles = [
  "packages/capture-core/src/types.ts",
  "packages/capture-core/src/validation.ts",
  "packages/capture-core/test/raw-snapshot.test.ts",
  "packages/standard-capture-adapter/src/capture.ts",
  "packages/standard-capture-adapter/test/capture-contract.test.ts",
  "packages/cdp-capture-adapter/src/types.ts",
  "packages/cdp-capture-adapter/src/normalize.ts",
  "packages/cdp-capture-adapter/test/normalize.test.ts",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-10 missing ${file}`);
}

if (failures.length === 0) {
  const captureTypes = readText("packages/capture-core/src/types.ts");
  for (const contract of [
    'RAW_SNAPSHOT_VERSION = "1.0.0"',
    '| "pseudo"',
    "RawTextRunEvidence",
    "RawTextFragmentEvidence",
    "RawBaselineSource",
    '"font-metrics"',
    '"line-box-estimate"',
    '"cdp-layout-estimate"',
    "baselineConfidence: number",
    "RawTextEvidence",
    "RawInlineEvidence",
    "RawPseudoEvidence",
    "RawFormVisualEvidence",
    'textValueCapture: "not-applicable" | "omitted-sensitive"',
    "text?: RawTextEvidence",
    "inline?: RawInlineEvidence",
    "pseudo?: RawPseudoEvidence",
    "formVisual?: RawFormVisualEvidence",
  ]) {
    assert(captureTypes.includes(contract), `RawSnapshot NODE-10 contract missing ${contract}`);
  }

  const validation = readText("packages/capture-core/src/validation.ts");
  for (const invariant of [
    '"pseudo",',
    "isRawTextEvidence",
    "isRawTextFragment",
    "isRawInlineEvidence",
    "isRawPseudoEvidence",
    "isRawFormVisualEvidence",
    "isUnitInterval(value.baselineConfidence)",
    '"font-metrics", "line-box-estimate", "cdp-layout-estimate"',
    'value.kind === "pseudo"',
  ]) {
    assert(validation.includes(invariant), `RawSnapshot NODE-10 validation missing ${invariant}`);
  }

  const standard = readText("packages/standard-capture-adapter/src/capture.ts");
  for (const evidence of [
    "createRange",
    "getClientRects",
    "measureText",
    "actualBoundingBoxAscent",
    "actualBoundingBoxDescent",
    'baselineSource: "font-metrics"',
    'baselineSource: "line-box-estimate"',
    "textFragments",
    "inlineEvidence",
    "capturePseudo",
    "pseudoType",
    "formVisualEvidence",
    "STANDARD_TEXT_FRAGMENT_LIMIT",
    'textValueCapture: "omitted-sensitive"',
  ]) {
    assert(standard.includes(evidence), `Standard NODE-10 capture missing ${evidence}`);
  }
  for (const forbidden of [
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "input.value",
    "textarea.value",
  ]) {
    assert(!standard.includes(forbidden), `Standard NODE-10 capture must not consume ${forbidden}`);
  }

  const cdpTypes = readText("packages/cdp-capture-adapter/src/types.ts");
  assert(
    cdpTypes.includes("CdpRareBooleanData") &&
      cdpTypes.includes("inputChecked?: CdpRareBooleanData"),
    "CDP NODE-10 evidence must expose safe checked-state evidence",
  );
  for (const forbidden of ["inputValue", "textValue"]) {
    assert(
      !cdpTypes.includes(forbidden),
      `CDP NODE-10 evidence contract must not expose ${forbidden}`,
    );
  }

  const cdp = readText("packages/cdp-capture-adapter/src/normalize.ts");
  for (const evidence of [
    '"font-family"',
    '"font-size"',
    '"line-height"',
    '"writing-mode"',
    '"vertical-align"',
    '"content"',
    '"appearance"',
    '"accent-color"',
    "document.nodes.pseudoType",
    "document.nodes.inputChecked",
    "cdpTextEvidence",
    "cdpBaseline",
    'baselineSource: "cdp-layout-estimate"',
    "inlineEvidence",
    "pseudoEvidence",
    "formVisualEvidence",
    'textValueCapture: "omitted-sensitive"',
  ]) {
    assert(cdp.includes(evidence), `CDP NODE-10 normalizer missing ${evidence}`);
  }
  for (const forbidden of [
    "document.nodes.inputValue",
    "document.nodes.textValue",
    "document.cookie",
    "localStorage",
    "sessionStorage",
  ]) {
    assert(!cdp.includes(forbidden), `CDP NODE-10 normalizer must not consume ${forbidden}`);
  }
}

if (failures.length > 0) {
  console.error(
    `NODE-10 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-10 foundation validation passed.");
}
