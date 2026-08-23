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
function readJson(path) {
  return JSON.parse(readText(path));
}

const requiredFiles = [
  "packages/wtf-packager/package.json",
  "packages/wtf-packager/tsconfig.json",
  "packages/wtf-packager/tsconfig.build.json",
  "packages/wtf-packager/src/index.ts",
  "packages/wtf-packager/src/types.ts",
  "packages/wtf-packager/src/packager.ts",
  "packages/wtf-packager/src/zip.ts",
  "packages/wtf-packager/test/packager.test.ts",
  "apps/browser-extension/src/runtime/wtf-package-builder.ts",
  "apps/browser-extension/src/runtime/wtf-package-store.ts",
  "apps/browser-extension/src/runtime/wtf-export-runtime.ts",
  "apps/browser-extension/test/wtf-package-store.test.ts",
  "apps/browser-extension/scripts/validate-node-21-package.mjs",
  "docs/WTF_PACKAGER_V2.md",
  "docs/adr/ADR-0021-deterministic-wtf-writer.md",
  "docs/nodes/NODE-21_WTF_PACKAGER.md",
];
for (const file of requiredFiles) assert(existsSync(resolve(root, file)), `NODE-21 missing ${file}`);

if (failures.length === 0) {
  const packageJson = readJson("packages/wtf-packager/package.json");
  assert(packageJson.name === "@w2f/wtf-packager", "NODE-21 package name drifted");
  assert(packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*", "WTF Packager must consume shared schema");

  const types = readText("packages/wtf-packager/src/types.ts");
  for (const evidence of ["WTF_PACKAGER_VERSION", "WTF_MANIFEST_PATH", "WTF_CHECKSUMS_PATH", "WtfPackagerInput", "WtfPackageResult"]) {
    assert(types.includes(evidence), `WTF Packager contract missing ${evidence}`);
  }

  const packager = readText("packages/wtf-packager/src/packager.ts");
  for (const evidence of [
    "packageWtf",
    "canonicalStringify",
    "validateWtfManifest",
    "validateChecksums",
    "validateContainerEntries",
    "WTF_REQUIRED_PAYLOAD_PATHS",
    "encodeDeterministicZip",
    "SHA-256",
    "application/x-wtf",
  ]) {
    assert(packager.includes(evidence), `WTF Packager core missing ${evidence}`);
  }
  for (const forbidden of ["chrome.", "indexedDB", "document.", "window.", "fetch(", "Math.random", "Date.now", "localStorage"]) {
    assert(!packager.includes(forbidden), `WTF Packager core must not use ${forbidden}`);
  }

  const zip = readText("packages/wtf-packager/src/zip.ts");
  for (const evidence of ["encodeDeterministicZip", "crc32", "ZIP_STORE_METHOD", "ZIP_DOS_DATE = 33", "localeCompare"]) {
    assert(zip.includes(evidence), `deterministic ZIP writer missing ${evidence}`);
  }

  const builder = readText("apps/browser-extension/src/runtime/wtf-package-builder.ts");
  for (const evidence of [
    "buildWtfPackageInput",
    "buildWtfPackage",
    "references/index.json",
    "source/relationships.json",
    "revisions.json",
    "pixel-ground-truth",
    "raster-tiles",
  ]) {
    assert(builder.includes(evidence), `Browser WTF builder missing ${evidence}`);
  }

  const store = readText("apps/browser-extension/src/runtime/wtf-package-store.ts");
  for (const evidence of ["w2f-wtf-packages", "wtf-package:", "writeWtfPackage", "readWtfPackage", "deleteWtfPackage"]) {
    assert(store.includes(evidence), `Browser WTF package store missing ${evidence}`);
  }

  const exportRuntime = readText("apps/browser-extension/src/runtime/wtf-export-runtime.ts");
  for (const evidence of ["persistWtfExport", "readResponsiveCapture", "readResponsiveInference", "primaryArtifactId", "writeWtfPackage"]) {
    assert(exportRuntime.includes(evidence), `Browser WTF export runtime missing ${evidence}`);
  }

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(browserPackage.dependencies?.["@w2f/wtf-packager"] === "workspace:*", "Browser must depend on wtf-packager");
  for (const script of ["build", "build:standard", "build:high-fidelity", "validate:package", "validate:package:high-fidelity"]) {
    assert(browserPackage.scripts?.[script]?.includes("validate-node-21-package.mjs"), `Browser ${script} must require NODE-21 package validation`);
  }

  const packageExtension = readText("apps/browser-extension/scripts/package-extension.mjs");
  assert(packageExtension.includes('specifier: "@w2f/wtf-packager"') && packageExtension.includes('directory: "wtf-packager"'), "Browser packager must ship WTF Packager runtime");

  for (const manifestPath of ["apps/browser-extension/static/manifest.json", "apps/browser-extension/static/manifest.high-fidelity.json"]) {
    const manifest = readJson(manifestPath);
    assert(manifest.permissions?.includes("downloads"), `${manifestPath} must include downloads permission`);
  }

  const protocol = readText("apps/browser-extension/src/runtime/protocol.ts");
  assert(protocol.includes("W2F_EXPORT_WTF"), "Browser protocol must expose W2F_EXPORT_WTF");
  assert(protocol.includes("WtfExportReceipt"), "Browser protocol must expose WtfExportReceipt response data");

  const worker = readText("apps/browser-extension/src/runtime/service-worker.ts");
  for (const evidence of ["persistWtfExport", "deleteWtfPackage", "W2F_EXPORT_WTF"]) {
    assert(worker.includes(evidence), `Service worker WTF orchestration missing ${evidence}`);
  }

  const popup = readText("apps/browser-extension/src/runtime/popup.ts");
  for (const evidence of ["readWtfPackage", "isWtfExportReceipt", "new Blob", "URL.createObjectURL", "chrome.downloads.download", "export-wtf"]) {
    assert(popup.includes(evidence), `Popup WTF download flow missing ${evidence}`);
  }

  const normative = readText("docs/WTF_PACKAGER_V2.md");
  for (const evidence of ["manifest.json", "checksums.json", "deterministic", "ZIP", "SHA-256", "Web → `.wtf`", "NODE-23"]) {
    assert(normative.includes(evidence), `NODE-21 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(`NODE-21 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-21 foundation validation passed.");
}
