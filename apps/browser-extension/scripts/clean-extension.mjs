import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));

await Promise.all([
  rm(`${appRoot}/.build`, { recursive: true, force: true }),
  rm(`${appRoot}/dist`, { recursive: true, force: true }),
  rm(`${appRoot}/dist-high-fidelity`, { recursive: true, force: true }),
]);
