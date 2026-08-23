import type { RawNode } from "@w2f/capture-core";
import { parseCssLength, type CssCascadePropertyTrace, type CssNodeCascadeEvidence } from "@w2f/css-cascade";
import type {
  WtfAbsoluteConstraints,
  WtfAxisSizing,
  WtfBoxEdges,
  WtfBoxModel,
  WtfCssLength,
  WtfDecisionEvidence,
  WtfFlexContainerModel,
  WtfFlexItemModel,
  WtfGridContainerModel,
  WtfGridItemModel,
  WtfGridTrack,
  WtfLayoutMode,
  WtfLayoutModel,
  WtfSizingDecision,
  WtfSizingMode,
} from "@w2f/w2f-ir";
import {
  BASE_LAYOUT_ANALYZER_VERSION,
  type BaseLayoutAnalysisResult,
  type BaseLayoutAnalysisSummary,
  type BaseLayoutAnalyzerInput,
  type BaseLayoutDiagnostic,
  type BaseLayoutNodeAnalysis,
} from "./types.js";

interface StyleValue {
  computed: string;
  authored?: string;
}

type StyleMap = Map<string, StyleValue>;

const REPLACED_TAGS = new Set(["img", "svg", "video", "canvas", "iframe", "embed", "object"]);

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function winner(trace: CssCascadePropertyTrace): string | undefined {
  return trace.candidates.find((candidate) => candidate.status === "winner")?.authoredValue;
}

function styleMap(node: CssNodeCascadeEvidence | undefined): StyleMap {
  const result: StyleMap = new Map();
  for (const trace of node?.traces ?? []) {
    const authored = winner(trace);
    result.set(trace.property.toLowerCase(), {
      computed: trace.computedValue,
      ...(authored === undefined ? {} : { authored }),
    });
  }
  return result;
}

function rawStyle(styles: StyleMap, property: string): StyleValue | undefined {
  return styles.get(property.toLowerCase());
}

function computed(styles: StyleMap, property: string, fallback = ""): string {
  return rawStyle(styles, property)?.computed.trim() || fallback;
}

function authoredOrComputed(styles: StyleMap, property: string): string | undefined {
  const value = rawStyle(styles, property);
  const raw = value?.authored?.trim() || value?.computed.trim();
  return raw || undefined;
}

function px(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "0") return 0;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function edges(styles: StyleMap, prefix: "padding" | "margin" | "border"): WtfBoxEdges {
  const suffix = prefix === "border" ? "-width" : "";
  return {
    top: finite(px(computed(styles, `${prefix}-top${suffix}`))),
    right: finite(px(computed(styles, `${prefix}-right${suffix}`))),
    bottom: finite(px(computed(styles, `${prefix}-bottom${suffix}`))),
    left: finite(px(computed(styles, `${prefix}-left${suffix}`))),
  };
}

function insetRect(
  rect: { x: number; y: number; width: number; height: number },
  inset: WtfBoxEdges,
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x + inset.left,
    y: rect.y + inset.top,
    width: Math.max(0, rect.width - inset.left - inset.right),
    height: Math.max(0, rect.height - inset.top - inset.bottom),
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

function boxModel(node: RawNode, styles: StyleMap): WtfBoxModel | undefined {
  const bounds = node.geometry?.bounds;
  if (!bounds) return undefined;
  const border = edges(styles, "border");
  const padding = edges(styles, "padding");
  return {
    borderBox: bounds,
    paddingBox: insetRect(bounds, border),
    contentBox: insetRect(bounds, addEdges(border, padding)),
    margin: edges(styles, "margin"),
  };
}

function layoutMode(displayRaw: string, positionRaw: string): WtfLayoutMode {
  const display = displayRaw.trim().toLowerCase();
  const position = positionRaw.trim().toLowerCase();
  if (display === "none") return "none";
  if (position === "absolute" || position === "fixed") return "absolute";
  if (display === "contents") return "contents";
  if (display === "flex" || display === "inline-flex") return "flex";
  if (display === "grid" || display === "inline-grid") return "grid";
  if (display === "table" || display.startsWith("table-")) return "unknown";
  if (display.startsWith("inline")) return "inline";
  if (display) return "flow";
  return "unknown";
}

function lengthFromStyle(styles: StyleMap, property: string): WtfCssLength | undefined {
  const value = rawStyle(styles, property);
  if (!value) return undefined;
  const semanticValue = value.authored?.trim() || value.computed.trim();
  if (!semanticValue || semanticValue.toLowerCase() === "none") return undefined;
  return parseCssLength(semanticValue, px(value.computed));
}

function sizingMode(
  node: RawNode,
  styles: StyleMap,
  axis: "width" | "height",
  parentMode: WtfLayoutMode | undefined,
): { mode: WtfSizingMode; confidence: number; reason: string } {
  const property = axis;
  const value = rawStyle(styles, property);
  const authored = value?.authored?.trim().toLowerCase();
  const tagName = node.source.tagName?.toLowerCase();

  if (authored) {
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)px$/.test(authored)) {
      return { mode: "fixed", confidence: 0.99, reason: `authored ${axis} is an absolute px length` };
    }
    if (/^(?:fit-content|max-content|min-content)(?:\(.*\))?$/.test(authored)) {
      return { mode: "hug", confidence: 0.98, reason: `authored ${axis} uses intrinsic-content sizing` };
    }
    const percent = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(authored);
    if (percent && Number(percent[1] ?? "NaN") >= 95) {
      return { mode: "fill", confidence: 0.95, reason: `authored ${axis} uses a near-full percentage` };
    }
    if (authored === "auto") {
      if (tagName && REPLACED_TAGS.has(tagName)) {
        return { mode: "intrinsic", confidence: 0.9, reason: `replaced element uses authored ${axis}: auto` };
      }
      return { mode: "content", confidence: 0.87, reason: `authored ${axis}: auto preserves content sizing` };
    }
  }

  if (axis === "width" && parentMode === "flex") {
    const grow = Number(computed(styles, "flex-grow", "0"));
    if (Number.isFinite(grow) && grow > 0) {
      return { mode: "fill", confidence: 0.9, reason: "positive computed flex-grow supplies fill evidence" };
    }
  }

  if (value?.computed && px(value.computed) !== undefined) {
    return {
      mode: "unknown",
      confidence: 0.45,
      reason: `computed ${axis} is resolved but authored sizing semantics are unavailable`,
    };
  }

  return { mode: "unknown", confidence: 0.2, reason: `insufficient ${axis} sizing evidence` };
}

