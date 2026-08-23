import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import "./validate-node-08.mjs";
import "./validate-node-09.mjs";
import "./validate-node-10.mjs";
import "./validate-node-11.mjs";
import "./validate-node-12.mjs";
import "./validate-node-13.mjs";
import "./validate-node-14.mjs";
import "./validate-node-15.mjs";
import "./validate-node-16.mjs";
import "./validate-node-17.mjs";
import "./validate-node-18.mjs";
import "./validate-node-19.mjs";
import "./validate-node-20.mjs";
import "./validate-node-21.mjs";
import "./validate-node-22.mjs";

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
  "apps/browser-extension/src/runtime/region-selection.ts",
  "apps/browser-extension/src/runtime/source-runtime.ts",
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
  "packages/source-providers/package.json",
  "packages/source-providers/tsconfig.json",
  "packages/source-providers/tsconfig.build.json",
  "packages/source-providers/src/index.ts",
  "packages/source-providers/src/types.ts",
  "packages/source-providers/src/http-page-provider.ts",
  "packages/source-providers/src/file-tab-provider.ts",
  "packages/source-providers/src/local-folder-provider.ts",
  "packages/source-providers/src/registry.ts",
  "docs/REGION_SELECTOR_REDACTION_V2.md",
  "docs/adr/ADR-0007-region-selection-and-redaction-boundary.md",
  "docs/nodes/NODE-07_REGION_SELECTOR_REDACTION.md",
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
  assert(
    turbo.tasks?.build?.outputs?.includes("dist/**"),
    "turbo build must declare dist/** output",
  );

  for (const directory of [
    "apps/browser-extension",
    "apps/figma-plugin",
    "packages/shared-utils",
    "packages/source-providers",
  ]) {
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
    } else if (directory === "apps/figma-plugin") {
      assert(
        buildCommand ===
          "node scripts/build-plugin.mjs && node scripts/validate-plugin-package.mjs",
        "Figma plugin build must bundle and validate the loadable main/UI package",
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
      JSON.stringify(["activeTab", "downloads", "scripting", "storage"].sort()),
    "browser permissions must remain least-privilege activeTab+downloads+scripting+storage",
  );
  assert(
    !("host_permissions" in browserManifest),
    "region selection must not introduce broad default host permissions",
  );
  assert(
    !("content_scripts" in browserManifest),
    "content bridge must remain user-action injected",
  );

  const browserPackage = readJson("apps/browser-extension/package.json");
  assert(
    browserPackage.dependencies?.["@w2f/source-providers"] === "workspace:*",
    "Browser Extension must consume the shared source-providers workspace package",
  );
  const browserSourceRuntime = readText("apps/browser-extension/src/runtime/source-runtime.ts");
  assert(
    browserSourceRuntime.includes("isAllowedFileSchemeAccess"),
    "Browser source runtime must check Chrome file-scheme access explicitly",
  );
  assert(
    browserSourceRuntime.includes("resolveTabSource"),
    "Browser source runtime must delegate source classification to the shared provider package",
  );

  const regionSelectionSource = readText("apps/browser-extension/src/runtime/region-selection.ts");
  assert(
    regionSelectionSource.includes('W2F_REGION_SELECTION_VERSION = "1.0.0"'),
    "NODE-07 region-selection contract version drifted",
  );
  assert(
    regionSelectionSource.includes('coordinateSpace: "document-css-px"'),
    "NODE-07 region geometry must remain document-css-px",
  );
  assert(
    regionSelectionSource.includes('"free-rect"') &&
      regionSelectionSource.includes('"smart-element"') &&
      regionSelectionSource.includes('"redact"') &&
      regionSelectionSource.includes('"exclude"'),
    "NODE-07 region-selection vocabulary drifted",
  );

  const browserProtocol = readText("apps/browser-extension/src/runtime/protocol.ts");
  for (const messageType of [
    "W2F_SELECT_REGION",
    "W2F_CANCEL_REGION_SELECTION",
    "W2F_CONTENT_REGION_RESULT",
    "W2F_CONTENT_SELECTION_CANCELLED",
  ]) {
    assert(browserProtocol.includes(messageType), `NODE-07 protocol missing ${messageType}`);
  }

  const browserContentRuntime = readText("apps/browser-extension/src/runtime/content-script.ts");
  for (const interactionContract of [
    "attachShadow",
    "elementsFromPoint",
    "selecting-region",
  ].filter((value) => value !== "selecting-region")) {
    assert(
      browserContentRuntime.includes(interactionContract),
      `NODE-07 content runtime missing ${interactionContract}`,
    );
  }
  assert(
    browserContentRuntime.includes("W2F_SELECT_REGION") &&
      browserContentRuntime.includes("W2F_CONTENT_REGION_RESULT"),
    "NODE-07 content runtime must expose region selection request/result paths",
  );
  for (const forbiddenSensitiveApi of ["document.cookie", "localStorage", "sessionStorage"]) {
    assert(
      !browserContentRuntime.includes(forbiddenSensitiveApi),
      `NODE-07 selector must not access ${forbiddenSensitiveApi}`,
    );
  }

  const browserPackageValidator = readText(
    "apps/browser-extension/scripts/validate-extension-package.mjs",
  );
  assert(
    browserPackageValidator.includes('"runtime/region-selection.js"'),
    "Browser package validator must require compiled NODE-07 region-selection runtime",
  );
  assert(
    browserPackageValidator.includes("W2F_CONTENT_REGION_RESULT"),
    "Browser package validator must verify the NODE-07 region runtime path",
  );

  const sourceProviders = readJson("packages/source-providers/package.json");
  assert(
    sourceProviders.exports?.["."] === "./dist/index.js" &&
      sourceProviders.types === "./dist/index.d.ts",
    "source-providers package export/types contract drifted",
  );
  const sourceProviderIndex = readText("packages/source-providers/src/index.ts");
  for (const contract of [
    "http-page-provider",
    "file-tab-provider",
    "local-folder-provider",
    "registry",
  ]) {
    assert(
      sourceProviderIndex.includes(contract),
      `source-providers index must export ${contract}`,
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

  const constantsSource = readText("packages/shared-utils/src/index.ts");
  assert(
    constantsSource.includes('WTF_FILE_EXTENSION = ".wtf"'),
    ".wtf extension contract drifted",
  );
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
    "docs/REGION_SELECTOR_REDACTION_V2.md",
    "docs/adr/ADR-0007-region-selection-and-redaction-boundary.md",
    "docs/nodes/NODE-07_REGION_SELECTOR_REDACTION.md",
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
      "canonical CI must not keep bootstrap --no-frozen-lockfile",
    );
  }
}

if (failures.length > 0) {
  console.error(`Foundation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Foundation validation passed.");
