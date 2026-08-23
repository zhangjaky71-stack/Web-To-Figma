import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`NODE-23 finalizer made no change: ${path}`);
  await writeFile(path, after, "utf8");
}

await patch("scripts/validate-foundation.mjs", (source) => {
  if (source.includes('import "./validate-node-23.mjs";')) return source;
  return source.replace(
    'import "./validate-node-22.mjs";',
    'import "./validate-node-22.mjs";\nimport "./validate-node-23.mjs";',
  );
});

console.log("NODE-23 integration finalizer applied successfully.");
