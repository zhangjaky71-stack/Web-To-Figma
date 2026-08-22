import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const obsoleteMime = ["application", "x-w2f"].join("/");

const versions = {
  pnpm: "11.22.0",
  turbo: "2.10.11",
  typescript: "6.0.3",
  eslint: "10.8.1",
  typescriptEslint: "8.67.0",
  prettier: "3.9.6",
  vitest: "4.1.11",
};

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.mjs",
  ".prettierrc.json",
  ".npmrc",
  ".nvmrc",
  ".github/workflows/ci.yml",
  "apps/browser-extension/package.json",
  "apps/browser-extension/tsconfig.json",
  "apps/browser-extension/tsconfig.build.json",
  "apps/browser-extension/src/index.ts",
  "apps/browser-extension/src/runtime/protocol.ts",
  "apps/browser-extension/src/runtime/job-state.ts",
  "apps/browser-extension/src/runtime/service-worker.ts",
  "apps/browser-extension/src/runtime/content-script.ts",
  "apps/browser-extension/src/runtime/popup.ts",
  "apps/browser-extension/src/runtime/options.ts",
  "apps/browser-extension/static/manifest.json",
  "apps/browser-extension/static/popup.html",
  "apps/browser-extension/static/options.html",
  "apps/browser-extension/scripts/package-extension.mjs",
  "apps/browser-extension/scripts/validate-extension-package.mjs",
  "apps/figma-plugin/package.json",
  "apps/figma-plugin/tsconfig.json",
  "apps/figma-plugin/tsconfig.build.json",
  "apps/figma-plugin/src/index.ts",
  "packages/shared-utils/package.json",
  "packages/shared-utils/tsconfig.json",
  "packages/shared-utils/tsconfig.build.json",
  "packages/shared-utils/src/index.ts",
];

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

function walkFiles(relativeDirectory) {
  const absoluteDirectory = resolve(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  const files = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const relativePath = `${relativeDirectory}/${entry}`;
    const absolutePath = resolve(root, relativePath);
    if (statSync(absolutePath).isDirectory()) files.push(...walkFiles(relativePath));
    else files.push(relativePath);
  }
  return files;
}

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `missing ${file}`);
}

