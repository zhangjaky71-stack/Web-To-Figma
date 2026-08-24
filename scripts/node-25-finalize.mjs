import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const foundationPath = resolve(root, "scripts/validate-foundation.mjs");
let foundation = readFileSync(foundationPath, "utf8");

if (!foundation.includes('import "./validate-node-25.mjs";')) {
  const marker = 'import "./validate-node-24.mjs";';
  if (!foundation.includes(marker)) {
    throw new Error("NODE-25 finalizer could not find NODE-24 foundation import marker");
  }
  foundation = foundation.replace(marker, `${marker}\nimport "./validate-node-25.mjs";`);
  writeFileSync(foundationPath, foundation);
}

console.log("NODE-25 integration finalizer applied successfully.");
