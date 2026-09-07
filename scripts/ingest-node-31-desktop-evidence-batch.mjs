import { execFileSync } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: node scripts/ingest-node-31-desktop-evidence-batch.mjs <archive-file-or-dir> [output-dir] [manifest-path]",
  );
  console.log(
    "Defaults: output docs/qa/results/node31-desktop; manifest docs/qa/NODE-31_RC_EVIDENCE_V2.json",
  );
  process.exit(0);
}

const inputPath = process.argv[2] ? resolve(process.argv[2]) : null;
const outputRoot = resolve(process.argv[3] ?? "docs/qa/results/node31-desktop");
const manifestPath = resolve(process.argv[4] ?? "docs/qa/NODE-31_RC_EVIDENCE_V2.json");
const singleIngest = resolve(root, "scripts/ingest-node-31-desktop-evidence.mjs");
const promote = resolve(root, "scripts/promote-node-31-desktop-evidence.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function collectArchives(path) {
  const info = await lstat(path);
  assert(!info.isSymbolicLink(), `NODE31_E_BATCH_SYMLINK: refusing symlink ${path}`);
  if (info.isFile()) {
    assert(
      path.endsWith(".node31-desktop-evidence.json"),
      `NODE31_E_BATCH_INPUT: expected .node31-desktop-evidence.json file: ${path}`,
    );
    return [path];
  }
  assert(info.isDirectory(), `NODE31_E_BATCH_INPUT: unsupported input type: ${path}`);

  const results = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const child = resolve(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`NODE31_E_BATCH_SYMLINK: refusing symlink ${child}`);
    }
    if (entry.isDirectory()) {
      results.push(...(await collectArchives(child)));
    } else if (entry.isFile() && child.endsWith(".node31-desktop-evidence.json")) {
      results.push(child);
    }
  }
  return results;
}

assert(
  inputPath,
  "Usage: node scripts/ingest-node-31-desktop-evidence-batch.mjs <archive-file-or-dir> [output-dir] [manifest-path]",
);

const archives = await collectArchives(inputPath);
assert(
  archives.length > 0,
  `NODE31_E_BATCH_INPUT: no Desktop evidence archives found in ${inputPath}`,
);

for (const archive of archives.sort()) {
  execFileSync(process.execPath, [singleIngest, archive, outputRoot], {
    cwd: root,
    stdio: "inherit",
  });
}

execFileSync(process.execPath, [promote, outputRoot, manifestPath], {
  cwd: root,
  stdio: "inherit",
});

console.log(
  JSON.stringify(
    {
      version: "1.0.0",
      evidenceType: "node31-desktop-evidence-batch-receipt",
      archiveCount: archives.length,
      outputRoot,
      manifestPath,
    },
    null,
    2,
  ),
);