if (failures.length === 0) {
  const rootPackage = readJson("package.json");
  assert(
    rootPackage.packageManager === `pnpm@${versions.pnpm}`,
    `root packageManager must be pnpm@${versions.pnpm}`,
  );
  assert(rootPackage.engines?.node === ">=24 <25", "Node engine must be >=24 <25");
  assert(readText(".nvmrc").trim() === "24", ".nvmrc must pin Node 24");
  assert(
    rootPackage.scripts?.["validate:foundation"] === "node scripts/validate-foundation.mjs",
    "validate:foundation script is missing or drifted",
  );
  assert(
    rootPackage.scripts?.build === "turbo run build" &&
      rootPackage.scripts?.lint === "turbo run lint" &&
      rootPackage.scripts?.typecheck === "turbo run typecheck" &&
      rootPackage.scripts?.test === "turbo run test",
    "root quality scripts must run through Turborepo",
  );
  assert(
    rootPackage.scripts?.check ===
      "pnpm validate:foundation && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check",
    "root check script must cover foundation, lint, typecheck, test, build and format",
  );

  const expectedDevDependencies = {
    eslint: versions.eslint,
    prettier: versions.prettier,
    turbo: versions.turbo,
    typescript: versions.typescript,
    "typescript-eslint": versions.typescriptEslint,
    vitest: versions.vitest,
  };
  for (const [dependency, expectedVersion] of Object.entries(expectedDevDependencies)) {
    assert(
      rootPackage.devDependencies?.[dependency] === expectedVersion,
      `${dependency} must be pinned to ${expectedVersion}`,
    );
  }

  const npmrc = readText(".npmrc");
  assert(npmrc.includes("engine-strict=true"), ".npmrc must enforce engines");
  assert(
    npmrc.includes("shared-workspace-lockfile=true"),
    ".npmrc must use a shared workspace lockfile",
  );
  assert(npmrc.includes("save-exact=true"), ".npmrc must save exact dependency versions");

  const workspace = readText("pnpm-workspace.yaml");
  assert(
    workspace.includes("apps/*") && workspace.includes("packages/*"),
    "workspace globs must include apps/* and packages/*",
  );

  const turbo = readJson("turbo.json");
  for (const task of ["build", "lint", "typecheck", "test"]) {
    assert(Boolean(turbo.tasks?.[task]), `turbo task ${task} is missing`);
  }
  assert(turbo.tasks?.build?.outputs?.includes("dist/**"), "turbo build must declare dist/** output");

  for (const directory of ["apps/browser-extension", "apps/figma-plugin", "packages/shared-utils"]) {
    const packageJson = readJson(`${directory}/package.json`);
    const buildCommand = packageJson.scripts?.build ?? "";
    if (directory === "apps/browser-extension") {
      assert(
        buildCommand.includes("tsc -p tsconfig.build.json"),
        "browser extension build must compile with tsconfig.build.json",
      );
      assert(
        buildCommand.includes("package-extension.mjs") &&
          buildCommand.includes("validate-extension-package.mjs"),
        "browser extension build must package and validate the loadable MV3 output",
      );
    } else {
      assert(
        buildCommand === "tsc -p tsconfig.build.json",
        `${directory} build must use tsconfig.build.json`,
      );
    }
    assert(
      packageJson.scripts?.typecheck === "tsc -p tsconfig.json --noEmit",
      `${directory} typecheck command drifted`,
    );
    assert(packageJson.scripts?.test === "vitest run", `${directory} test must use vitest run`);
    assert(
      packageJson.devDependencies?.typescript === versions.typescript,
      `${directory} TypeScript version drifted`,
    );
    assert(
      packageJson.devDependencies?.vitest === versions.vitest,
      `${directory} Vitest version drifted`,
    );

    const buildConfig = readJson(`${directory}/tsconfig.build.json`);
    const buildIncludes = buildConfig.include ?? [];
    const buildExcludes = buildConfig.exclude ?? [];
    assert(
      buildIncludes.some((value) => value.startsWith("src/")),
      `${directory} build config must include src`,
    );
    assert(
      buildExcludes.some((value) => value.includes("test")),
      `${directory} build config must exclude tests`,
    );
  }

  const browserManifest = readJson("apps/browser-extension/static/manifest.json");
  assert(browserManifest.manifest_version === 3, "browser extension must use Manifest V3");
  assert(
    browserManifest.background?.service_worker === "runtime/service-worker.js" &&
      browserManifest.background?.type === "module",
    "browser extension must use the module service worker entrypoint",
  );
  assert(
    browserManifest.action?.default_popup === "popup.html",
    "browser extension popup entrypoint drifted",
  );
  const browserPermissions = [...(browserManifest.permissions ?? [])].sort();
  assert(
    JSON.stringify(browserPermissions) ===
      JSON.stringify(["activeTab", "scripting", "storage"].sort()),
    "NODE-05 browser permissions must remain least-privilege activeTab+scripting+storage",
  );
  assert(!("host_permissions" in browserManifest), "NODE-05 must not request broad host permissions");
  assert(!("content_scripts" in browserManifest), "NODE-05 content bridge must be user-action injected");

  const sharedUtils = readJson("packages/shared-utils/package.json");
  assert(
    sharedUtils.exports?.["."] === "./dist/index.js",
    "shared-utils export must point to ./dist/index.js",
  );
  assert(sharedUtils.types === "./dist/index.d.ts", "shared-utils types must point to ./dist/index.d.ts");

  const constantsSource = readText("packages/shared-utils/src/index.ts");
  assert(constantsSource.includes('WTF_FILE_EXTENSION = ".wtf"'), ".wtf extension contract drifted");
  assert(
    constantsSource.includes('WTF_MIME_TYPE = "application/x-wtf"'),
    ".wtf MIME contract drifted",
  );

  const sourceAndCurrentDocFiles = [
    ...walkFiles("apps"),
    ...walkFiles("packages"),
    ...walkFiles("scripts"),
    "docs/PRODUCT_BASELINE_V2.md",
    "docs/ACCEPTANCE_CONTRACT_V2.md",
    "docs/CAPTURE_SEMANTICS.md",
    "docs/KNOWN_LIMITATIONS.md",
    "docs/IMPLEMENTATION_STATUS.md",
  ].filter((path) => existsSync(resolve(root, path)));

  for (const path of sourceAndCurrentDocFiles) {
    const content = readText(path);
    assert(!content.includes(obsoleteMime), `${path} contains obsolete MIME ${obsoleteMime}`);
  }

  const ci = readText(".github/workflows/ci.yml");
  assert(ci.includes("node-version: 24"), "CI must use Node 24");
  assert(ci.includes(`version: ${versions.pnpm}`), `CI must use pnpm ${versions.pnpm}`);
  assert(
    ci.includes("node scripts/validate-foundation.mjs"),
    "CI must run the dependency-free foundation validator before dependency installation",
  );

  if (existsSync(resolve(root, "pnpm-lock.yaml"))) {
    assert(ci.includes("pnpm install --frozen-lockfile"), "CI must use --frozen-lockfile");
    assert(
      !ci.includes("pnpm install --no-frozen-lockfile"),
      "CI must not keep bootstrap --no-frozen-lockfile after lockfile commit",
    );
  }
}

if (failures.length > 0) {
  console.error(`Foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Foundation validation passed.");
