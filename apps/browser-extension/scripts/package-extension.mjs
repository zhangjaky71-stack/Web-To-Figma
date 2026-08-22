import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const stagingRoot = `${appRoot}/.build`;
const outputRoot = `${appRoot}/dist`;
const sourceProvidersDist = fileURLToPath(
  new URL("../../../packages/source-providers/dist/", import.meta.url),
);

await mkdir(outputRoot, { recursive: true });
await cp(`${appRoot}/static`, outputRoot, { recursive: true });
await mkdir(`${outputRoot}/runtime`, { recursive: true });
await cp(`${stagingRoot}/runtime`, `${outputRoot}/runtime`, { recursive: true });

await mkdir(`${outputRoot}/runtime/source-providers`, { recursive: true });
await cp(sourceProvidersDist, `${outputRoot}/runtime/source-providers`, { recursive: true });

const runtimeEntries = await readdir(`${outputRoot}/runtime`, { withFileTypes: true });
let rewrittenImports = 0;
for (const entry of runtimeEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const runtimePath = `${outputRoot}/runtime/${entry.name}`;
  const source = await readFile(runtimePath, "utf8");
  const rewritten = source.replaceAll(
    'from "@w2f/source-providers"',
    'from "./source-providers/index.js"',
  );
  if (rewritten !== source) {
    rewrittenImports += 1;
    await writeFile(runtimePath, rewritten, "utf8");
  }
}

if (rewrittenImports === 0) {
  throw new Error("No Browser runtime import of @w2f/source-providers was rewritten");
}

await rm(stagingRoot, { recursive: true, force: true });
