import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`NODE-17 patch anchor missing: ${label}`);
  return source.replace(before, after);
}

writeFileSync(
  "packages/layout-analyzer/src/geometry.ts",
  `import type { WtfBoxEdges, WtfBoxModel, WtfLayoutMode } from "@w2f/w2f-ir";
import type {
  LayoutNodeObservation,
  LayoutPropertyEvidence,
  LayoutStyleEvidence,
} from "./types.js";

function effectiveValue(evidence: LayoutPropertyEvidence | undefined): string | undefined {
  return evidence?.computed?.trim() || evidence?.authored?.trim() || undefined;
}

function numericPx(evidence: LayoutPropertyEvidence | undefined): number | undefined {
  const raw = effectiveValue(evidence);
  if (!raw) return undefined;
  if (/^[+-]?0(?:\\.0+)?$/.test(raw)) return 0;
  const match = /^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))px$/i.exec(raw);
  if (!match) return undefined;
  const parsed = Number(match[1] ?? "NaN");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function edge(style: LayoutStyleEvidence, field: keyof LayoutStyleEvidence): number {
  return numericPx(style[field]) ?? 0;
}

function boxEdges(
  style: LayoutStyleEvidence,
  fields: readonly [keyof LayoutStyleEvidence, keyof LayoutStyleEvidence, keyof LayoutStyleEvidence, keyof LayoutStyleEvidence],
): WtfBoxEdges {
  return {
    top: edge(style, fields[0]),
    right: edge(style, fields[1]),
    bottom: edge(style, fields[2]),
    left: edge(style, fields[3]),
  };
}

function addEdges(left: WtfBoxEdges, right: WtfBoxEdges): WtfBoxEdges {
  return {
    top: left.top + right.top,
    right: left.right + right.right,
    bottom: left.bottom + right.bottom,
    left: left.left + right.left,
  };
}

function inset(
  rect: { x: number; y: number; width: number; height: number },
  edges: WtfBoxEdges,
) {
  return {
    x: rect.x + edges.left,
    y: rect.y + edges.top,
    width: Math.max(0, rect.width - edges.left - edges.right),
    height: Math.max(0, rect.height - edges.top - edges.bottom),
  };
}

export function deriveBoxModel(observation: LayoutNodeObservation): WtfBoxModel | undefined {
  if (!observation.bounds) return undefined;
  const border = boxEdges(observation.style, [
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ]);
  const padding = boxEdges(observation.style, [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ]);
  const margin = boxEdges(observation.style, [
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ]);
  return {
    borderBox: observation.bounds,
    paddingBox: inset(observation.bounds, border),
    contentBox: inset(observation.bounds, addEdges(border, padding)),
    margin,
  };
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) return undefined;
  if (sorted.length % 2 === 1) return current;
  const previous = sorted[middle - 1];
  return previous === undefined ? current : (previous + current) / 2;
}

function axisGap(
  children: readonly LayoutNodeObservation[],
  axis: "row" | "column",
): number | undefined {
  const bounds = children.flatMap((child) => (child.bounds ? [child.bounds] : []));
  if (bounds.length < 2) return undefined;
  const sorted = [...bounds].sort((left, right) =>
    axis === "row"
      ? left.y - right.y || left.x - right.x
      : left.x - right.x || left.y - right.y,
  );
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const gap =
      axis === "row"
        ? current.y - (previous.y + previous.height)
        : current.x - (previous.x + previous.width);
    if (Number.isFinite(gap)) gaps.push(gap);
  }
  return median(gaps);
}

function positionOf(observation: LayoutNodeObservation): string {
  return (effectiveValue(observation.style.position) ?? "static").toLowerCase();
}

export function deriveEffectiveGap(
  observation: LayoutNodeObservation,
  observationsById: ReadonlyMap<string, LayoutNodeObservation>,
  mode: WtfLayoutMode,
): { row: number; column: number } {
  const cssRow = numericPx(observation.style.rowGap) ?? 0;
  const cssColumn = numericPx(observation.style.columnGap) ?? 0;
  const children = observation.childSourceNodeIds.flatMap((sourceNodeId) => {
    const child = observationsById.get(sourceNodeId);
    return child ? [child] : [];
  });

  if (mode === "flow") {
    const inFlow = children.filter((child) => !["absolute", "fixed"].includes(positionOf(child)));
    return { row: axisGap(inFlow, "row") ?? cssRow, column: cssColumn };
  }

  if (mode === "flex") {
    const wrap = (effectiveValue(observation.style.flexWrap) ?? "nowrap").toLowerCase();
    if (wrap !== "nowrap") return { row: cssRow, column: cssColumn };
    const direction = (effectiveValue(observation.style.flexDirection) ?? "row").toLowerCase();
    if (direction.startsWith("column")) {
      return { row: axisGap(children, "row") ?? cssRow, column: cssColumn };
    }
    return { row: cssRow, column: axisGap(children, "column") ?? cssColumn };
  }

  return { row: cssRow, column: cssColumn };
}
`,
);

