import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const requiredFiles = [
  "packages/w2f-schema/src/frame-context.ts",
  "packages/w2f-schema/src/scale-context.ts",
  "packages/capture-core/package.json",
  "packages/capture-core/tsconfig.json",
  "packages/capture-core/tsconfig.build.json",
  "packages/capture-core/src/index.ts",
  "packages/capture-core/src/types.ts",
  "packages/capture-core/src/validation.ts",
  "packages/capture-core/test/raw-snapshot.test.ts",
  "packages/standard-capture-adapter/package.json",
  "packages/standard-capture-adapter/tsconfig.json",
  "packages/standard-capture-adapter/tsconfig.build.json",
  "packages/standard-capture-adapter/src/index.ts",
  "packages/standard-capture-adapter/src/types.ts",
  "packages/standard-capture-adapter/src/privacy.ts",
  "packages/standard-capture-adapter/src/capture.ts",
  "packages/standard-capture-adapter/test/privacy.test.ts",
  "packages/standard-capture-adapter/test/capture-contract.test.ts",
  "apps/browser-extension/src/runtime/snapshot-store.ts",
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `NODE-08 missing ${file}`);
}

if (failures.length === 0) {
  const schemaPackage = readJson("packages/w2f-schema/package.json");
  assert(
    schemaPackage.exports?.["./frame-context"]?.types === "./src/frame-context.ts" &&
      schemaPackage.exports?.["./frame-context"]?.default === "./dist/frame-context.js",
    "w2f-schema must expose the frame-context contract",
  );
  assert(
    schemaPackage.exports?.["./scale-context"]?.types === "./src/scale-context.ts" &&
      schemaPackage.exports?.["./scale-context"]?.default === "./dist/scale-context.js",
    "w2f-schema must expose the scale-context contract",
  );

  const frameContext = readText("packages/w2f-schema/src/frame-context.ts");
  for (const field of ["frameId", "parentFrameId", "origin", "url"]) {
    assert(frameContext.includes(field), `FrameContext missing ${field}`);
  }
  const scaleContext = readText("packages/w2f-schema/src/scale-context.ts");
  for (const field of [
    "devicePixelRatio",
    "browserPageZoom",
    "cssZoom",
    "visualViewportScale",
    "browserPageZoomAvailability",
    "cssZoomAvailability",
  ]) {
    assert(scaleContext.includes(field), `ScaleContext missing ${field}`);
  }

  const irTypes = readText("packages/w2f-ir/src/types.ts");
  assert(
    irTypes.includes('from "@w2f/w2f-schema/frame-context"') &&
      irTypes.includes("frameContext?: FrameContext"),
    "W2F IR SourceNode must preserve optional FrameContext",
  );
  const irValidation = readText("packages/w2f-ir/src/validation.ts");
  assert(
    irValidation.includes("validateFrameContext") &&
      irValidation.includes("WTF_IR_FRAME_CONTEXT_INVALID"),
    "W2F IR must validate captured FrameContext evidence",
  );

  const captureCorePackage = readJson("packages/capture-core/package.json");
  assert(
    captureCorePackage.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "capture-core must share the W2F schema type contract",
  );
  const captureCoreTypes = readText("packages/capture-core/src/types.ts");
  for (const contract of [
    'RAW_SNAPSHOT_VERSION = "1.0.0"',
    'RawCaptureAdapter = "standard" | "cdp"',
    "frameContext: FrameContext",
    "scale: ScaleContextEvidence",
    "scrollContainers: ScrollContainerInfo[]",
    "diagnostics: RawCaptureDiagnostic[]",
  ]) {
    assert(captureCoreTypes.includes(contract), `RawSnapshot contract missing ${contract}`);
  }
  const captureCoreValidation = readText("packages/capture-core/src/validation.ts");
  assert(
    !captureCoreValidation.includes('from "@w2f/w2f-schema"'),
    "Browser RawSnapshot runtime validation must be self-contained",
  );
  assert(
    captureCoreValidation.includes("isRawSnapshot") &&
      captureCoreValidation.includes("summarizeRawSnapshot") &&
      captureCoreValidation.includes("isScaleEvidence"),
    "capture-core must validate RawSnapshot structure including scale evidence",
  );

  const adapterPackage = readJson("packages/standard-capture-adapter/package.json");
  assert(
    adapterPackage.dependencies?.["@w2f/capture-core"] === "workspace:*",
    "Standard adapter must target the shared RawSnapshot contract",
  );
  const adapterTypes = readText("packages/standard-capture-adapter/src/types.ts");
  assert(
    adapterTypes.includes('STANDARD_CAPTURE_ADAPTER_VERSION = "1.0.0"'),
    "Standard adapter version drifted",
  );
  const adapter = readText("packages/standard-capture-adapter/src/capture.ts");
  for (const evidence of [
    "getClientRects",
    "getComputedStyle",
    "assignedNodes",
    "shadowRoot",
    "contentDocument",
    "contentWindow",
    "scrollWidth",
    "STANDARD_CAPTURE_FRAME_INACCESSIBLE",
    "isPrimaryApplicationScrollRoot",
    "browserPageZoomAvailability",
    "cssZoomAvailability",
  ]) {
    assert(adapter.includes(evidence), `Standard adapter missing ${evidence}`);
  }
  assert(!adapter.includes("Math.round"), "Standard capture must not round geometry");
  for (const protectedApi of ["document.cookie", "localStorage", "sessionStorage"]) {
    assert(!adapter.includes(protectedApi), `Standard adapter must not read ${protectedApi}`);
  }
  for (const sensitiveEvidence of ["password", "authorization", "token", "srcdoc"]) {
    assert(
      adapter.includes(sensitiveEvidence),
      `Standard adapter privacy filter missing ${sensitiveEvidence}`,
    );
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/capture-core"] === "workspace:*" &&
      browserPackage.dependencies?.["@w2f/standard-capture-adapter"] === "workspace:*",
    "Browser must consume capture-core and Standard adapter",
  );
  const protocol = readText("apps/browser-extension/src/runtime/protocol.ts");
  assert(
    protocol.includes("captureImplemented: true") &&
      protocol.includes("standardCaptureImplemented: true"),
    "Browser shell must report Standard capture as implemented",
  );

  const serviceWorker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "captureStandardSnapshotInPage",
    "isRawSnapshot",
    "writeRawSnapshot",
    "regionCaptureTarget",
    "standard-capture-complete",
    "capturePreferredDom",
    "environment.scale.context.devicePixelRatio",
  ]) {
    assert(
      serviceWorker.includes(evidence),
      `Browser Standard capture orchestration missing ${evidence}`,
    );
  }
  const snapshotStore = readText("apps/browser-extension/src/runtime/snapshot-store.ts");
  assert(snapshotStore.includes("indexedDB.open"), "RawSnapshot storage must use IndexedDB");
  assert(
    snapshotStore.includes("isRawSnapshot"),
    "persisted RawSnapshots must be validated when read/written",
  );

  const packageScript = readText("apps/browser-extension/scripts/package-extension.mjs");
  for (const runtimePackage of [
    "@w2f/source-providers",
    "@w2f/capture-core",
    "@w2f/standard-capture-adapter",
  ]) {
    assert(packageScript.includes(runtimePackage), `Browser packager missing ${runtimePackage}`);
  }
  const packageValidator = readText(
    "apps/browser-extension/scripts/validate-extension-package.mjs",
  );
  for (const runtimePath of [
    "runtime/capture-core/index.js",
    "runtime/standard-capture-adapter/capture.js",
    "runtime/snapshot-store.js",
  ]) {
    assert(packageValidator.includes(runtimePath), `Browser package gate missing ${runtimePath}`);
  }

  const manifest = readJson("apps/browser-extension/static/manifest.json");
  assert(
    JSON.stringify([...(manifest.permissions ?? [])].sort()) ===
      JSON.stringify(["activeTab", "downloads", "scripting", "storage"].sort()),
    "NODE-08 must preserve activeTab+downloads+scripting+storage without host expansion",
  );
  assert(!("host_permissions" in manifest), "NODE-08 must not add broad host permissions");
  assert(!("content_scripts" in manifest), "NODE-08 must keep user-action injection");
}

if (failures.length > 0) {
  console.error(
    `NODE-08 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("NODE-08 foundation validation passed.");
}
