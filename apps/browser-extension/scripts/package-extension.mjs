import { cp, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const stagingRoot = `${appRoot}/.build`;
const profile = process.env.W2F_BROWSER_PROFILE === "high-fidelity" ? "high-fidelity" : "standard";
const outputRoot = `${appRoot}/${profile === "high-fidelity" ? "dist-high-fidelity" : "dist"}`;

const runtimePackages = [
  {
    specifier: "@w2f/source-providers",
    directory: "source-providers",
    dist: fileURLToPath(new URL("../../../packages/source-providers/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/capture-core",
    directory: "capture-core",
    dist: fileURLToPath(new URL("../../../packages/capture-core/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/css-cascade",
    directory: "css-cascade",
    dist: fileURLToPath(new URL("../../../packages/css-cascade/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/environment-capture",
    directory: "environment-capture",
    dist: fileURLToPath(new URL("../../../packages/environment-capture/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/asset-resolver",
    directory: "asset-resolver",
    dist: fileURLToPath(new URL("../../../packages/asset-resolver/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/pixel-ground-truth",
    directory: "pixel-ground-truth",
    dist: fileURLToPath(new URL("../../../packages/pixel-ground-truth/dist/", import.meta.url)),
  },
  {
    specifier: "@w2f/standard-capture-adapter",
    directory: "standard-capture-adapter",
    dist: fileURLToPath(
      new URL("../../../packages/standard-capture-adapter/dist/", import.meta.url),
    ),
  },
  {
    specifier: "@w2f/cdp-capture-adapter",
    directory: "cdp-capture-adapter",
    dist: fileURLToPath(new URL("../../../packages/cdp-capture-adapter/dist/", import.meta.url)),
  },
];

async function walkJsFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(`${directory}/${entry.name}`, relativePath)));
    } else if (entry.name.endsWith(".js")) {
      files.push(relativePath);
    }
  }
  return files;
}

function relativePackageImport(sourceFile, packageDirectory) {
  const relative = posix.relative(posix.dirname(sourceFile), `${packageDirectory}/index.js`);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

await mkdir(outputRoot, { recursive: true });
await cp(`${appRoot}/static`, outputRoot, { recursive: true });
if (profile === "high-fidelity") {
  const manifest = await readFile(`${outputRoot}/manifest.high-fidelity.json`, "utf8");
  await writeFile(`${outputRoot}/manifest.json`, manifest, "utf8");
}
await unlink(`${outputRoot}/manifest.high-fidelity.json`).catch(() => undefined);

await mkdir(`${outputRoot}/runtime`, { recursive: true });
await cp(`${stagingRoot}/runtime`, `${outputRoot}/runtime`, { recursive: true });

for (const runtimePackage of runtimePackages) {
  const destination = `${outputRoot}/runtime/${runtimePackage.directory}`;
  await mkdir(destination, { recursive: true });
  await cp(runtimePackage.dist, destination, { recursive: true });
}

const runtimeFiles = await walkJsFiles(`${outputRoot}/runtime`);
const rewrittenSpecifiers = new Map(runtimePackages.map((item) => [item.specifier, 0]));
for (const relativeFile of runtimeFiles) {
  const runtimePath = `${outputRoot}/runtime/${relativeFile}`;
  const source = await readFile(runtimePath, "utf8");
  let rewritten = source;
  for (const runtimePackage of runtimePackages) {
    const replacement = relativePackageImport(relativeFile, runtimePackage.directory);
    const before = rewritten;
    rewritten = rewritten.replaceAll(`from "${runtimePackage.specifier}"`, `from "${replacement}"`);
    if (rewritten !== before) {
      rewrittenSpecifiers.set(
        runtimePackage.specifier,
        (rewrittenSpecifiers.get(runtimePackage.specifier) ?? 0) + 1,
      );
    }
  }
  if (rewritten !== source) await writeFile(runtimePath, rewritten, "utf8");
}

for (const runtimePackage of runtimePackages) {
  if ((rewrittenSpecifiers.get(runtimePackage.specifier) ?? 0) === 0) {
    throw new Error(`No Browser runtime import of ${runtimePackage.specifier} was rewritten`);
  }
}

await rm(stagingRoot, { recursive: true, force: true });
