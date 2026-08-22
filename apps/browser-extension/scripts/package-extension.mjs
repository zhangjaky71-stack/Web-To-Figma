import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const stagingRoot = `${appRoot}/.build`;
const outputRoot = `${appRoot}/dist`;

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
    specifier: "@w2f/standard-capture-adapter",
    directory: "standard-capture-adapter",
    dist: fileURLToPath(
      new URL("../../../packages/standard-capture-adapter/dist/", import.meta.url),
    ),
  },
];

await mkdir(outputRoot, { recursive: true });
await cp(`${appRoot}/static`, outputRoot, { recursive: true });
await mkdir(`${outputRoot}/runtime`, { recursive: true });
await cp(`${stagingRoot}/runtime`, `${outputRoot}/runtime`, { recursive: true });

for (const runtimePackage of runtimePackages) {
  const destination = `${outputRoot}/runtime/${runtimePackage.directory}`;
  await mkdir(destination, { recursive: true });
  await cp(runtimePackage.dist, destination, { recursive: true });
}

const runtimeEntries = await readdir(`${outputRoot}/runtime`, { withFileTypes: true });
const rewrittenSpecifiers = new Map(runtimePackages.map((item) => [item.specifier, 0]));
for (const entry of runtimeEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const runtimePath = `${outputRoot}/runtime/${entry.name}`;
  const source = await readFile(runtimePath, "utf8");
  let rewritten = source;
  for (const runtimePackage of runtimePackages) {
    const replacement = `./${runtimePackage.directory}/index.js`;
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
