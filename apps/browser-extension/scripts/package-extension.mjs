import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const stagingRoot = `${appRoot}/.build`;
const outputRoot = `${appRoot}/dist`;

await mkdir(outputRoot, { recursive: true });
await cp(`${appRoot}/static`, outputRoot, { recursive: true });
await mkdir(`${outputRoot}/runtime`, { recursive: true });
await cp(`${stagingRoot}/runtime`, `${outputRoot}/runtime`, { recursive: true });
await rm(stagingRoot, { recursive: true, force: true });
