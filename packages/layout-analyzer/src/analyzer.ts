import type {
  WtfAxisSizing,
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
  BASE_LAYOUT_ANALYSIS_VERSION,
  type BaseLayoutAnalysis,
  type BaseLayoutAnalysisInput,
  type BaseLayoutAnalysisSummary,
  type BaseLayoutDiagnostic,
  type BaseLayoutNodeAnalysis,
  type LayoutNodeObservation,
  type LayoutPropertyEvidence,
} from "./types.js";

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((item) => item.length > 0))].sort();
}

function effectiveValue(evidence: LayoutPropertyEvidence | undefined): string | undefined {
  return evidence?.computed?.trim() || evidence?.authored?.trim() || undefined;
}

function authoredValue(evidence: LayoutPropertyEvidence | undefined): string | undefined {
  return evidence?.authored?.trim() || undefined;
}

function sourceRefsForObservation(observation: LayoutNodeObservation): string[] {
  const refs: string[] = [];
  for (const evidence of Object.values(observation.style)) {
    if (evidence?.sourceRef) refs.push(evidence.sourceRef);
  }
  return uniqueSorted(refs);
}

function numericPx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1] ?? "NaN");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numericValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCssLengthRaw(raw: string): WtfCssLength {
  const normalized = raw.trim().toLowerCase();
  const unitMatch = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%|em|rem|vw|vh|vmin|vmax)$/.exec(normalized);
  if (unitMatch) {
    const value = Number(unitMatch[1] ?? "NaN");
    const unit = unitMatch[2];
    if (unit === "px") return { semantic: { type: "px", value }, authoredValue: raw };
    if (unit === "%") return { semantic: { type: "percent", value }, authoredValue: raw };
    if (unit === "em") return { semantic: { type: "em", value }, authoredValue: raw };
    if (unit === "rem") return { semantic: { type: "rem", value }, authoredValue: raw };
    if (unit === "vw" || unit === "vh" || unit === "vmin" || unit === "vmax") {
      return { semantic: { type: "viewport", unit, value }, authoredValue: raw };
    }
  }
  if (/^[a-z-]+(?:\([^)]*\))?$/i.test(normalized)) {
    return { semantic: { type: "keyword", value: normalized }, authoredValue: raw };
  }
  return { semantic: { type: "expression", raw }, authoredValue: raw };
}

export function parseLayoutCssLength(
  evidence: LayoutPropertyEvidence | undefined,
): WtfCssLength | undefined {
  if (!evidence) return undefined;
  const authored = authoredValue(evidence);
  const computed = evidence.computed?.trim();
  const source = authored ?? computed;
  if (!source) return undefined;
  const parsed = parseCssLengthRaw(source);
  const resolvedPx = numericPx(computed);
  return resolvedPx === undefined ? parsed : { ...parsed, resolvedPx };
}

function layoutMode(display: string, position: string): WtfLayoutMode {
  if (display === "none") return "none";
  if (position === "absolute" || position === "fixed") return "absolute";
  if (display === "flex" || display === "inline-flex") return "flex";
  if (display === "grid" || display === "inline-grid") return "grid";
  if (display.startsWith("table")) return "table";
  if (display === "contents") return "contents";
  if (display === "inline" || display === "inline-block") return "inline";
  if (["block", "flow-root", "list-item", "ruby"].includes(display)) return "flow";
  return "unknown";
}

function geometryFillEvidence(observation: LayoutNodeObservation, axis: "width" | "height"): boolean {
  if (!observation.bounds || !observation.parentBounds) return false;
  const nodeSize = axis === "width" ? observation.bounds.width : observation.bounds.height;
  const parentSize = axis === "width" ? observation.parentBounds.width : observation.parentBounds.height;
  if (!(Number.isFinite(nodeSize) && Number.isFinite(parentSize) && parentSize > 0)) return false;
  const ratio = nodeSize / parentSize;
  return ratio >= 0.88 && ratio <= 1.05;
}

