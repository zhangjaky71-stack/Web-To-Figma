import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const foundationPath = resolve(root, "scripts/validate-foundation.mjs");
let foundation = readFileSync(foundationPath, "utf8");

if (!foundation.includes('import "./validate-node-24.mjs";')) {
  const marker = 'import "./validate-node-23.mjs";';
  if (!foundation.includes(marker)) {
    throw new Error("NODE-24 finalizer could not find NODE-23 foundation import marker");
  }
  foundation = foundation.replace(marker, `${marker}\nimport "./validate-node-24.mjs";`);
  writeFileSync(foundationPath, foundation);
}

console.log("NODE-24 integration finalizer applied successfully.");
