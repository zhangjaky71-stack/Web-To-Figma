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
  "runtime/profile-compliant-wtf-package.js",
  "runtime/pixel-ground-truth-contract.js",
  "runtime/wtf-package-store.js",
  "runtime/wtf-export-runtime.js",
  "runtime/wtf-packager/index.js",
  "runtime/wtf-packager/types.js",
  "runtime/wtf-packager/packager.js",
  "runtime/wtf-packager/zip.js",
  "runtime/w2f-ir/index.js",
  "runtime/w2f-schema/index.js",
  "runtime/w2f-schema/frame-context.js",
  "runtime/service-worker.js",
  "runtime/popup.js",
  "manifest.json",
]) {
  assert(existsSync(resolve(outputRoot, path)), `missing packaged ${path}`);
}

const packager = text("runtime/wtf-packager/packager.js");
for (const evidence of [
  "packageWtf",
  "canonicalStringify",
  "SHA-256",
  "encodeDeterministicZip",
  "WTF_MIME_TYPE",
]) {
  assert(packager.includes(evidence), `packaged WTF writer missing ${evidence}`);
}
for (const forbidden of [
  "chrome.",
  "indexedDB",
  "document.",
  "window.",
  "fetch(",
  "Math.random",
  "Date.now",
]) {
  assert(!packager.includes(forbidden), `WTF writer core must not use ${forbidden}`);
}

const zip = text("runtime/wtf-packager/zip.js");
for (const evidence of [
  "encodeDeterministicZip",
  "crc32",
  "0x04034b50",
  "0x02014b50",
  "0x06054b50",
]) {
  assert(zip.includes(evidence), `packaged deterministic ZIP writer missing ${evidence}`);
}

const builder = text("runtime/wtf-package-builder.js");
for (const evidence of [
  "WTF_DEFAULT_ENTRYPOINTS",
  "references/index.json",
  "source/relationships.json",
  "revisions.json",
  "buildWtfPackage",
]) {
  assert(builder.includes(evidence), `packaged WTF payload builder missing ${evidence}`);
}

const profileCompliantBuilder = text("runtime/profile-compliant-wtf-package.js");
for (const evidence of [
  "assertProfileRequiredPixelGroundTruth",
  "buildWtfPackage",
  "buildProfileCompliantWtfPackage",
]) {
  assert(
    profileCompliantBuilder.includes(evidence),
    `packaged profile-compliant WTF builder missing ${evidence}`,
  );
}

const pixelContract = text("runtime/pixel-ground-truth-contract.js");
for (const evidence of [
  "assertProfileRequiredPixelGroundTruth",
  "planRasterTiles",
  "viewport:current",
  "full-page:current",
  "RASTER_TILE_MISSING",
  "unreferenced tile resource",
]) {
  assert(
    pixelContract.includes(evidence),
    `packaged profile Pixel Ground Truth contract missing ${evidence}`,
  );
}

const ir = text("runtime/w2f-ir/index.js");
assert(
  ir.includes("./types.js"),
  "packaged W2F IR runtime must expose the shared IR version contract",
);

const schema = text("runtime/w2f-schema/index.js");
for (const evidence of [
  "application/x-wtf",
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
]) {
  assert(
    schema.includes(evidence),
    `packaged shared schema missing canonical WTF contract ${evidence}`,
  );
}

const typeRuntime = text("runtime/wtf-packager/types.js");
for (const evidence of ["manifest.json", "checksums.json"]) {
  assert(
    typeRuntime.includes(evidence),
    `packaged WTF type runtime missing reserved path ${evidence}`,
  );
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
  "readPixelGroundTruth",
  "buildProfileCompliantWtfPackage",
  "writeWtfPackage",
  "persistWtfExport",
]) {
  assert(exportRuntime.includes(evidence), `packaged WTF export runtime missing ${evidence}`);
}
assert(
  !exportRuntime.includes("buildWtfPackage("),
  "packaged WTF export runtime must not bypass the profile-compliant builder",
);

const worker = text("runtime/service-worker.js");
for (const evidence of ["W2F_EXPORT_WTF", "persistWtfExport", "deleteWtfPackage"]) {
  assert(
    worker.includes(evidence),
    `packaged service worker WTF orchestration missing ${evidence}`,
  );
}

const popup = text("runtime/popup.js");
for (const evidence of [
  "readWtfPackage",
  "Blob",
  "URL.createObjectURL",
  "chrome.downloads.download",
  "Export .wtf",
]) {
  assert(popup.includes(evidence), `packaged popup export flow missing ${evidence}`);
}

const manifestText = text("manifest.json");
try {
  const manifest = JSON.parse(manifestText);
  assert(
    Array.isArray(manifest.permissions) && manifest.permissions.includes("downloads"),
    "packaged manifest must request downloads permission",
  );
} catch {
  assert(false, "packaged manifest must be valid JSON");
}

if (failures.length > 0) {
  console.error(
    `NODE-21 package validation failed (${profile}):\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`NODE-21 package validation passed (${profile}).`);
}
