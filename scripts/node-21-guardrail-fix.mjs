import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`NODE-21 guardrail fix made no change: ${path}`);
  await writeFile(path, after, "utf8");
}

await patch("scripts/validate-node-08.mjs", (source) =>
  source
    .replace(
      'JSON.stringify(["activeTab", "scripting", "storage"].sort()),',
      'JSON.stringify(["activeTab", "downloads", "scripting", "storage"].sort()),',
    )
    .replace(
      '"NODE-08 must preserve activeTab+scripting+storage only",',
      '"NODE-08 must preserve activeTab+downloads+scripting+storage without host expansion",',
    ),
);

await patch("scripts/validate-node-09.mjs", (source) =>
  source
    .replace(
      'JSON.stringify(["activeTab", "scripting", "storage"].sort()),',
      'JSON.stringify(["activeTab", "downloads", "scripting", "storage"].sort()),',
    )
    .replace(
      'JSON.stringify(["activeTab", "debugger", "scripting", "storage"].sort()),',
      'JSON.stringify(["activeTab", "debugger", "downloads", "scripting", "storage"].sort()),',
    )
    .replace(
      '"Standard manifest must remain debugger-free",',
      '"Standard manifest must remain debugger-free while allowing NODE-21 downloads",',
    )
    .replace(
      '"High Fidelity manifest must add debugger and nothing broader",',
      '"High Fidelity manifest may add debugger and NODE-21 downloads, with nothing broader",',
    ),
);

await patch("apps/browser-extension/scripts/validate-extension-package.mjs", (source) =>
  source
    .replace(
      '? ["activeTab", "debugger", "scripting", "storage"]',
      '? ["activeTab", "debugger", "downloads", "scripting", "storage"]',
    )
    .replace(
      ': ["activeTab", "scripting", "storage"];',
      ': ["activeTab", "downloads", "scripting", "storage"];',
    ),
);

await patch("scripts/validate-node-21.mjs", (source) =>
  source.replace('    "application/x-wtf",\n', '    "WTF_MIME_TYPE",\n'),
);

await patch("apps/browser-extension/scripts/validate-node-21-package.mjs", (source) => {
  let next = source.replace(
    '  "runtime/wtf-packager/zip.js",\n',
    '  "runtime/wtf-packager/zip.js",\n  "runtime/w2f-schema/index.js",\n',
  );
  next = next.replace(
    `for (const evidence of [\n  "packageWtf",\n  "manifest.json",\n  "checksums.json",\n  "canonicalStringify",\n  "SHA-256",\n  "encodeDeterministicZip",\n  "application/x-wtf",\n]) {`,
    `for (const evidence of [\n  "packageWtf",\n  "canonicalStringify",\n  "SHA-256",\n  "encodeDeterministicZip",\n  "WTF_MIME_TYPE",\n]) {`,
  );
  next = next.replace(
    `const builder = text("runtime/wtf-package-builder.js");\nfor (const evidence of [\n  "document.json",\n  "source-graph.json",\n  "render-tree.json",\n  "styles.json",\n  "assets.json",\n  "responsive.json",\n  "states.json",\n  "diagnostics.json",\n  "tokens.json",\n  "source/cascade.json",\n  "source/metadata.json",\n  "references/index.json",\n  "buildWtfPackage",\n]) {`,
    `const builder = text("runtime/wtf-package-builder.js");\nfor (const evidence of [\n  "WTF_DEFAULT_ENTRYPOINTS",\n  "references/index.json",\n  "source/relationships.json",\n  "revisions.json",\n  "buildWtfPackage",\n]) {`,
  );
  next = next.replace(
    `  assert(builder.includes(evidence), \`packaged WTF payload builder missing \${evidence}\`);\n}\n\nconst store = text("runtime/wtf-package-store.js");`,
    `  assert(builder.includes(evidence), \`packaged WTF payload builder missing \${evidence}\`);\n}\n\nconst schema = text("runtime/w2f-schema/index.js");\nfor (const evidence of [\n  "application/x-wtf",\n  "document.json",\n  "source-graph.json",\n  "render-tree.json",\n  "styles.json",\n  "assets.json",\n  "responsive.json",\n  "states.json",\n  "diagnostics.json",\n  "tokens.json",\n  "source/cascade.json",\n  "source/metadata.json",\n]) {\n  assert(schema.includes(evidence), \`packaged shared schema missing canonical WTF contract \${evidence}\`);\n}\n\nconst typeRuntime = text("runtime/wtf-packager/types.js");\nfor (const evidence of ["manifest.json", "checksums.json"]) {\n  assert(typeRuntime.includes(evidence), \`packaged WTF type runtime missing reserved path \${evidence}\`);\n}\n\nconst store = text("runtime/wtf-package-store.js");`,
  );
  return next;
});

console.log("NODE-21 guardrail normalization applied successfully.");