function sizingDecision(
  node: RawNode,
  styles: StyleMap,
  axis: "width" | "height",
  parentMode: WtfLayoutMode | undefined,
): WtfSizingDecision {
  const classified = sizingMode(node, styles, axis, parentMode);
  const value = lengthFromStyle(styles, axis);
  const min = lengthFromStyle(styles, axis === "width" ? "min-width" : "min-height");
  const max = lengthFromStyle(styles, axis === "width" ? "max-width" : "max-height");
  return {
    mode: classified.mode,
    confidence: clampConfidence(classified.confidence),
    reasons: [classified.reason],
    sourceRefs: [node.captureNodeId],
    ...(value === undefined ? {} : { value }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
}

function axisSizing(
  node: RawNode,
  styles: StyleMap,
  parentMode: WtfLayoutMode | undefined,
): WtfAxisSizing {
  return {
    width: sizingDecision(node, styles, "width", parentMode),
    height: sizingDecision(node, styles, "height", parentMode),
  };
}

function numericOrString(raw: string | undefined): number | string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "auto") return undefined;
  if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function flexContainer(styles: StyleMap): WtfFlexContainerModel {
  const direction = computed(styles, "flex-direction", "row") as WtfFlexContainerModel["direction"];
  const wrap = computed(styles, "flex-wrap", "nowrap") as WtfFlexContainerModel["wrap"];
  return {
    direction,
    wrap,
    justifyContent: computed(styles, "justify-content", "normal"),
    alignItems: computed(styles, "align-items", "normal"),
    alignContent: computed(styles, "align-content", "normal"),
    rowGap: finite(px(computed(styles, "row-gap"))),
    columnGap: finite(px(computed(styles, "column-gap"))),
  };
}

function flexItem(styles: StyleMap): WtfFlexItemModel {
  const grow = Number(computed(styles, "flex-grow"));
  const shrink = Number(computed(styles, "flex-shrink"));
  const order = Number(computed(styles, "order"));
  const basis = lengthFromStyle(styles, "flex-basis");
  return {
    ...(Number.isFinite(grow) ? { grow } : {}),
    ...(Number.isFinite(shrink) ? { shrink } : {}),
    ...(basis === undefined ? {} : { basis }),
    ...(computed(styles, "align-self") ? { alignSelf: computed(styles, "align-self") } : {}),
    ...(Number.isFinite(order) ? { order } : {}),
  };
}

function splitTracks(raw: string): string[] {
  const tracks: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of raw.trim()) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (/\s/.test(character) && depth === 0) {
      if (current) tracks.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) tracks.push(current);
  return tracks;
}

function gridTracks(styles: StyleMap, property: string): WtfGridTrack[] {
  const value = rawStyle(styles, property);
  if (!value) return [];
  const authored = value.authored?.trim();
  const computedTracks = splitTracks(value.computed);
  const authoredTracks = authored && authored !== "none" ? splitTracks(authored) : [];
  const source = authoredTracks.length > 0 ? authoredTracks : computedTracks;
  return source
    .filter((track) => track && track !== "none")
    .map((track, index) => ({
      authored: track,
      ...(px(computedTracks[index]) === undefined ? {} : { resolvedPx: px(computedTracks[index]) }),
    }));
}