writeFileSync(
  "packages/layout-analyzer/test/geometry.test.ts",
  `import { describe, expect, it } from "vitest";
import { analyzeBaseLayout, type LayoutNodeObservation } from "../src/index.js";

function node(
  sourceNodeId: string,
  bounds: { x: number; y: number; width: number; height: number },
  childSourceNodeIds: string[] = [],
  style: LayoutNodeObservation["style"] = {},
): LayoutNodeObservation {
  return { sourceNodeId, childSourceNodeIds, kind: "element", bounds, style };
}

describe("NODE-17 resolved geometry", () => {
  it("normalizes Browser border-box geometry into padding/content boxes and margin extents", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 200, height: 100 }, [], {
          display: { computed: "block" },
          position: { computed: "static" },
          borderTopWidth: { computed: "2px" },
          borderRightWidth: { computed: "2px" },
          borderBottomWidth: { computed: "2px" },
          borderLeftWidth: { computed: "2px" },
          paddingTop: { computed: "10px" },
          paddingRight: { computed: "10px" },
          paddingBottom: { computed: "10px" },
          paddingLeft: { computed: "10px" },
          marginTop: { computed: "-5px" },
          marginRight: { computed: "4px" },
          marginBottom: { computed: "8px" },
          marginLeft: { computed: "4px" },
        }),
      ],
    });
    expect(analysis.nodes[0]?.boxModel).toEqual({
      borderBox: { x: 0, y: 0, width: 200, height: 100 },
      paddingBox: { x: 2, y: 2, width: 196, height: 96 },
      contentBox: { x: 12, y: 12, width: 176, height: 76 },
      margin: { top: -5, right: 4, bottom: 8, left: 4 },
    });
  });

  it("uses resolved child geometry for normal-flow spacing, including negative overlap", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 300, height: 200 }, ["a", "b"], {
          display: { computed: "block" }, position: { computed: "static" }, rowGap: { computed: "0px" },
        }),
        node("a", { x: 0, y: 20, width: 100, height: 50 }, [], {
          display: { computed: "block" }, position: { computed: "static" },
        }),
        node("b", { x: 0, y: 60, width: 100, height: 40 }, [], {
          display: { computed: "block" }, position: { computed: "static" },
        }),
      ],
    });
    expect(analysis.nodes.find((item) => item.sourceNodeId === "root")?.layout.effectiveGap)
      .toEqual({ row: -10, column: 0 });
  });

  it("captures distributed flex spacing from resolved geometry", () => {
    const analysis = analyzeBaseLayout({
      nodes: [
        node("root", { x: 0, y: 0, width: 300, height: 100 }, ["a", "b"], {
          display: { computed: "flex", authored: "flex" },
          position: { computed: "static" },
          flexDirection: { computed: "row" },
          flexWrap: { computed: "nowrap" },
          justifyContent: { computed: "space-between" },
          columnGap: { computed: "0px" },
        }),
        node("a", { x: 0, y: 0, width: 50, height: 40 }, [], {
          display: { computed: "block" }, position: { computed: "static" },
        }),
        node("b", { x: 250, y: 0, width: 50, height: 40 }, [], {
          display: { computed: "block" }, position: { computed: "static" },
        }),
      ],
    });
    expect(analysis.nodes.find((item) => item.sourceNodeId === "root")?.layout.effectiveGap)
      .toEqual({ row: 0, column: 200 });
  });
});
`,
);

