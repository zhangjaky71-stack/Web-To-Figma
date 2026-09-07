import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateNode31MeasurementArtifact } from "../packages/figma-renderer/dist/index.js";

const root = process.cwd();
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V2.json";
const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8"));
const failures = [];
const reports = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sha256File(path) {
  return createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
}

function loadArtifact(path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    failures.push(`invalid measurement artifact ${path}: ${String(error)}`);
    return null;
  }
}

function validateEntry(entry, expectedClass) {
  const sourceArtifact = entry.sourceArtifact;
  assert(
    typeof sourceArtifact === "string" && sourceArtifact.trim().length > 0,
    `${entry.id} must name a sourceArtifact`,
  );
  if (typeof sourceArtifact !== "string" || !sourceArtifact.trim()) return;
  const sourceExists = existsSync(resolve(root, sourceArtifact));
  assert(sourceExists, `${entry.id} sourceArtifact does not exist: ${sourceArtifact}`);
  if (!sourceExists) return;
  const sourceSha256 = sha256File(sourceArtifact);

  const measurementArtifact = entry.measurementArtifact;
  if (entry.measurementStatus === "UNAVAILABLE" && !measurementArtifact) {
    reports.push({
      id: entry.id,
      status: "UNAVAILABLE",
      sourceArtifact,
      sourceSha256,
      artifact: null,
    });
    return;
  }

  assert(
    typeof measurementArtifact === "string" && measurementArtifact.trim().length > 0,
    `${entry.id} ${entry.measurementStatus} requires measurementArtifact provenance`,
  );
  if (typeof measurementArtifact !== "string" || !measurementArtifact.trim()) return;
  assert(
    existsSync(resolve(root, measurementArtifact)),
    `${entry.id} measurementArtifact does not exist: ${measurementArtifact}`,
  );
  if (!existsSync(resolve(root, measurementArtifact))) return;

  const artifact = loadArtifact(measurementArtifact);
  if (!artifact) return;
  const report = evaluateNode31MeasurementArtifact(artifact);
  reports.push({
    id: entry.id,
    status: report.status,
    releaseEligible: report.releaseEligible,
    sourceArtifact,
    sourceSha256,
    artifact: measurementArtifact,
  });

  assert(artifact.sample?.id === entry.id, `${entry.id} artifact sample id mismatch`);
  assert(artifact.sample?.testClass === expectedClass, `${entry.id} artifact testClass mismatch`);
  assert(
    artifact.sample?.sourceArtifact === sourceArtifact,
    `${entry.id} artifact sourceArtifact mismatch`,
  );
  assert(
    artifact.sample?.sourceSha256 === sourceSha256,
    `${entry.id} artifact sourceSha256 does not match current source bytes`,
  );
  if (expectedClass === "A") {
    assert(artifact.sample?.level === entry.level, `${entry.id} artifact level mismatch`);
  }
  if (expectedClass === "B") {
    assert(artifact.sample?.category === entry.category, `${entry.id} artifact category mismatch`);
    assert(
      artifact.sample?.supportClass === entry.supportClass,
      `${entry.id} artifact supportClass mismatch`,
    );
    assert(
      artifact.sample?.standardHtmlCss === entry.standardHtmlCss,
      `${entry.id} artifact standardHtmlCss mismatch`,
    );
  }

  if (entry.measurementStatus === "PASS") {
    assert(
      report.status === "PASS" && report.releaseEligible,
      `${entry.id} cannot PASS manifest measurement without release-eligible artifact: ${[
        ...report.failures,
        ...report.unavailable,
      ].join("; ")}`,
    );
  } else if (entry.measurementStatus === "UNAVAILABLE") {
    assert(
      report.status === "UNAVAILABLE",
      `${entry.id} manifest UNAVAILABLE must point only to an UNAVAILABLE artifact`,
    );
  } else if (entry.measurementStatus === "FAIL") {
    assert(report.status === "FAIL", `${entry.id} manifest FAIL must point to a failing artifact`);
  } else {
    failures.push(
      `${entry.id} has unsupported measurementStatus ${String(entry.measurementStatus)}`,
    );
  }
}

for (const entry of manifest.classA ?? []) validateEntry(entry, "A");
for (const entry of manifest.classB ?? []) validateEntry(entry, "B");

const unavailableCount = reports.filter((item) => item.status === "UNAVAILABLE").length;
const passCount = reports.filter((item) => item.status === "PASS").length;
const failCount = reports.filter((item) => item.status === "FAIL").length;

if (manifest.status === "ready") {
  assert(unavailableCount === 0, "ready manifest cannot contain unavailable measurements");
}

if (failures.length > 0) {
  console.error(
    `NODE-31 measurement provenance validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        version: "1.1.0",
        evidenceType: "node31-measurement-provenance-validation",
        status: unavailableCount > 0 ? "UNAVAILABLE" : failCount > 0 ? "FAIL" : "PASS",
        manifest: manifestPath,
        sourceInputCount: reports.length,
        passCount,
        unavailableCount,
        failCount,
        reports,
        antiCheatingBoundary:
          "manifest PASS requires a release-eligible artifact produced through the Figma Desktop measurement contract; synthetic simulator scores remain UNAVAILABLE; every source input is existence-checked and source-byte SHA-256 is bound into any measurement artifact",
      },
      null,
      2,
    ),
  );
}
