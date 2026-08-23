import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/layout-analyzer/src/analyzer.ts";
let source = readFileSync(path, "utf8");
const before = '  if (/^[a-z-]+(?:\\([^)]*\\))?$/i.test(normalized)) {\n    return { semantic: { type: "keyword", value: normalized }, authoredValue: raw };\n  }';
const after = '  if (/^[a-z-]+$/i.test(normalized)) {\n    return { semantic: { type: "keyword", value: normalized }, authoredValue: raw };\n  }';
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("NODE-17 CSS function expression patch anchor missing");
  source = source.replace(before, after);
}
writeFileSync(path, source);