const typesPath = "packages/layout-analyzer/src/types.ts";
let types = readFileSync(typesPath, "utf8");
types = replaceOnce(
  types,
  'import type {\n  WtfLayoutModel,\n  WtfSizingMode,\n} from "@w2f/w2f-ir";',
  'import type { WtfBoxModel, WtfLayoutModel, WtfSizingMode } from "@w2f/w2f-ir";',
  "box model type import",
);
types = replaceOnce(
  types,
  '  paddingLeft?: LayoutPropertyEvidence;\n  rowGap?: LayoutPropertyEvidence;',
  '  paddingLeft?: LayoutPropertyEvidence;\n  marginTop?: LayoutPropertyEvidence;\n  marginRight?: LayoutPropertyEvidence;\n  marginBottom?: LayoutPropertyEvidence;\n  marginLeft?: LayoutPropertyEvidence;\n  borderTopWidth?: LayoutPropertyEvidence;\n  borderRightWidth?: LayoutPropertyEvidence;\n  borderBottomWidth?: LayoutPropertyEvidence;\n  borderLeftWidth?: LayoutPropertyEvidence;\n  rowGap?: LayoutPropertyEvidence;',
  "box edge style evidence",
);
types = replaceOnce(
  types,
  '  layout: WtfLayoutModel;\n  diagnostics: BaseLayoutDiagnostic[];',
  '  layout: WtfLayoutModel;\n  boxModel?: WtfBoxModel;\n  diagnostics: BaseLayoutDiagnostic[];',
  "box model analysis output",
);
writeFileSync(typesPath, types);

writeFileSync(
  "packages/layout-analyzer/src/index.ts",
  `export * from "./types.js";
export {
  analyzeBaseLayout,
  parseLayoutCssLength,
  summarizeBaseLayoutAnalysis,
} from "./analyzer.js";
export { isBaseLayoutAnalysis } from "./validation.js";
export * from "./geometry.js";
`,
);

const analyzerPath = "packages/layout-analyzer/src/analyzer.ts";
let analyzer = readFileSync(analyzerPath, "utf8");
analyzer = replaceOnce(
  analyzer,
  '} from "@w2f/w2f-ir";\nimport {\n  BASE_LAYOUT_ANALYSIS_VERSION,',
  '} from "@w2f/w2f-ir";\nimport { deriveBoxModel, deriveEffectiveGap } from "./geometry.js";\nimport {\n  BASE_LAYOUT_ANALYSIS_VERSION,',
  "geometry helper import",
);
analyzer = replaceOnce(
  analyzer,
  'function analyzeNode(observation: LayoutNodeObservation): BaseLayoutNodeAnalysis {',
  'function analyzeNode(\n  observation: LayoutNodeObservation,\n  observationsById: ReadonlyMap<string, LayoutNodeObservation>,\n): BaseLayoutNodeAnalysis {',
  "analyze node context",
);
analyzer = replaceOnce(
  analyzer,
  '  const rowGap = pxOrZero(observation.style.rowGap);\n  const columnGap = pxOrZero(observation.style.columnGap);',
  '  const effectiveGap = deriveEffectiveGap(observation, observationsById, mode);',
  "resolved effective gap",
);
analyzer = replaceOnce(
  analyzer,
  '    effectiveGap: { row: rowGap, column: columnGap },',
  '    effectiveGap,',
  "layout effective gap",
);
analyzer = replaceOnce(
  analyzer,
  '  return {\n    sourceNodeId: observation.sourceNodeId,\n    ...(observation.stableNodeId ? { stableNodeId: observation.stableNodeId } : {}),\n    layout,\n    diagnostics,\n  };',
  '  const boxModel = deriveBoxModel(observation);\n  return {\n    sourceNodeId: observation.sourceNodeId,\n    ...(observation.stableNodeId ? { stableNodeId: observation.stableNodeId } : {}),\n    layout,\n    ...(boxModel ? { boxModel } : {}),\n    diagnostics,\n  };',
  "analysis box model",
);
analyzer = replaceOnce(
  analyzer,
  'export function analyzeBaseLayout(input: BaseLayoutAnalysisInput): BaseLayoutAnalysis {\n  const seen = new Set<string>();',
  'export function analyzeBaseLayout(input: BaseLayoutAnalysisInput): BaseLayoutAnalysis {\n  const seen = new Set<string>();\n  const observationsById = new Map(\n    input.nodes.map((observation) => [observation.sourceNodeId, observation]),\n  );',
  "observation lookup",
);
analyzer = replaceOnce(
  analyzer,
  '    nodes.push(analyzeNode(observation));',
  '    nodes.push(analyzeNode(observation, observationsById));',
  "analyze node lookup call",
);
writeFileSync(analyzerPath, analyzer);

