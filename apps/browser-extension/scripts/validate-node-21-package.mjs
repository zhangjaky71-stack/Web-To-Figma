import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = resolve(appRoot, profile === "high-fidelity" ? "dist-high-fidelity" : "dist");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function text(relativePath) {
  const path = resolve(outputRoot, relativePath);
  assert(existsSync(path), `missing packaged ${relativePath}`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

for (const path of [
  "runtime/wtf-package-builder.js",
  "runtime/wtf-package-store.js",
  "runtime/wtf-export-runtime.js",
  "runtime/wtf-packager/index.js",
  "runtime/wtf-packager/types.js",
  "runtime/wtf-packager/packager.js",
  "runtime/wtf-packager/zip.js",
  "runtime/service-worker.js",
  "runtime/popup.js",
  "manifest.json",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const packager = text("runtime/wtf-packager/packager.js");
for (const evidence of [
  "packageWtf",
  "manifest.json",
  "checksums.json",
  "canonicalStringify",
  "SHA-256",
  "encodeDeterministicZip",
  "application/x-wtf",
]) {
  assert(packager.includes(evidence), `packaged WTF writer missing ${evidence}`);
}
for (const forbidden of ["chrome.", "indexedDB", "document.", "window.", "fetch(", "Math.random", "Date.now"]) {
  assert(!packager.includes(forbidden), `WTF writer core must not use ${forbidden}`);
}

const zip = text("runtime/wtf-packager/zip.js");
for (const evidence of ["encodeDeterministicZip", "crc32", "0x04034b50", "0x02014b50", "0x06054b50"]) {
  assert(zip.includes(evidence), `packaged deterministic ZIP writer missing ${evidence}`);
}

const builder = text("runtime/wtf-package-builder.js");
for (const evidence of [
  "document.json",
  "source-graph.json",
  "render-tree.json",
  "styles.json",
  "assets.json",
  "responsive.json",
  "states.json",
  "diagnostics.json",
  "tokens.json",
  "source/cascade.json",
  "source/metadata.json",
  "references/index.json",
  "buildWtfPackage",
]) {
  assert(builder.includes(evidence), `packaged WTF payload builder missing ${evidence}`);
}

const store = text("runtime/wtf-package-store.js");
for (const evidence of [
  "w2f-wtf-packages",
  "wtf-package:",
  "writeWtfPackage",
  "readWtfPackage",
  "deleteWtfPackage",
]) {
  assert(store.includes(evidence), `packaged WTF package store missing ${evidence}`);
}

const exportRuntime = text("runtime/wtf-export-runtime.js");
for (const evidence of [
  "readResponsiveCapture",
  "readResponsiveInference",
  "buildWtfPackage",
  "writeWtfPackage",
  "persistWtfExport",
]) {
  assert(exportRuntime.includes(evidence), `packaged WTF export runtime missing ${evidence}`);
}

const worker = text("runtime/service-worker.js");
for (const evidence of ["W2F_EXPORT_WTF", "persistWtfExport", "deleteWtfPackage"]) {
  assert(worker.includes(evidence), `packaged service worker WTF orchestration missing ${evidence}`);
}

const popup = text("runtime/popup.js");
for (const evidence of ["readWtfPackage", "Blob", "URL.createObjectURL", "chrome.downloads.download", "Export .wtf"]) {
  assert(popup.includes(evidence), `packaged popup export flow missing ${evidence}`);
}

const manifestText = text("manifest.json");
try {
  const manifest = JSON.parse(manifestText);
  assert(Array.isArray(manifest.permissions) && manifest.permissions.includes("downloads"), "packaged manifest must request downloads permission");
} catch {
  assert(false, "packaged manifest must be valid JSON");
}

if (failures.length > 0) {
  console.error(`NODE-21 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`NODE-21 package validation passed (${profile}).`);
}