function authoredSizingMode(
  observation: LayoutNodeObservation,
  axis: "width" | "height",
  display: string,
): { mode: WtfSizingMode; confidence: number; reason: string; value?: WtfCssLength } | null {
  const evidence = axis === "width" ? observation.style.width : observation.style.height;
  const value = parseLayoutCssLength(evidence);
  const authored = authoredValue(evidence)?.toLowerCase();
  if (!authored || !value) return null;

  if (value.semantic.type === "px") {
    return { mode: "fixed", confidence: 0.98, reason: `${axis} has authored px sizing`, value };
  }
  if (value.semantic.type === "percent") {
    if (value.semantic.value >= 95) {
      return { mode: "fill", confidence: 0.94, reason: `${axis} uses an authored near-full percentage`, value };
    }
    return {
      mode: "unknown",
      confidence: 0.62,
      reason: `${axis} uses a partial percentage that is responsive but not equivalent to full fill`,
      value,
    };
  }
  if (value.semantic.type === "viewport") {
    return { mode: "fill", confidence: 0.84, reason: `${axis} uses viewport-relative sizing`, value };
  }
  if (value.semantic.type === "keyword") {
    const keyword = value.semantic.value;
    if (keyword.startsWith("fit-content") || keyword === "min-content" || keyword === "max-content") {
      return { mode: "hug", confidence: 0.96, reason: `${axis} uses intrinsic-content sizing`, value };
    }
    if (keyword === "auto") {
      if (axis === "width" && ["block", "flow-root", "flex", "grid", "table"].includes(display)) {
        return geometryFillEvidence(observation, axis)
          ? { mode: "fill", confidence: 0.82, reason: "auto width occupies the available parent width", value }
          : { mode: "unknown", confidence: 0.55, reason: "auto width is context-dependent without strong geometry evidence", value };
      }
      return { mode: "content", confidence: 0.7, reason: `auto ${axis} is content-dependent`, value };
    }
  }
  return { mode: "unknown", confidence: 0.5, reason: `${axis} authored sizing cannot be safely reduced to fill/hug/fixed`, value };
}

function flexGrowFillEvidence(observation: LayoutNodeObservation, axis: "width" | "height"): boolean {
  if (axis !== "width") return false;
  const grow = numericValue(effectiveValue(observation.style.flexGrow));
  return grow !== undefined && grow > 0;
}

