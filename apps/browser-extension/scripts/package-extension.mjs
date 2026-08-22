import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const sourceRuntimePath = `${outputRoot}/runtime/source-runtime.js`;
const sourceRuntime = await readFile(sourceRuntimePath, "utf8");
const rewrittenSourceRuntime = sourceRuntime.replaceAll(
  'from "@w2f/source-providers"',
  'from "./source-providers/index.js"',
);
if (rewrittenSourceRuntime === sourceRuntime) {
  throw new Error("source-runtime.js did not contain the expected @w2f/source-providers runtime import");
}
await writeFile(sourceRuntimePath, rewrittenSourceRuntime, "utf8");

await rm(stagingRoot, { recursive: true, force: true });