const runtimePath = "apps/browser-extension/src/runtime/layout-analysis-runtime.ts";
let runtime = readFileSync(runtimePath, "utf8");
runtime = replaceOnce(
  runtime,
  '  paddingLeft: "padding-left",\n  rowGap: "row-gap",',
  '  paddingLeft: "padding-left",\n  marginTop: "margin-top",\n  marginRight: "margin-right",\n  marginBottom: "margin-bottom",\n  marginLeft: "margin-left",\n  borderTopWidth: "border-top-width",\n  borderRightWidth: "border-right-width",\n  borderBottomWidth: "border-bottom-width",\n  borderLeftWidth: "border-left-width",\n  rowGap: "row-gap",',
  "browser box edge evidence",
);
writeFileSync(runtimePath, runtime);

const jobPath = "apps/browser-extension/src/runtime/job-state.ts";
let job = readFileSync(jobPath, "utf8");
job = replaceOnce(
  job,
  '  rasterDiagnosticCount?: number;\n}',
  '  rasterDiagnosticCount?: number;\n  layoutAnalysisStorageKey?: string;\n  layoutNodeCount?: number;\n  layoutDiagnosticCount?: number;\n  layoutFlexNodeCount?: number;\n  layoutGridNodeCount?: number;\n  layoutAbsoluteNodeCount?: number;\n}',
  "capture receipt layout fields",
);
job = replaceOnce(
  job,
  '    isOptionalNonNegativeInteger(record.rasterUniqueByteCount) &&\n    isOptionalNonNegativeInteger(record.rasterDiagnosticCount)\n  );',
  '    isOptionalNonNegativeInteger(record.rasterUniqueByteCount) &&\n    isOptionalNonNegativeInteger(record.rasterDiagnosticCount) &&\n    (record.layoutAnalysisStorageKey === undefined ||\n      (typeof record.layoutAnalysisStorageKey === "string" && record.layoutAnalysisStorageKey.length > 0)) &&\n    isOptionalNonNegativeInteger(record.layoutNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutDiagnosticCount) &&\n    isOptionalNonNegativeInteger(record.layoutFlexNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutGridNodeCount) &&\n    isOptionalNonNegativeInteger(record.layoutAbsoluteNodeCount)\n  );',
  "capture receipt layout validation",
);
writeFileSync(jobPath, job);

