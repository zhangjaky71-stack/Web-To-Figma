import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.mjs",
  ".prettierrc.json",
  "apps/browser-extension/package.json",
  "apps/browser-extension/tsconfig.json",
  "apps/browser-extension/tsconfig.build.json",
  "apps/figma-plugin/package.json",
  "apps/figma-plugin/tsconfig.json",
  "apps/figma-plugin/tsconfig.build.json",
  "packages/shared-utils/package.json",
  "packages/shared-utils/tsconfig.json",
  "packages/shared-utils/tsconfig.build.json",
  "packages/shared-utils/src/index.ts",
];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `missing ${file}`);
}

if (failures.length === 0) {
  const rootPackage = readJson("package.json");
  assert(
    rootPackage.packageManager === "pnpm@11.22.0",
    "root packageManager must be pnpm@11.22.0",
  );
  assert(rootPackage.engines?.node === ">=24 <25", "Node engine must be >=24 <25");
  assert(
    rootPackage.scripts?.["validate:foundation"] === "node scripts/validate-foundation.mjs",
    "validate:foundation script is missing or drifted",
  );

  const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
  assert(
    workspace.includes("apps/*") && workspace.includes("packages/*"),
    "workspace globs must include apps/* and packages/*",
  );

  for (const directory of [
    "apps/browser-extension",
    "apps/figma-plugin",
    "packages/shared-utils",
  ]) {
    const packageJson = readJson(`${directory}/package.json`);
    assert(
      packageJson.scripts?.build === "tsc -p tsconfig.build.json",
      `${directory} build must use tsconfig.build.json`,
    );
    assert(
      packageJson.scripts?.typecheck === "tsc -p tsconfig.json --noEmit",
      `${directory} typecheck command drifted`,
    );
  }

  const sharedUtils = readJson("packages/shared-utils/package.json");
  assert(
    sharedUtils.exports?.["."] === "./dist/index.js",
    "shared-utils export must point to ./dist/index.js",
  );
  assert(
    sharedUtils.types === "./dist/index.d.ts",
    "shared-utils types must point to ./dist/index.d.ts",
  );

  const constantsSource = readFileSync(
    resolve(root, "packages/shared-utils/src/index.ts"),
    "utf8",
  );
  assert(
    constantsSource.includes('WTF_FILE_EXTENSION = ".wtf"'),
    ".wtf extension contract drifted",
  );
  assert(
    constantsSource.includes('WTF_MIME_TYPE = "application/x-wtf"'),
    ".wtf MIME contract drifted",
  );
}

if (failures.length > 0) {
  console.error(
    `Foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("Foundation validation passed.");
