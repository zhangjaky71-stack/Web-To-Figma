import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
  applyNode31MeasurementArtifactToManifest,
  evaluateNode31EvidenceManifest,
} from "../packages/figma-renderer/dist/index.js";

const root = process.cwd();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: node scripts/promote-node-31-desktop-evidence.mjs [measurement-file-or-dir] [manifest-path]",
  );
  console.log(
    "Defaults: docs/qa/results/node31-desktop and docs/qa/NODE-31_RC_EVIDENCE_V2.json",
  );
  process.exit(0);
}

const inputPath = resolve(process.argv[2] ?? "docs/qa/results/node31-desktop");
const manifestPath = resolve(process.argv[3] ?? "docs/qa/NODE-31_RC_EVIDENCE_V2.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function repoRelative(path) {
  const value = relative(root, path).split(sep).join("/");
  assert(value.length > 0, "NODE31_E_PROMOTION_PATH: evidence path cannot be repository root");
  assert(
    value !== ".." && !value.startsWith("../"),
    `NODE31_E_PROMOTION_PATH: evidence must live inside the repository: ${path}`,
  );
  return value;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(
      `NODE31_E_PROMOTION_JSON: ${label} is invalid JSON: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
}

async function collectMeasurementFiles(path) {
  const info = await lstat(path);
  assert(!info.isSymbolicLink(), `NODE31_E_PROMOTION_SYMLINK: refusing symlink ${path}`);
  if (info.isFile()) {
    assert(
      path.endsWith(".measurement.json"),
      `NODE31_E_PROMOTION_INPUT: expected .measurement.json file: ${path}`,
    );
    return [path];
  }
  assert(info.isDirectory(), `NODE31_E_PROMOTION_INPUT: unsupported input type: ${path}`);

  const results = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const child = resolve(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`NODE31_E_PROMOTION_SYMLINK: refusing symlink ${child}`);
    }
    if (entry.isDirectory()) {
      results.push(...(await collectMeasurementFiles(child)));
    } else if (entry.isFile() && child.endsWith(".measurement.json")) {
      results.push(child);
    }
  }
  return results;
}

const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert(
  /^[a-f0-9]{40}$/.test(gitHead),
  `NODE31_E_PROMOTION_HEAD: git HEAD is not a full lowercase commit SHA: ${gitHead}`,
);

const measurementFiles = await collectMeasurementFiles(inputPath);
assert(measurementFiles.length > 0, `NODE31_E_PROMOTION_INPUT: no measurement files found in ${inputPath}`);

let manifest = parseJson(await readFile(manifestPath, "utf8"), repoRelative(manifestPath));
const initialReport = evaluateNode31EvidenceManifest(manifest);
assert(
  initialReport.failures.length === 0,
  `NODE31_E_PROMOTION_MANIFEST: manifest has blocking failures: ${initialReport.failures.join("; ")}`,
);

const promoted = [];
for (const measurementFile of measurementFiles.sort()) {
  const artifact = parseJson(await readFile(measurementFile, "utf8"), repoRelative(measurementFile));
  manifest = applyNode31MeasurementArtifactToManifest(manifest, artifact, {
    measurementArtifact: repoRelative(measurementFile),
    expectedBranchHead: gitHead,
  });
  promoted.push({
    sampleId: artifact.sample.id,
    measurementArtifact: repoRelative(measurementFile),
  });
}

const finalReport = evaluateNode31EvidenceManifest(manifest);
assert(
  finalReport.failures.length === 0,
  `NODE31_E_PROMOTION_RESULT: promoted manifest has blocking failures: ${finalReport.failures.join("; ")}`,
);

const tempPath = resolve(
  dirname(manifestPath),
  `.${repoRelative(manifestPath).split("/").at(-1)}.${process.pid}.${Date.now()}.tmp`,
);
await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
await rename(tempPath, manifestPath);

console.log(
  JSON.stringify(
    {
      version: "1.0.0",
      evidenceType: "node31-desktop-evidence-promotion-receipt",
      branchHead: gitHead,
      manifest: repoRelative(manifestPath),
      promotedCount: promoted.length,
      promoted,
      manifestStatus: finalReport.status,
      manifestState: finalReport.manifestState,
      measuredCount: finalReport.measuredCount,
      unavailable: finalReport.unavailable,
    },
    null,
    2,
  ),
);
