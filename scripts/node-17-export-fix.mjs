import { writeFileSync } from "node:fs";

writeFileSync(
  "packages/layout-analyzer/src/index.ts",
  `export * from "./types.js";
export {
  analyzeBaseLayout,
  isBaseLayoutAnalysis,
  parseLayoutCssLength,
  summarizeBaseLayoutAnalysis,
} from "./analyzer.js";
export * from "./geometry.js";
`,
);
