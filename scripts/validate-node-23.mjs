import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}
function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}
function json(path) {
  return JSON.parse(text(path));
}

const requiredFiles = [
  "packages/wtf-parser/package.json",
  "packages/wtf-parser/src/index.ts",
  "packages/wtf-parser/src/types.ts",
  "packages/wtf-parser/src/zip-reader.ts",
  "packages/wtf-parser/src/parser.ts",
  "packages/wtf-parser/src/svg-sanitize.ts",
  "packages/wtf-parser/src/migrations.ts",
  "packages/wtf-parser/test/zip-reader.test.ts",
  "packages/wtf-parser/test/parser.test.ts",
  "packages/wtf-parser/test/svg-sanitize.test.ts",
  "packages/wtf-parser/test/migrations.test.ts",
  "packages/w2f-schema/src/container-paths.ts",
  "packages/w2f-schema/src/public.ts",
  "docs/SECURE_PARSER_MIGRATION_V2.md",
  "docs/adr/ADR-0023-hostile-wtf-parser-boundary.md",
  "docs/nodes/NODE-23_SECURE_PARSER_MIGRATION.md",
];
for (const path of requiredFiles) assert(existsSync(resolve(root, path)), `NODE-23 missing ${path}`);

if (failures.length === 0) {
  const parserPackage = json("packages/wtf-parser/package.json");
  assert(parserPackage.name === "@w2f/wtf-parser", "secure parser package name drifted");
  assert(parserPackage.dependencies?.["@w2f/w2f-schema"] === "workspace:*", "parser must consume shared W2F schema");
  assert(parserPackage.dependencies?.["@w2f/w2f-ir"] === "workspace:*", "parser must consume shared W2F IR");
  assert(parserPackage.devDependencies?.["@w2f/wtf-packager"] === "workspace:*", "parser hostile fixtures must use the real NODE-21 packager");

  const schemaPackage = json("packages/w2f-schema/package.json");
  assert(schemaPackage.exports?.["./container-paths"]?.default === "./dist/container-paths.js", "schema must export reserved container paths");
  assert(schemaPackage.exports?.["."]?.default === "./dist/public.js", "schema root must expose the public barrel");
  const containerPaths = text("packages/w2f-schema/src/container-paths.ts");
  assert(containerPaths.includes('WTF_MANIFEST_PATH = "manifest.json"'), "manifest reserved path is not centralized");
  assert(containerPaths.includes('WTF_CHECKSUMS_PATH = "checksums.json"'), "checksums reserved path is not centralized");

  const types = text("packages/wtf-parser/src/types.ts");
  for (const evidence of [
    'WTF_PARSER_VERSION = "1.0.0"',
    "WTF_PARSER_ZIP_RATIO_LIMIT",
    "WTF_PARSER_ZIP_PATH_INVALID",
    "WTF_PARSER_CHECKSUM_MISMATCH",
    "WTF_PARSER_NESTED_ARCHIVE",
    "WTF_PARSER_SVG_UNSAFE",
    "WTF_PARSER_MIGRATION_UNSUPPORTED",
    "WtfParsedPackage",
    'tokenPolicy: "literal"',
  ]) assert(types.includes(evidence), `parser type contract missing ${evidence}`);

  const zip = text("packages/wtf-parser/src/zip-reader.ts");
  for (const evidence of [
    "WTF_HARD_SECURITY_LIMITS.maxArchiveBytes",
    "WTF_HARD_SECURITY_LIMITS.maxEntries",
    "WTF_HARD_SECURITY_LIMITS.maxEntryBytes",
    "WTF_HARD_SECURITY_LIMITS.maxCompressionRatio",
    "validatePortablePath",
    "ZIP_FLAG_ENCRYPTED",
    "ZIP64_SENTINEL_32",
    "WTF_PARSER_ZIP_DUPLICATE_PATH",
    "DecompressionStream",
    "reader.cancel",
    "crc32",
  ]) assert(zip.includes(evidence), `secure ZIP reader missing ${evidence}`);

  const parser = text("packages/wtf-parser/src/parser.ts");
  for (const evidence of [
    "validateWtfManifest",
    "checkReaderCompatibility",
    "validateChecksums",
    "validateContainerEntries",
    'subtle.digest("SHA-256"',
    "validateWtfIrBundle",
    "sanitizeSvgBytes",
    "migrateCompatibleV2",
    "WTF_PARSER_NESTED_ARCHIVE",
    "assertKnownImageMagic",
    "createPreview",
  ]) assert(parser.includes(evidence), `secure parser pipeline missing ${evidence}`);

  const svg = text("packages/wtf-parser/src/svg-sanitize.ts");
  for (const evidence of ["DOCTYPE", "ENTITY", "foreignObject", "EVENT_HANDLER", "SAFE_FRAGMENT", "javascript", "sanitizeSvgBytes"]) {
    assert(svg.includes(evidence), `SVG sanitizer missing ${evidence}`);
  }

  const migration = text("packages/wtf-parser/src/migrations.ts");
  assert(migration.includes("formatMajor !== 2 || schemaMajor !== 2"), "migration must reject unsupported major versions");
  assert(migration.includes("v2-compatible-pass-through"), "migration must report compatible V2 pass-through");

  const parserTests = text("packages/wtf-parser/test/parser.test.ts");
  for (const evidence of ["packageWtf", "encodeDeterministicZip", "WTF_PARSER_CHECKSUM_MISMATCH", "hidden.bin", "WTF_PARSER_SVG_UNSAFE", "future-capability"]) {
    assert(parserTests.includes(evidence), `parser hostile fixture missing ${evidence}`);
  }
  assert(text("packages/wtf-parser/test/zip-reader.test.ts").includes("../evil.json"), "Zip Slip regression fixture is missing");

  const figmaPackage = json("apps/figma-plugin/package.json");
  const parserLink = figmaPackage.dependencies?.["@w2f/wtf-parser"] ?? "";
  const localProtocol = ["workspace:", "link:", "file:"].some((prefix) => parserLink.startsWith(prefix));
  assert(localProtocol && parserLink.includes("wtf-parser"), "Figma UI secure parser dependency must resolve only to the local parser package");
  const figmaMain = text("apps/figma-plugin/src/main.ts");
  assert(figmaMain.includes("secureParserImplemented: true"), "Figma shell must advertise the completed secure parser");
  assert(figmaMain.includes("rendererImplemented: false"), "NODE-23 must not implement rendering early");
  const figmaUi = text("apps/figma-plugin/src/ui.ts");
  for (const evidence of ["parseWtfPackage", "WtfParserError", "WTF_PARSER_FAILED", 'stage: "validating"', 'stage: "migrating"', "applyParserPreview"]) {
    assert(figmaUi.includes(evidence), `Figma UI parser integration missing ${evidence}`);
  }

  const packageValidator = text("apps/figma-plugin/scripts/validate-plugin-package.mjs");
  for (const evidence of ["WTF_PARSER_ZIP_SIGNATURE", "WTF_PARSER_CHECKSUM_MISMATCH", "WTF_PARSER_SVG_UNSAFE", "v2-compatible-pass-through"]) {
    assert(packageValidator.includes(evidence), `Figma packaged-output validator missing ${evidence}`);
  }

  const normative = text("docs/SECURE_PARSER_MIGRATION_V2.md");
  for (const evidence of ["ZIP bomb", "ZIP slip", "SHA-256", "SVG", "migration", "NODE-24", "fail closed"]) {
    assert(normative.includes(evidence), `NODE-23 normative document missing ${evidence}`);
  }
}

if (failures.length > 0) {
  console.error(`NODE-23 foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-23 foundation validation passed.");
}
