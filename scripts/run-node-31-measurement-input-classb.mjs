import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync(resolve("docs/qa/NODE-31_RC_EVIDENCE_V2.json"), "utf8"));
const outputDir =
  process.env.W2F_NODE31_CLASSB_OUTPUT_DIR ?? "artifacts/node31-measurement-input-classb";
const entries = manifest.classB ?? [];
if (entries.length !== 12) throw new Error(`Expected 12 Class B samples, got ${entries.length}`);
const reports = [];
for (const entry of entries) {
  const result = spawnSync(process.execPath, ["scripts/run-node-31-measurement-input-level1.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      W2F_NODE31_TEST_CLASS: "B",
      W2F_NODE31_SAMPLE_ID: entry.id,
      W2F_NODE31_SOURCE_ARTIFACT: entry.sourceArtifact,
      W2F_NODE31_CATEGORY: entry.category,
      W2F_NODE31_SUPPORT_CLASS: entry.supportClass,
      W2F_NODE31_STANDARD_HTML_CSS: String(entry.standardHtmlCss),
      W2F_NODE31_REQUIRED_EDITABLE_TEXT: "",
      W2F_NODE31_MEASUREMENT_OUTPUT_DIR: outputDir,
    },
  });
  if (result.status !== 0)
    throw new Error(`Class B input failed for ${entry.id}: ${result.status}`);
  const path = resolve(outputDir, `${entry.id}.measurement.json`);
  if (!existsSync(path)) throw new Error(`Missing Class B artifact: ${entry.id}`);
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  const sample = artifact.sample ?? {};
  if (
    sample.id !== entry.id ||
    sample.testClass !== "B" ||
    sample.category !== entry.category ||
    sample.supportClass !== entry.supportClass ||
    sample.standardHtmlCss !== entry.standardHtmlCss ||
    sample.sourceArtifact !== entry.sourceArtifact
  )
    throw new Error(`Class B provenance mismatch: ${entry.id}`);
  if (
    artifact.pipeline?.browserCapture?.status !== "PASS" ||
    artifact.pipeline?.wtfPackage?.status !== "PASS" ||
    artifact.pipeline?.secureParse?.status !== "PASS" ||
    artifact.pipeline?.figmaRender?.status !== "UNAVAILABLE"
  )
    throw new Error(`Class B pipeline boundary mismatch: ${entry.id}`);
  reports.push({
    id: entry.id,
    category: entry.category,
    supportClass: entry.supportClass,
    standardHtmlCss: entry.standardHtmlCss,
    browserCapture: "PASS",
    wtfPackage: "PASS",
    secureParse: "PASS",
    figmaRender: "UNAVAILABLE",
  });
}
console.log(
  JSON.stringify(
    {
      version: "1.0.0",
      evidenceType: "node31-classb-measurement-input-runtime",
      status: "PASS",
      sampleCount: reports.length,
      measurementStatus: "UNAVAILABLE",
      releaseEligible: false,
      reports,
      remainingBoundary: "real Figma Desktop render/export and fidelity comparison",
    },
    null,
    2,
  ),
);