const workerPath = "apps/browser-extension/src/runtime/service-worker.ts";
let worker = readFileSync(workerPath, "utf8");
worker = replaceOnce(
  worker,
  'import { summarizeEnvironmentCapture } from "@w2f/environment-capture";',
  'import { summarizeEnvironmentCapture } from "@w2f/environment-capture";\nimport { summarizeBaseLayoutAnalysis } from "@w2f/layout-analyzer";',
  "layout analyzer summary import",
);
worker = replaceOnce(
  worker,
  'import { capturePixelGroundTruthForSnapshot } from "./pixel-ground-truth-runtime.js";',
  'import { analyzePersistedBaseLayout } from "./layout-analysis-runtime.js";\nimport { deleteBaseLayoutAnalysis, writeBaseLayoutAnalysis } from "./layout-analysis-store.js";\nimport { capturePixelGroundTruthForSnapshot } from "./pixel-ground-truth-runtime.js";',
  "layout browser imports",
);
worker = replaceOnce(
  worker,
  '    deleteAssetCapture(jobId),\n    deletePixelGroundTruth(jobId),',
  '    deleteAssetCapture(jobId),\n    deletePixelGroundTruth(jobId),\n    deleteBaseLayoutAnalysis(jobId),',
  "layout cleanup",
);
const persistAnchor = 'async function persistEnvironment(\n';
if (!worker.includes("async function persistBaseLayoutAnalysis(")) {
  if (!worker.includes(persistAnchor)) throw new Error("NODE-17 persist layout anchor missing");
  const persistLayout = `async function persistBaseLayoutAnalysis(\n  jobId: string,\n): Promise<\n  Pick<\n    CaptureSnapshotReceipt,\n    | "layoutAnalysisStorageKey"\n    | "layoutNodeCount"\n    | "layoutDiagnosticCount"\n    | "layoutFlexNodeCount"\n    | "layoutGridNodeCount"\n    | "layoutAbsoluteNodeCount"\n  >\n> {\n  const analysis = await analyzePersistedBaseLayout(jobId);\n  const layoutAnalysisStorageKey = await writeBaseLayoutAnalysis(jobId, analysis);\n  const summary = summarizeBaseLayoutAnalysis(analysis);\n  return {\n    layoutAnalysisStorageKey,\n    layoutNodeCount: summary.nodeCount,\n    layoutDiagnosticCount: summary.diagnosticCount,\n    layoutFlexNodeCount: summary.flexNodeCount,\n    layoutGridNodeCount: summary.gridNodeCount,\n    layoutAbsoluteNodeCount: summary.absoluteNodeCount,\n  };\n}\n\n`;
  worker = worker.replace(persistAnchor, `${persistLayout}${persistAnchor}`);
}
const standardCascade = '    const cascadeReceipt = await persistCssCascade(tabId, jobId, snapshot);\n';
worker = replaceOnce(
  worker,
  standardCascade,
  `${standardCascade}    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n`,
  "standard layout persistence",
);
const cdpCascade = '    const cascadeReceipt = await persistCssCascade(tabId, jobId, result.snapshot);\n';
worker = replaceOnce(
  worker,
  cdpCascade,
  `${cdpCascade}    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);\n`,
  "cdp layout persistence",
);
worker = worker.replaceAll(
  '        ...cascadeReceipt,\n        ...environmentReceipt,',
  '        ...cascadeReceipt,\n        ...layoutReceipt,\n        ...environmentReceipt,',
);
writeFileSync(workerPath, worker);

const foundationPath = "scripts/validate-foundation.mjs";
let foundation = readFileSync(foundationPath, "utf8");
const foundationAnchor = 'import "./validate-node-16.mjs";';
const foundationAddition = 'import "./validate-node-17.mjs";';
if (!foundation.includes(foundationAddition)) {
  if (!foundation.includes(foundationAnchor)) throw new Error("NODE-17 foundation guardrail anchor missing");
  foundation = foundation.replace(foundationAnchor, `${foundationAnchor}\n${foundationAddition}`);
}
writeFileSync(foundationPath, foundation);

const validatorPath = "scripts/validate-node-17.mjs";
let validator = readFileSync(validatorPath, "utf8");
validator = replaceOnce(
  validator,
  '  "packages/layout-analyzer/src/analyzer.ts",\n  "packages/layout-analyzer/test/layout-analyzer.test.ts",',
  '  "packages/layout-analyzer/src/analyzer.ts",\n  "packages/layout-analyzer/src/geometry.ts",\n  "packages/layout-analyzer/test/layout-analyzer.test.ts",\n  "packages/layout-analyzer/test/geometry.test.ts",',
  "geometry validator files",
);
validator = replaceOnce(
  validator,
  '    "absoluteConstraints",\n    "LAYOUT_TABLE_DEFERRED",',
  '    "absoluteConstraints",\n    "deriveBoxModel",\n    "deriveEffectiveGap",\n    "LAYOUT_TABLE_DEFERRED",',
  "geometry validator evidence",
);
writeFileSync(validatorPath, validator);

const normativePath = "docs/BASE_LAYOUT_ANALYZER_V2.md";
let normative = readFileSync(normativePath, "utf8");
if (!normative.includes("## Border-box normalization and effective spacing")) {
  normative += `\n\n## Border-box normalization and effective spacing\n\nNODE-17 treats captured Browser geometry as the authoritative border box. It derives paddingBox and contentBox from computed border widths and padding while preserving computed margin extents, including negative margins.\n\nFor normal flow and single-line flex containers, effectiveGap is derived from resolved child geometry rather than by adding adjacent margins. This preserves margin collapse, negative overlap and distributed spacing such as justify-content: space-between. CSS row-gap/column-gap remain the deterministic fallback when resolved child geometry is insufficient or the layout is multi-line/grid.\n`;
}
writeFileSync(normativePath, normative);