function gridContainer(styles: StyleMap): WtfGridContainerModel {
  return {
    columns: gridTracks(styles, "grid-template-columns"),
    rows: gridTracks(styles, "grid-template-rows"),
    autoFlow: computed(styles, "grid-auto-flow", "row"),
    rowGap: finite(px(computed(styles, "row-gap"))),
    columnGap: finite(px(computed(styles, "column-gap"))),
  };
}

function gridItem(styles: StyleMap): WtfGridItemModel {
  const columnStart = numericOrString(authoredOrComputed(styles, "grid-column-start"));
  const columnEnd = numericOrString(authoredOrComputed(styles, "grid-column-end"));
  const rowStart = numericOrString(authoredOrComputed(styles, "grid-row-start"));
  const rowEnd = numericOrString(authoredOrComputed(styles, "grid-row-end"));
  return {
    ...(columnStart === undefined ? {} : { columnStart }),
    ...(columnEnd === undefined ? {} : { columnEnd }),
    ...(rowStart === undefined ? {} : { rowStart }),
    ...(rowEnd === undefined ? {} : { rowEnd }),
  };
}

function absoluteConstraints(styles: StyleMap): WtfAbsoluteConstraints {
  const left = lengthFromStyle(styles, "left");
  const right = lengthFromStyle(styles, "right");
  const top = lengthFromStyle(styles, "top");
  const bottom = lengthFromStyle(styles, "bottom");
  return {
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
    ...(top === undefined ? {} : { top }),
    ...(bottom === undefined ? {} : { bottom }),
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) return undefined;
  if (sorted.length % 2 === 1) return current;
  const previous = sorted[middle - 1];
  return previous === undefined ? current : (previous + current) / 2;
}

function observedGap(children: RawNode[], axis: "row" | "column"): number | undefined {
  const bounds = children.flatMap((child) => (child.geometry?.bounds ? [child.geometry.bounds] : []));
  if (bounds.length < 2) return undefined;
  const sorted = [...bounds].sort((left, right) =>
    axis === "row" ? left.y - right.y || left.x - right.x : left.x - right.x || left.y - right.y,
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
    if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
  }
  return median(gaps);
}

function effectiveGap(
  mode: WtfLayoutMode,
  styles: StyleMap,
  children: RawNode[],
): { row: number; column: number } | undefined {
  const rowAuthored = px(computed(styles, "row-gap"));
  const columnAuthored = px(computed(styles, "column-gap"));
  if (rowAuthored !== undefined || columnAuthored !== undefined) {
    return { row: finite(rowAuthored), column: finite(columnAuthored) };
  }
  if (mode === "flex") {
    const direction = computed(styles, "flex-direction", "row");
    if (direction.startsWith("row")) {
      const column = observedGap(children, "column");
      return column === undefined ? undefined : { row: 0, column };
    }
    const row = observedGap(children, "row");
    return row === undefined ? undefined : { row, column: 0 };
  }
  if (mode === "flow") {
    const row = observedGap(children, "row");
    return row === undefined ? undefined : { row, column: 0 };
  }
  return undefined;
}

function decision(
  node: RawNode,
  stylesAvailable: boolean,
  mode: WtfLayoutMode,
  diagnostics: BaseLayoutDiagnostic[],
): WtfDecisionEvidence {
  const reasons = [
    stylesAvailable
      ? "computed CSS establishes the active base layout mode"
      : "raw capture visibility/display evidence is used because CSS cascade evidence is unavailable",
  ];
  let confidence = stylesAvailable ? 0.96 : 0.58;
  if (mode === "unknown") confidence = Math.min(confidence, 0.45);
  if (!node.geometry && mode !== "none" && mode !== "contents") {
    confidence *= 0.82;
    reasons.push("geometry is unavailable, lowering layout confidence");
    diagnostics.push({
      code: "BASE_LAYOUT_GEOMETRY_MISSING",
      message: "Layout mode can be retained, but box model and geometry-backed spacing cannot be derived.",
      sourceNodeId: node.captureNodeId,
    });
  }
  return {
    confidence: clampConfidence(confidence),
    reasons: uniqueSorted(reasons),
    sourceRefs: [node.captureNodeId],
  };
}

function directParentMap(nodes: RawNode[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const parent of nodes) {
    for (const childId of parent.childCaptureNodeIds) {
      if (!result.has(childId)) result.set(childId, parent.captureNodeId);
    }
  }
  return result;
}