function sizingDecision(
  observation: LayoutNodeObservation,
  axis: "width" | "height",
  display: string,
  diagnostics: BaseLayoutDiagnostic[],
): WtfSizingDecision {
  const authored = authoredSizingMode(observation, axis, display);
  const responsiveHint = axis === "width" ? observation.responsiveSizing?.width : observation.responsiveSizing?.height;
  const min = parseLayoutCssLength(axis === "width" ? observation.style.minWidth : observation.style.minHeight);
  const max = parseLayoutCssLength(axis === "width" ? observation.style.maxWidth : observation.style.maxHeight);
  const sourceRefs = sourceRefsForObservation(observation);

  if (authored && responsiveHint && responsiveHint.mode !== "unknown" && authored.mode !== "unknown" && authored.mode !== responsiveHint.mode) {
    diagnostics.push({
      code: "LAYOUT_SIZING_CONFLICT",
      message: `Authored ${axis} sizing conflicts with responsive multi-viewport inference; authored base semantics are retained with reduced confidence.`,
      sourceNodeId: observation.sourceNodeId,
      property: axis,
    });
    return {
      mode: authored.mode,
      ...(authored.value ? { value: authored.value } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      confidence: clampConfidence(authored.confidence * 0.8),
      reasons: uniqueSorted([authored.reason, ...responsiveHint.reasons, "responsive sizing evidence conflicts with authored base semantics"]),
      sourceRefs: uniqueSorted([...sourceRefs, ...(responsiveHint.sourceRefs ?? [])]),
    };
  }

  if (authored && authored.mode !== "unknown") {
    return {
      mode: authored.mode,
      ...(authored.value ? { value: authored.value } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      confidence: authored.confidence,
      reasons: [authored.reason],
      ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    };
  }

  if (responsiveHint && responsiveHint.mode !== "unknown" && responsiveHint.confidence >= 0.6) {
    return {
      mode: responsiveHint.mode,
      ...(authored?.value ? { value: authored.value } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      confidence: clampConfidence(responsiveHint.confidence * 0.92),
      reasons: uniqueSorted([...responsiveHint.reasons, "multi-viewport responsive inference strengthens base sizing"]),
      sourceRefs: uniqueSorted([...sourceRefs, ...(responsiveHint.sourceRefs ?? [])]),
    };
  }

  if (flexGrowFillEvidence(observation, axis)) {
    return {
      mode: "fill",
      ...(authored?.value ? { value: authored.value } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      confidence: 0.88,
      reasons: ["positive flex-grow provides fill evidence"],
      ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    };
  }

  if (geometryFillEvidence(observation, axis)) {
    return {
      mode: "fill",
      ...(authored?.value ? { value: authored.value } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      confidence: 0.68,
      reasons: [`${axis} geometry approximately fills parent bounds; geometry-only evidence remains moderate-confidence`],
      ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    };
  }

  return {
    mode: authored?.mode ?? "unknown",
    ...(authored?.value ? { value: authored.value } : {}),
    ...(min ? { min } : {}),
    ...(max ? { max } : {}),
    confidence: authored?.confidence ?? 0.2,
    reasons: [authored?.reason ?? `insufficient evidence to infer ${axis} sizing mode`],
    ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
  };
}

function pxOrZero(evidence: LayoutPropertyEvidence | undefined): number {
  return numericPx(effectiveValue(evidence)) ?? 0;
}

function splitCssTrackList(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim();
  if (!normalized || normalized === "none") return [];
  const tracks: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of normalized) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) tracks.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) tracks.push(current.trim());
  return tracks;
}

function gridTrack(authored: string): WtfGridTrack {
  const resolvedPx = numericPx(authored);
  return resolvedPx === undefined ? { authored } : { authored, resolvedPx };
}

function parseGridPlacement(value: string | undefined): number | string | undefined {
  if (!value || value === "auto") return undefined;
  const integer = Number(value);
  return Number.isSafeInteger(integer) ? integer : value;
}

function flexContainer(observation: LayoutNodeObservation): WtfFlexContainerModel {
  const direction = effectiveValue(observation.style.flexDirection);
  const wrap = effectiveValue(observation.style.flexWrap);
  return {
    direction:
      direction === "row-reverse" || direction === "column" || direction === "column-reverse"
        ? direction
        : "row",
    wrap: wrap === "wrap" || wrap === "wrap-reverse" ? wrap : "nowrap",
    justifyContent: effectiveValue(observation.style.justifyContent) ?? "normal",
    alignItems: effectiveValue(observation.style.alignItems) ?? "normal",
    ...(effectiveValue(observation.style.alignContent)
      ? { alignContent: effectiveValue(observation.style.alignContent)! }
      : {}),
    rowGap: pxOrZero(observation.style.rowGap),
    columnGap: pxOrZero(observation.style.columnGap),
  };
}

function flexItem(observation: LayoutNodeObservation): WtfFlexItemModel | undefined {
  const grow = numericValue(effectiveValue(observation.style.flexGrow));
  const shrink = numericValue(effectiveValue(observation.style.flexShrink));
  const basis = parseLayoutCssLength(observation.style.flexBasis);
  const alignSelf = effectiveValue(observation.style.alignSelf);
  const order = numericValue(effectiveValue(observation.style.order));
  if (grow === undefined && shrink === undefined && !basis && !alignSelf && order === undefined) return undefined;
  return {
    ...(grow === undefined ? {} : { grow }),
    ...(shrink === undefined ? {} : { shrink }),
    ...(basis ? { basis } : {}),
    ...(alignSelf ? { alignSelf } : {}),
    ...(order === undefined ? {} : { order }),
  };
}

function gridContainer(observation: LayoutNodeObservation): WtfGridContainerModel {
  const columns = splitCssTrackList(authoredValue(observation.style.gridTemplateColumns) ?? effectiveValue(observation.style.gridTemplateColumns)).map(gridTrack);
  const rows = splitCssTrackList(authoredValue(observation.style.gridTemplateRows) ?? effectiveValue(observation.style.gridTemplateRows)).map(gridTrack);
  return {
    columns,
    rows,
    ...(effectiveValue(observation.style.gridAutoFlow)
      ? { autoFlow: effectiveValue(observation.style.gridAutoFlow)! }
      : {}),
    rowGap: pxOrZero(observation.style.rowGap),
    columnGap: pxOrZero(observation.style.columnGap),
  };
}

function gridItem(observation: LayoutNodeObservation): WtfGridItemModel | undefined {
  const columnStart = parseGridPlacement(effectiveValue(observation.style.gridColumnStart));
  const columnEnd = parseGridPlacement(effectiveValue(observation.style.gridColumnEnd));
  const rowStart = parseGridPlacement(effectiveValue(observation.style.gridRowStart));
  const rowEnd = parseGridPlacement(effectiveValue(observation.style.gridRowEnd));
  if (columnStart === undefined && columnEnd === undefined && rowStart === undefined && rowEnd === undefined) return undefined;
  return {
    ...(columnStart === undefined ? {} : { columnStart }),
    ...(columnEnd === undefined ? {} : { columnEnd }),
    ...(rowStart === undefined ? {} : { rowStart }),
    ...(rowEnd === undefined ? {} : { rowEnd }),
  };
}

function absoluteConstraints(observation: LayoutNodeObservation): WtfLayoutModel["absoluteConstraints"] {
  const left = parseLayoutCssLength(observation.style.left);
  const right = parseLayoutCssLength(observation.style.right);
  const top = parseLayoutCssLength(observation.style.top);
  const bottom = parseLayoutCssLength(observation.style.bottom);
  if (!left && !right && !top && !bottom) return undefined;
  return {
    ...(left ? { left } : {}),
    ...(right ? { right } : {}),
    ...(top ? { top } : {}),
    ...(bottom ? { bottom } : {}),
  };
}

function layoutDecision(
  observation: LayoutNodeObservation,
  mode: WtfLayoutMode,
  display: string,
  position: string,
): WtfDecisionEvidence {
  const refs = sourceRefsForObservation(observation);
  const authoredDisplay = authoredValue(observation.style.display);
  const authoredPosition = authoredValue(observation.style.position);
  const confidence = mode === "unknown" ? 0.35 : authoredDisplay || authoredPosition ? 0.96 : 0.9;
  return {
    confidence,
    reasons: uniqueSorted([
      `computed display resolves to ${display}`,
      `computed position resolves to ${position}`,
      ...(authoredDisplay ? [`authored display preserves ${authoredDisplay}`] : []),
      ...(authoredPosition ? [`authored position preserves ${authoredPosition}`] : []),
    ]),
    ...(refs.length > 0 ? { sourceRefs: refs } : {}),
  };
}

function analyzeNode(observation: LayoutNodeObservation): BaseLayoutNodeAnalysis {
  if (!observation.sourceNodeId.trim()) throw new TypeError("layout observation sourceNodeId must be non-empty");
  const diagnostics: BaseLayoutDiagnostic[] = [];
  const display = (effectiveValue(observation.style.display) ?? (observation.kind === "text" ? "inline" : "block")).toLowerCase();
  const position = (effectiveValue(observation.style.position) ?? "static").toLowerCase();
  const mode = layoutMode(display, position);

  if (!observation.bounds && mode !== "none" && mode !== "contents") {
    diagnostics.push({
      code: "LAYOUT_GEOMETRY_MISSING",
      message: "Node has active layout semantics but no captured geometry.",
      sourceNodeId: observation.sourceNodeId,
    });
  }
  if (mode === "unknown") {
    diagnostics.push({
      code: "LAYOUT_DISPLAY_UNKNOWN",
      message: `Display value ${display} is not safely mapped to a frozen base layout mode.`,
      sourceNodeId: observation.sourceNodeId,
      property: "display",
    });
  }
  if (mode === "table") {
    diagnostics.push({
      code: "LAYOUT_TABLE_DEFERRED",
      message: "Table display is classified but detailed table reconstruction is deferred to NODE-18.",
      sourceNodeId: observation.sourceNodeId,
    });
  }

  const sizing: WtfAxisSizing = {
    width: sizingDecision(observation, "width", display, diagnostics),
    height: sizingDecision(observation, "height", display, diagnostics),
  };
  const padding = {
    top: pxOrZero(observation.style.paddingTop),
    right: pxOrZero(observation.style.paddingRight),
    bottom: pxOrZero(observation.style.paddingBottom),
    left: pxOrZero(observation.style.paddingLeft),
  };
  const rowGap = pxOrZero(observation.style.rowGap);
  const columnGap = pxOrZero(observation.style.columnGap);
  const itemFlex = flexItem(observation);
  const itemGrid = gridItem(observation);
  const constraints = mode === "absolute" ? absoluteConstraints(observation) : undefined;

  const layout: WtfLayoutModel = {
    mode,
    display,
    position,
    sizing,
    padding,
    effectiveGap: { row: rowGap, column: columnGap },
    ...(effectiveValue(observation.style.overflowX)
      ? { overflowX: effectiveValue(observation.style.overflowX)! }
      : {}),
    ...(effectiveValue(observation.style.overflowY)
      ? { overflowY: effectiveValue(observation.style.overflowY)! }
      : {}),
    ...(mode === "flex" ? { flexContainer: flexContainer(observation) } : {}),
    ...(itemFlex ? { flexItem: itemFlex } : {}),
    ...(mode === "grid" ? { gridContainer: gridContainer(observation) } : {}),
    ...(itemGrid ? { gridItem: itemGrid } : {}),
    ...(constraints ? { absoluteConstraints: constraints } : {}),
    decision: layoutDecision(observation, mode, display, position),
  };

  return {
    sourceNodeId: observation.sourceNodeId,
    ...(observation.stableNodeId ? { stableNodeId: observation.stableNodeId } : {}),
    layout,
    diagnostics,
  };
}

export function analyzeBaseLayout(input: BaseLayoutAnalysisInput): BaseLayoutAnalysis {
  const seen = new Set<string>();
  const nodes: BaseLayoutNodeAnalysis[] = [];
  for (const observation of [...input.nodes].sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId))) {
    if (seen.has(observation.sourceNodeId)) {
      throw new TypeError(`duplicate layout observation for ${observation.sourceNodeId}`);
    }
    seen.add(observation.sourceNodeId);
    nodes.push(analyzeNode(observation));
  }
  return {
    version: BASE_LAYOUT_ANALYSIS_VERSION,
    nodes,
    diagnostics: nodes.flatMap((node) => node.diagnostics),
  };
}

export function summarizeBaseLayoutAnalysis(analysis: BaseLayoutAnalysis): BaseLayoutAnalysisSummary {
  return {
    version: analysis.version,
    nodeCount: analysis.nodes.length,
    flexNodeCount: analysis.nodes.filter((item) => item.layout.mode === "flex").length,
    gridNodeCount: analysis.nodes.filter((item) => item.layout.mode === "grid").length,
    absoluteNodeCount: analysis.nodes.filter((item) => item.layout.mode === "absolute").length,
    tableNodeCount: analysis.nodes.filter((item) => item.layout.mode === "table").length,
    unknownNodeCount: analysis.nodes.filter((item) => item.layout.mode === "unknown").length,
    diagnosticCount: analysis.diagnostics.length,
  };
}

export function isBaseLayoutAnalysis(value: unknown): value is BaseLayoutAnalysis {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === BASE_LAYOUT_ANALYSIS_VERSION && Array.isArray(record.nodes) && Array.isArray(record.diagnostics);
}
