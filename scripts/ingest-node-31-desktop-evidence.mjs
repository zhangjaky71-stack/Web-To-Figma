import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { evaluateNode31MeasurementArtifact } from "../packages/figma-renderer/dist/index.js";

const inputPath = process.argv[2] ? resolve(process.argv[2]) : null;
const outputRoot = resolve(
  process.argv[3] ?? process.env.W2F_NODE31_DESKTOP_EVIDENCE_OUT ?? "artifacts/node31-desktop-evidence",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeSegment(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  assert(normalized.length > 0, "Evidence sample id is empty or unsafe");
  return normalized;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (cause) {
    throw new Error(`${label} is not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
  }
}

assert(inputPath, "Usage: node scripts/ingest-node-31-desktop-evidence.mjs <archive.json> [output-dir]");
const archive = JSON.parse(await readFile(inputPath, "utf8"));
assert(archive?.version === "1.0.0", "Desktop evidence archive version mismatch");
assert(
  archive?.evidenceType === "node31-figma-desktop-evidence-archive",
  "Not a NODE-31 Figma Desktop evidence archive",
);
assert(typeof archive.sampleId === "string" && archive.sampleId.length > 0, "Archive sampleId missing");
assert(/^[a-f0-9]{64}$/.test(archive.sourceSha256), "Archive sourceSha256 is invalid");
assert(Array.isArray(archive.files) && archive.files.length >= 4, "Desktop evidence archive is incomplete");

const files = new Map();
for (const entry of archive.files) {
  assert(entry && typeof entry === "object", "Archive file entry is invalid");
  assert(typeof entry.name === "string" && entry.name.length > 0, "Archive filename missing");
  assert(!entry.name.includes("/") && !entry.name.includes("\\"), `Unsafe archive filename: ${entry.name}`);
  assert(!files.has(entry.name), `Duplicate archive filename: ${entry.name}`);
  assert(typeof entry.base64 === "string", `Archive file ${entry.name} has no base64 payload`);
  assert(/^[a-f0-9]{64}$/.test(entry.sha256), `Archive file ${entry.name} has invalid SHA-256`);
  const bytes = Buffer.from(entry.base64, "base64");
  assert(bytes.length === entry.byteLength, `Archive file ${entry.name} byte length mismatch`);
  assert(sha256(bytes) === entry.sha256, `Archive file ${entry.name} SHA-256 mismatch`);
  files.set(entry.name, { entry, bytes });
}

const measurementEntries = [...files.values()].filter(({ entry }) => entry.name.endsWith(".measurement.json"));
const renderEntries = [...files.values()].filter(({ entry }) => entry.name.endsWith(".figma-render.json"));
const exportEntries = [...files.values()].filter(({ entry }) => entry.name.endsWith(".figma-export.json"));
const pngEntries = [...files.values()].filter(({ entry }) => entry.mediaType === "image/png");
assert(measurementEntries.length === 1, "Archive must contain exactly one measurement artifact");
assert(renderEntries.length === 1, "Archive must contain exactly one Figma render artifact");
assert(exportEntries.length === 1, "Archive must contain exactly one Figma export manifest");
assert(pngEntries.length > 0, "Archive must contain raw Figma PNG output");

const measurementFile = measurementEntries[0];
const renderFile = renderEntries[0];
const exportFile = exportEntries[0];
const measurement = parseJson(measurementFile.bytes, measurementFile.entry.name);
const render = parseJson(renderFile.bytes, renderFile.entry.name);
const exportManifest = parseJson(exportFile.bytes, exportFile.entry.name);
const report = evaluateNode31MeasurementArtifact(measurement);

assert(report.failures.length === 0, `Measurement contract failure: ${report.failures.join("; ")}`);
assert(measurement.sample?.id === archive.sampleId, "Archive/measurement sample id mismatch");
assert(measurement.sample?.sourceSha256 === archive.sourceSha256, "Archive/measurement source hash mismatch");
assert(measurement.pipeline?.figmaRender?.status === "PASS", "Figma render stage is not PASS");
assert(measurement.pipeline?.figmaRender?.host?.kind === "figma-desktop", "Render host is not figma-desktop");
assert(measurement.pipeline?.figmaExport?.status === "PASS", "Figma export stage is not PASS");
assert(measurement.pipeline.figmaRender.artifact === renderFile.entry.name, "Render artifact path mismatch");
assert(measurement.pipeline.figmaRender.sha256 === renderFile.entry.sha256, "Render artifact hash mismatch");
assert(measurement.pipeline.figmaExport.artifact === exportFile.entry.name, "Export artifact path mismatch");
assert(measurement.pipeline.figmaExport.sha256 === exportFile.entry.sha256, "Export artifact hash mismatch");
assert(render.evidenceType === "node31-figma-desktop-render", "Render evidence type mismatch");
assert(render.host?.kind === "figma-desktop", "Render evidence host mismatch");
assert(render.sampleId === archive.sampleId, "Render evidence sample mismatch");
assert(render.sourceSha256 === archive.sourceSha256, "Render evidence source hash mismatch");
assert(exportManifest.evidenceType === "node31-figma-desktop-export", "Export evidence type mismatch");
assert(exportManifest.sampleId === archive.sampleId, "Export evidence sample mismatch");
assert(exportManifest.sourceSha256 === archive.sourceSha256, "Export evidence source hash mismatch");
assert(Array.isArray(exportManifest.tiles) && exportManifest.tiles.length === pngEntries.length, "Export tile manifest mismatch");

for (const tile of exportManifest.tiles) {
  const stored = files.get(tile.artifact);
  assert(stored, `Export manifest references missing tile ${tile.artifact}`);
  assert(stored.entry.mediaType === "image/png", `Export tile ${tile.artifact} is not PNG`);
  assert(stored.entry.sha256 === tile.sha256, `Export tile ${tile.artifact} hash mismatch`);
  assert(stored.entry.byteLength === tile.byteLength, `Export tile ${tile.artifact} size mismatch`);
}

const sampleDir = resolve(outputRoot, safeSegment(archive.sampleId));
await mkdir(sampleDir, { recursive: true });
for (const { entry, bytes } of files.values()) {
  await writeFile(resolve(sampleDir, basename(entry.name)), bytes);
}
const receipt = {
  version: "1.0.0",
  evidenceType: "node31-desktop-evidence-ingest-receipt",
  sampleId: archive.sampleId,
  sourceSha256: archive.sourceSha256,
  branchHead: measurement.provenance?.branchHead ?? null,
  measurementStatus: report.status,
  releaseEligible: report.releaseEligible,
  unavailable: report.unavailable,
  fileCount: files.size,
  pngTileCount: pngEntries.length,
  inputArchive: inputPath,
  outputDirectory: sampleDir,
  ingestedAt: new Date().toISOString(),
};
await writeFile(resolve(sampleDir, "ingest-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

console.log(JSON.stringify(receipt, null, 2));