export function analyzeBaseLayout(input: BaseLayoutAnalyzerInput): BaseLayoutAnalysisResult {
  const diagnostics: BaseLayoutDiagnostic[] = [];
  const cssByNode = new Map(input.cascade.cascade.nodes.map((node) => [node.sourceNodeId, node]));
  const rawByNode = new Map(input.snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const parentByNode = directParentMap(input.snapshot.nodes);
  const stylesByNode = new Map<string, StyleMap>();
  const modeByNode = new Map<string, WtfLayoutMode>();

  for (const node of input.snapshot.nodes) {
    const css = cssByNode.get(node.captureNodeId);
    const styles = styleMap(css);
    stylesByNode.set(node.captureNodeId, styles);
    const display = computed(styles, "display", node.visibility?.display ?? "");
    const position = computed(styles, "position", "static");
    const mode = layoutMode(display, position);
    modeByNode.set(node.captureNodeId, mode);
    if (!css && node.kind === "element") {
      diagnostics.push({
        code: "BASE_LAYOUT_CSS_NODE_MISSING",
        message: "CSS cascade evidence is unavailable; layout confidence is reduced.",
        sourceNodeId: node.captureNodeId,
      });
    }
    if (display.toLowerCase() === "table" || display.toLowerCase().startsWith("table-")) {
      diagnostics.push({
        code: "BASE_LAYOUT_TABLE_DEFERRED",
        message: "Table reconstruction is deferred to NODE-18 and remains unknown in base layout analysis.",
        sourceNodeId: node.captureNodeId,
        property: "display",
      });
    }
  }

  const analyses: BaseLayoutNodeAnalysis[] = [];
  for (const node of input.snapshot.nodes) {
    const styles = stylesByNode.get(node.captureNodeId) ?? new Map<string, StyleValue>();
    const mode = modeByNode.get(node.captureNodeId) ?? "unknown";
    const parentSourceNodeId = parentByNode.get(node.captureNodeId);
    const parentMode = parentSourceNodeId ? modeByNode.get(parentSourceNodeId) : undefined;
    const display = computed(styles, "display", node.visibility?.display ?? "");
    const position = computed(styles, "position", "static");
    const children = node.childCaptureNodeIds.flatMap((id) => {
      const child = rawByNode.get(id);
      return child ? [child] : [];
    });
    const gap = effectiveGap(mode, styles, children);
    const padding = edges(styles, "padding");
    const hasPadding = Object.values(padding).some((value) => value !== 0);

    const layout: WtfLayoutModel = {
      mode,
      display,
      position,
      sizing: axisSizing(node, styles, parentMode),
      ...(hasPadding ? { padding } : {}),
      ...(gap === undefined ? {} : { effectiveGap: gap }),
      ...(computed(styles, "overflow-x") ? { overflowX: computed(styles, "overflow-x") } : {}),
      ...(computed(styles, "overflow-y") ? { overflowY: computed(styles, "overflow-y") } : {}),
      ...(mode === "flex" ? { flexContainer: flexContainer(styles) } : {}),
      ...(parentMode === "flex" ? { flexItem: flexItem(styles) } : {}),
      ...(mode === "grid" ? { gridContainer: gridContainer(styles) } : {}),
      ...(parentMode === "grid" ? { gridItem: gridItem(styles) } : {}),
      ...(mode === "absolute" || position === "sticky"
        ? { absoluteConstraints: absoluteConstraints(styles) }
        : {}),
      decision: decision(node, cssByNode.has(node.captureNodeId), mode, diagnostics),
    };
    const box = boxModel(node, styles);
    analyses.push({
      sourceNodeId: node.captureNodeId,
      ...(parentSourceNodeId === undefined ? {} : { parentSourceNodeId }),
      layout,
      ...(box === undefined ? {} : { boxModel: box }),
    });
  }

  analyses.sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
  diagnostics.sort(
    (left, right) =>
      (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") ||
      left.code.localeCompare(right.code) ||
      (left.property ?? "").localeCompare(right.property ?? ""),
  );

  return {
    version: BASE_LAYOUT_ANALYZER_VERSION,
    nodes: analyses,
    diagnostics,
  };
}

export function summarizeBaseLayout(result: BaseLayoutAnalysisResult): BaseLayoutAnalysisSummary {
  const count = (mode: WtfLayoutMode): number =>
    result.nodes.filter((analysis) => analysis.layout.mode === mode).length;
  return {
    version: result.version,
    nodeCount: result.nodes.length,
    flowCount: count("flow"),
    flexCount: count("flex"),
    gridCount: count("grid"),
    absoluteCount: count("absolute"),
    inlineCount: count("inline"),
    contentsCount: count("contents"),
    unknownCount: count("unknown"),
    diagnosticCount: result.diagnostics.length,
  };
}
