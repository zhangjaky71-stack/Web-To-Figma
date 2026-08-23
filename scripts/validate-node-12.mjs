import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of [
  "packages/environment-capture/package.json",
  "packages/environment-capture/tsconfig.json",
  "packages/environment-capture/tsconfig.build.json",
  "packages/environment-capture/src/types.ts",
  "packages/environment-capture/src/capture.ts",
  "packages/environment-capture/src/index.ts",
  "packages/environment-capture/test/environment-capture.test.ts",
  "packages/standard-capture-adapter/src/environment-capture.ts",
  "apps/browser-extension/src/runtime/environment-runtime.ts",
  "apps/browser-extension/src/runtime/environment-store.ts",
  "apps/browser-extension/test/environment-runtime.test.ts",
  "apps/browser-extension/test/environment-store.test.ts",
]) {
  assert(existsSync(resolve(root, path)), `NODE-12 missing ${path}`);
}

if (failures.length === 0) {
  const packageJson = JSON.parse(read("packages/environment-capture/package.json"));
  assert(
    packageJson.name === "@w2f/environment-capture",
    "NODE-12 environment package name drifted",
  );
  assert(
    packageJson.dependencies?.["@w2f/w2f-ir"] === "workspace:*",
    "NODE-12 environment package must reuse W2F IR",
  );

  const types = read("packages/environment-capture/src/types.ts");
  for (const evidence of [
    'ENVIRONMENT_CAPTURE_VERSION = "1.0.0"',
    "RuntimeEnvironmentEvidence",
    "MediaRuleEvidence",
    "ContainerDefinitionEvidence",
    "ContainerQueryEvidence",
    "pageZoomAvailability",
    "colorScheme",
    "reducedMotion",
    "affectedProperties",
    "affectedSourceNodeIds",
    "ENV_STYLESHEET_INACCESSIBLE",
    "ENV_PAGE_ZOOM_UNAVAILABLE",
  ]) {
    assert(types.includes(evidence), `NODE-12 environment contract missing ${evidence}`);
  }

  const engine = read("packages/environment-capture/src/capture.ts");
  for (const evidence of [
    "createEnvironmentCapture",
    "toWtfCaptureEnvironment",
    "toWtfMediaRuleTraces",
    "toWtfContainerQueryInfo",
    "summarizeEnvironmentCapture",
    "isEnvironmentCapture",
    'pageZoomAvailability !== "observed"',
  ]) {
    assert(engine.includes(evidence), `NODE-12 environment engine missing ${evidence}`);
  }
  for (const forbidden of [
    "getComputedStyle(",
    "document.",
    "window.",
    "matchMedia(",
    "CSSStyleSheet",
  ]) {
    assert(
      !engine.includes(forbidden),
      `NODE-12 core environment package must remain platform-neutral; found ${forbidden}`,
    );
  }

  const standard = read("packages/standard-capture-adapter/src/environment-capture.ts");
  for (const evidence of [
    "styleSheets",
    "adoptedStyleSheets",
    "CSSMediaRule",
    "matchMedia",
    "CSSContainerRule",
    'getPropertyValue("container-name")',
    'getPropertyValue("container-type")',
    'matchMedia("(prefers-color-scheme: dark)")',
    'matchMedia("(prefers-reduced-motion: reduce)")',
    "affectedSourceNodeIds",
    "ENV_CAPTURE_BUDGET_EXCEEDED",
  ]) {
    assert(standard.includes(evidence), `NODE-12 Standard acquisition missing ${evidence}`);
  }
  for (const forbidden of ["document.cookie", "localStorage", "sessionStorage"]) {
    assert(
      !standard.includes(forbidden),
      `NODE-12 environment acquisition must not read ${forbidden}`,
    );
  }

  const runtime = read("apps/browser-extension/src/runtime/environment-runtime.ts");
  for (const evidence of [
    "buildStandardEnvironmentInput",
    "environmentSnapshotId",
    "captureStandardEnvironmentInPage",
    "createEnvironmentCapture",
    "browserPageZoomAvailability",
    "visualViewportScale",
  ]) {
    assert(runtime.includes(evidence), `NODE-12 Browser runtime missing ${evidence}`);
  }

  const store = read("apps/browser-extension/src/runtime/environment-store.ts");
  for (const evidence of [
    'W2F_ENVIRONMENT_DB_NAME = "w2f-environment"',
    'W2F_ENVIRONMENT_KEY_PREFIX = "environment:"',
    "writeEnvironmentCapture",
    "readEnvironmentCapture",
    "deleteEnvironmentCapture",
  ]) {
    assert(store.includes(evidence), `NODE-12 Browser environment store missing ${evidence}`);
  }

  const worker = read("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of [
    "captureEnvironmentForSnapshot",
    "writeEnvironmentCapture",
    "deleteEnvironmentCapture",
    "mediaRuleCount",
    "containerQueryCount",
  ]) {
    assert(worker.includes(evidence), `NODE-12 service worker missing ${evidence}`);
  }

  const jobState = read("apps/browser-extension/src/runtime/job-state.ts");
  for (const evidence of [
    "environmentStorageKey",
    "environmentAdapter",
    "mediaRuleCount",
    "activeMediaRuleCount",
    "containerCount",
    "containerQueryCount",
    "environmentDiagnosticCount",
  ]) {
    assert(jobState.includes(evidence), `NODE-12 job receipt missing ${evidence}`);
  }

  const browserPackage = JSON.parse(read("apps/browser-extension/package.json"));
  assert(
    browserPackage.dependencies?.["@w2f/environment-capture"] === "workspace:*",
    "Browser Extension must consume @w2f/environment-capture",
  );
  const standardPackage = JSON.parse(read("packages/standard-capture-adapter/package.json"));
  assert(
    standardPackage.dependencies?.["@w2f/environment-capture"] === "workspace:*",
    "Standard adapter must consume @w2f/environment-capture",
  );

  const ir = read("packages/w2f-ir/src/types.ts");
  for (const evidence of [
    "WtfCaptureEnvironment",
    "WtfMediaRuleTrace",
    "WtfContainerQueryInfo",
    "WtfResponsivePayload",
  ]) {
    assert(ir.includes(evidence), `NODE-12 requires existing IR contract ${evidence}`);
  }

  const raw = read("packages/capture-core/src/types.ts");
  assert(
    raw.includes('RAW_SNAPSHOT_VERSION = "1.0.0"'),
    "NODE-12 must not version-bump RawSnapshot",
  );
  assert(
    raw.includes("browserPageZoomAvailability"),
    "NODE-12 requires explicit RawSnapshot page zoom availability evidence",
  );
}

if (failures.length > 0) {
  console.error("NODE-12 foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NODE-12 foundation validation passed.");
