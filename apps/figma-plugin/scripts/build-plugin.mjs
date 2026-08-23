import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = `${appRoot}/dist`;

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

await build({
  entryPoints: [`${appRoot}/src/main.ts`],
  outfile: `${distRoot}/code.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

const uiBuild = await build({
  entryPoints: [`${appRoot}/src/ui.ts`],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  write: false,
});

const uiScript = uiBuild.outputFiles[0]?.text;
if (!uiScript) throw new Error("Figma UI bundle was not generated");
const template = await readFile(`${appRoot}/static/ui.html`, "utf8");
const marker = "<!-- W2F_UI_SCRIPT -->";
if (!template.includes(marker)) throw new Error("Figma UI template is missing the script marker");
const safeScript = uiScript.replaceAll("</script>", "<\\/script>");
await writeFile(
  `${distRoot}/ui.html`,
  template.replace(marker, `<script>${safeScript}</script>`),
  "utf8",
);

console.log("W2F Figma plugin package built.");
