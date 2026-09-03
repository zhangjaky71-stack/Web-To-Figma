import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const evidencePath = "docs/qa/results/NODE-31_FILE_PROTOCOL_EVIDENCE_1118.json";
const runtimePath = "scripts/run-node-31-file-protocol-runtime-v18.mjs";
const fixturePath = "qa/corpus/node31/p0/file-protocol-runtime.html";
const manifestPath = "apps/browser-extension/static/manifest.high-fidelity.json";

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

for (const path of [evidencePath, runtimePath, fixturePath, manifestPath]) {
  assert(existsSync(resolve(root, path)), `missing ${path}`);
}

const evidence = readJson(evidencePath);
const manifest = readJson(manifestPath);
const runtime = text(runtimePath);

if (evidence) {
  assert(evidence.version === "1.0.0", "File protocol evidence version mismatch");
  assert(
    evidence.evidenceType === "node31-file-protocol-p0-promotion",
    "File protocol evidence type mismatch",
  );
  assert(evidence.sourcePullRequest === 38, "File protocol evidence source PR mismatch");
  assert(
    evidence.baselineCommit === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",
    "File protocol evidence baseline mismatch",
  );
  assert(evidence.ci?.runNumber === 1118, "File protocol evidence must identify CI #1118");
  assert(evidence.ci?.runId === 33737113028, "File protocol evidence run id mismatch");
  assert(evidence.ci?.jobId === 100590179059, "File protocol evidence job id mismatch");
  assert(
    evidence.ci?.branchHead === "6e807625d4dc4e557da2fce05bf623a1d8eb9dde",
    "File protocol evidence branch head mismatch",
  );
  assert(
    evidence.ci?.pullRequestMergeCheckout === "7a85da128b2d6a5ca72743c4b855f25355c41f22",
    "File protocol evidence PR merge checkout mismatch",
  );
  assert(evidence.ci?.conclusion === "PASS", "File protocol evidence CI must PASS");
  assert(evidence.ci?.runner?.node === "24.19.0", "File protocol Node version mismatch");
  assert(evidence.ci?.runner?.pnpm === "11.22.0", "File protocol pnpm version mismatch");
  assert(
    evidence.ci?.runner?.chrome === "Chrome/151.0.7922.173",
    "File protocol Chrome version mismatch",
  );

  for (const check of [
    "foundation",
    "node31Validator",
    "p0ClosureValidator",
    "lint",
    "typecheck",
    "tests",
    "build",
    "fileProtocolRuntimeV18",
    "browserRuntime",
    "standardCaptureRuntime",
    "visualStateRuntime",
    "pluginChooseFileRuntime",
    "pluginCanvasDropRuntime",
    "fontGeometryRuntime",
    "format",
  ]) {
    assert(evidence.ci?.qualityChecks?.[check] === "PASS", `File protocol evidence missing PASS ${check}`);
  }

  assert(evidence.runtime?.status === "PASS", "File protocol runtime must PASS");
  assert(evidence.runtime?.version === "18.0.0", "File protocol runtime version mismatch");
  assert(
    evidence.runtime?.captureProfile === "high-fidelity",
    "File protocol capture profile mismatch",
  );
  assert(
    evidence.runtime?.proofArchitecture ===
      "two-fresh-native-chrome-cdp-sessions-with-unattached-file-target",
    "File protocol proof architecture mismatch",
  );
  assert(
    evidence.runtime?.permission?.initialFileAccessActive === true,
    "Initial explicit file access must be active",
  );
  assert(
    evidence.runtime?.permission?.disabledFileAccessActive === false,
    "Disabled explicit file access must be inactive",
  );
  assert(
    evidence.runtime?.permission?.reenabledFileAccessActive === true,
    "Re-enabled explicit file access must be active",
  );
  assert(
    evidence.runtime?.capture?.preCaptureDebuggerAttached === false,
    "File target must be debugger-unattached before production capture",
  );
  assert(evidence.runtime?.capture?.adapter === "cdp", "File capture adapter must be CDP");
  assert(
    evidence.runtime?.capture?.phase === "high-fidelity-capture-complete",
    "File capture phase mismatch",
  );
  assert(evidence.runtime?.capture?.nodeCount === 26, "File capture node count mismatch");
  assert(
    evidence.runtime?.capture?.rasterReferenceCount === 2,
    "File capture raster reference count mismatch",
  );
  assert(
    evidence.runtime?.capture?.hasViewportReference === true,
    "File capture must preserve viewport reference",
  );
  assert(
    evidence.runtime?.capture?.hasFullPageReference === true,
    "File capture must preserve full-page reference",
  );
  assert(
    evidence.runtime?.capture?.editableProofText === true,
    "File capture must preserve editable proof text",
  );
  assert(
    evidence.runtime?.provesP0Items?.length === 1 &&
      evidence.runtime.provesP0Items[0] === "file-protocol-explicit-permission",
    "File protocol evidence must prove only the intended P0 item",
  );

  for (const assertion of [
    "chrome-file-access-setting-can-be-explicitly-disabled",
    "chrome-file-access-setting-can-be-explicitly-reenabled",
    "harness-never-attaches-real-file-page-target",
    "harness-never-attaches-extension-service-worker-target",
    "production-debugger-target-is-unattached-before-capture",
    "production-full-page-job-completes-on-file-url",
    "completed-job-uses-high-fidelity-cdp-capture-adapter",
    "pixel-ground-truth-retains-viewport-and-full-page-raster-references",
    "persisted-raw-snapshot-preserves-editable-text-structure",
  ]) {
    assert(
      evidence.runtime?.assertions?.includes(assertion),
      `File protocol evidence missing assertion ${assertion}`,
    );
  }

  for (const shortcut of [
    "--allow-file-access-from-files",
    "--disable-extensions-file-access-check",
  ]) {
    assert(
      evidence.runtime?.prohibitedShortcutFlags?.includes(shortcut),
      `File protocol evidence missing prohibited shortcut ${shortcut}`,
    );
  }
  for (const legacy of ["--load-extension", "--disable-extensions-except"]) {
    assert(
      evidence.runtime?.prohibitedLegacyInstallFlags?.includes(legacy),
      `File protocol evidence missing prohibited legacy install flag ${legacy}`,
    );
  }

  for (const path of evidence.sourceArtifacts ?? []) {
    assert(existsSync(resolve(root, path)), `File protocol source artifact missing: ${path}`);
  }

  for (const boundary of [
    "Class-A-visual-similarity",
    "Class-A-geometry-text-asset-structure-fidelity",
    "Class-B-browser-to-wtf-to-Figma-measurements",
    "standard-html-css-editable-area-median",
    "standard-html-css-raster-area-median",
    "zero-known-critical-security-blockers",
    "zero-known-high-security-blockers",
    "absence-of-undiscovered-vulnerabilities",
    "penetration-test-completeness",
    "known-limitations-currentness",
    "final-release-readiness",
  ]) {
    assert(
      evidence.notProvenByThisArtifact?.includes(boundary),
      `File protocol evidence must not overclaim ${boundary}`,
    );
  }
}

if (manifest) {
  assert(
    manifest.host_permissions?.includes("file:///*"),
    "High Fidelity manifest must declare file:///* host permission",
  );
  assert(manifest.permissions?.includes("debugger"), "High Fidelity manifest must declare debugger permission");
}

for (const marker of [
  'version: "18.0.0"',
  'captureProfile: "high-fidelity"',
  'job?.capture?.adapter === "cdp"',
  'job?.capture?.fallbackFromCdp !== true',
  'rawSnapshot.adapter === "cdp"',
  'reference.kind === "viewport"',
  'reference.kind === "full-page"',
  '"--allow-file-access-from-files"',
  '"--disable-extensions-file-access-check"',
  '"--load-extension"',
  '"--disable-extensions-except"',
  '"--enable-unsafe-extension-debugging"',
]) {
  assert(runtime.includes(marker), `V18 runtime missing evidence marker ${marker}`);
}

if (failures.length > 0) {
  console.error(
    `NODE-31 file protocol evidence validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-31 file protocol evidence validation passed.");
}
