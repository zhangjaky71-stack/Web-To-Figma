import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = `${appRoot}/dist-node31-measurement`;
const branchHead =
  process.env.W2F_NODE31_BRANCH_HEAD?.trim() ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: appRoot }).trim();

if (!/^[a-f0-9]{40}$/.test(branchHead)) {
  throw new Error(
    `NODE-31 measurement harness requires a 40-character branch head, got ${branchHead}`,
  );
}

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

await build({
  entryPoints: [`${appRoot}/src/node31-measurement-main.ts`],
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
  entryPoints: [`${appRoot}/src/node31-measurement-ui.ts`],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  write: false,
  define: {
    __W2F_NODE31_BRANCH_HEAD__: JSON.stringify(branchHead),
  },
});

const uiScript = uiBuild.outputFiles[0]?.text;
if (!uiScript) throw new Error("NODE-31 measurement UI bundle was not generated");
const template = await readFile(`${appRoot}/static/node31-measurement-ui.html`, "utf8");
const marker = "<!-- W2F_NODE31_UI_SCRIPT -->";
if (!template.includes(marker)) {
  throw new Error("NODE-31 measurement UI template is missing the script marker");
}
const safeScript = uiScript.replaceAll("</script>", "<\\/script>");
await writeFile(
  `${distRoot}/ui.html`,
  template.replace(marker, `<script>${safeScript}</script>`),
  "utf8",
);
await writeFile(`${distRoot}/branch-head.txt`, `${branchHead}\n`, "utf8");

console.log(`W2F NODE-31 Desktop measurement harness built for ${branchHead}.`);
