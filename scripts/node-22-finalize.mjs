import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`NODE-22 finalizer made no change: ${path}`);
  await writeFile(path, after, "utf8");
}

await patch("scripts/validate-foundation.mjs", (source) => {
  let next = source.replace(
    'import "./validate-node-21.mjs";',
    'import "./validate-node-21.mjs";\nimport "./validate-node-22.mjs";',
  );
  next = next.replace(
    `    if (directory === "apps/browser-extension") {\n      assert(\n        buildCommand.includes("tsc -p tsconfig.build.json"),\n        "browser extension build must compile with tsconfig.build.json",\n      );\n      assert(\n        buildCommand.includes("package-extension.mjs") &&\n          buildCommand.includes("validate-extension-package.mjs"),\n        "browser extension build must package and validate the loadable MV3 output",\n      );\n    } else {\n      assert(\n        buildCommand === "tsc -p tsconfig.build.json",\n        \`\${directory} build must use tsconfig.build.json\`,\n      );\n    }`,
    `    if (directory === "apps/browser-extension") {\n      assert(\n        buildCommand.includes("tsc -p tsconfig.build.json"),\n        "browser extension build must compile with tsconfig.build.json",\n      );\n      assert(\n        buildCommand.includes("package-extension.mjs") &&\n          buildCommand.includes("validate-extension-package.mjs"),\n        "browser extension build must package and validate the loadable MV3 output",\n      );\n    } else if (directory === "apps/figma-plugin") {\n      assert(\n        buildCommand === "node scripts/build-plugin.mjs && node scripts/validate-plugin-package.mjs",\n        "Figma plugin build must bundle and validate the loadable main/UI package",\n      );\n    } else {\n      assert(\n        buildCommand === "tsc -p tsconfig.build.json",\n        \`\${directory} build must use tsconfig.build.json\`,\n      );\n    }`,
  );
  return next;
});

await patch("apps/figma-plugin/README.md", () => `# @w2f/figma-plugin\n\nNODE-22 loadable W2F for Figma shell.\n\nDevelopment package:\n\n\`\`\`text\nmanifest.json\n  -> dist/code.js\n  -> dist/ui.html\n\`\`\`\n\nThe shell accepts local \`.wtf\` bytes through Choose File, UI Drop, or active-plugin Canvas Drop and stops at the NODE-23 secure-parser boundary. It performs no network access and does not render archive contents in NODE-22.\n`);

console.log("NODE-22 integration finalizer applied successfully.");
