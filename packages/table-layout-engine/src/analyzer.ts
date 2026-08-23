import type { RawNode } from "@w2f/capture-core";
import type { CssCascadePropertyTrace, CssNodeCascadeEvidence } from "@w2f/css-cascade";
import {
  TABLE_LAYOUT_ENGINE_VERSION,
  type TableCaptionAnalysis,
  type TableCellAnalysis,
  type TableColumnTrack,
  type TableDecisionEvidence,
  type TableLayoutAnalysis,
  type TableLayoutDiagnostic,
  type TableLayoutInput,
  type TableLayoutResult,
  type TableLayoutSummary,
  type TableOccupancySlot,
  type TableRowAnalysis,
  type TableRowGroupAnalysis,
  type TableRowGroupKind,
  type TableRowTrack,
  type TableStrategyHint,
} from "./types.js";

const TABLE_TAGS = new Set(["table"]);
const ROW_GROUP_TAGS = new Map<string, TableRowGroupKind>([
  ["thead", "header"],
  ["tbody", "body"],
  ["tfoot", "footer"],
]);
const CELL_TAGS = new Set(["td", "th"]);

function tag(node: RawNode | undefined): string {
  return node?.source.tagName?.toLowerCase() ?? "";
}

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function winner(trace: CssCascadePropertyTrace | undefined): string | undefined {
  return trace?.candidates.find((candidate) => candidate.status === "winner")?.authoredValue?.trim();
}

function trace(node: CssNodeCascadeEvidence | undefined, property: string): CssCascadePropertyTrace | undefined {
  return node?.traces.find((candidate) => candidate.property.toLowerCase() === property.toLowerCase());
}

function styleValue(node: CssNodeCascadeEvidence | undefined, property: string): {
  computed?: string;
  authored?: string;
} {
  const found = trace(node, property);
  const computed = found?.computedValue.trim();
  const authored = winner(found);
  return {
    ...(computed ? { computed } : {}),
    ...(authored ? { authored } : {}),
  };
}

function parsePositiveSpan(
  raw: string | undefined,
  sourceNodeId: string,
  property: "rowspan" | "colspan",
  diagnostics: TableLayoutDiagnostic[],
): number | "to-end" {
  if (raw === undefined || raw.trim() === "") return 1;
  const parsed = Number(raw);
  if (property === "rowspan" && parsed === 0) return "to-end";
  if (!Number.isInteger(parsed) || parsed < 1) {
    diagnostics.push({
      code: "TABLE_SPAN_INVALID",
      message: `${property} must be a positive integer${property === "rowspan" ? " or zero for remaining rows" : ""}; using 1.`,
      sourceNodeId,
    });
    return 1;
  }
  return parsed;
}

function px(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i.exec(raw.trim());
  if (!match) return undefined;
  const parsed = Number(match[1] ?? "NaN");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBorderSpacing(raw: string | undefined): { horizontal: number; vertical: number } | undefined {
  if (!raw) return undefined;
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return undefined;
  const horizontal = px(parts[0]);
  const vertical = px(parts[1] ?? parts[0]);
  if (horizontal === undefined || vertical === undefined) return undefined;
  return { horizontal, vertical };
}

function boundsUnion(nodes: readonly RawNode[]): RawNode["geometry"]["bounds"] | undefined {
  const bounds = nodes.flatMap((node) => (node.geometry?.bounds ? [node.geometry.bounds] : []));
  if (bounds.length === 0) return undefined;
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function directChildren(node: RawNode, byId: ReadonlyMap<string, RawNode>): RawNode[] {
  return node.childCaptureNodeIds.flatMap((sourceNodeId) => {
    const child = byId.get(sourceNodeId);
    return child ? [child] : [];
  });
}

function collectRows(
  table: RawNode,
  byId: ReadonlyMap<string, RawNode>,
  diagnostics: TableLayoutDiagnostic[],
): { groups: TableRowGroupAnalysis[]; rows: RawNode[]; rowGroupById: Map<string, { index: number; kind: TableRowGroupKind }> } {
  const groups: TableRowGroupAnalysis[] = [];
  const rows: RawNode[] = [];
  const rowGroupById = new Map<string, { index: number; kind: TableRowGroupKind }>();
  let anonymousRows: RawNode[] = [];

  const flushAnonymous = () => {
    if (anonymousRows.length === 0) return;
    const groupIndex = groups.length;
    const rowSourceNodeIds = anonymousRows.map((row) => row.captureNodeId);
    groups.push({
      kind: "anonymous",
      rowSourceNodeIds,
      ...(boundsUnion(anonymousRows) ? { bounds: boundsUnion(anonymousRows) } : {}),
    });
    for (const row of anonymousRows) {
      rowGroupById.set(row.captureNodeId, { index: groupIndex, kind: "anonymous" });
      rows.push(row);
    }
    anonymousRows = [];
  };

  for (const child of directChildren(table, byId)) {
    const childTag = tag(child);
    if (childTag === "tr") {
      anonymousRows.push(child);
      continue;
    }
    const groupKind = ROW_GROUP_TAGS.get(childTag);
    if (groupKind) {
      flushAnonymous();
      const groupRows = directChildren(child, byId).filter((node) => tag(node) === "tr");
      const groupIndex = groups.length;
      groups.push({
        sourceNodeId: child.captureNodeId,
        kind: groupKind,
        rowSourceNodeIds: groupRows.map((row) => row.captureNodeId),
        ...(child.geometry?.bounds ? { bounds: child.geometry.bounds } : {}),
      });
      for (const row of groupRows) {
        rowGroupById.set(row.captureNodeId, { index: groupIndex, kind: groupKind });
        rows.push(row);
      }
      continue;
    }
    if (childTag === "td" || childTag === "th") {
      diagnostics.push({
        code: "TABLE_CELL_OUTSIDE_ROW",
        message: "A table cell is not contained by a captured row and is excluded from grid reconstruction.",
        sourceNodeId: child.captureNodeId,
        relatedSourceNodeIds: [table.captureNodeId],
      });
    }
  }
  flushAnonymous();
  return { groups, rows, rowGroupById };
}

function decisionForCell(cell: RawNode, rowSpan: number, columnSpan: number): TableDecisionEvidence {
  const hasGeometry = cell.geometry?.bounds !== undefined;
  return {
    confidence: clampConfidence(hasGeometry ? 0.99 : 0.84),
    reasons: uniqueSorted([
      "cell placement follows captured source row order",
      rowSpan > 1 || columnSpan > 1 ? "HTML span attributes define grid occupancy" : "cell occupies one grid slot",
      hasGeometry ? "resolved Browser geometry is available" : "resolved Browser geometry is unavailable",
    ]),
    sourceRefs: [cell.captureNodeId],
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

function deriveTracks(cells: readonly TableCellAnalysis[], rowCount: number, columnCount: number): {
  rowTracks: TableRowTrack[];
  columnTracks: TableColumnTrack[];
  complete: boolean;
} {
  const rowBoundaries = new Map<number, number[]>();
  const columnBoundaries = new Map<number, number[]>();
  const rowCells = new Map<number, Set<string>>();
  const columnCells = new Map<number, Set<string>>();
  const addBoundary = (map: Map<number, number[]>, index: number, value: number) => {
    const list = map.get(index) ?? [];
    list.push(value);
    map.set(index, list);
  };
  const addCell = (map: Map<number, Set<string>>, index: number, id: string) => {
    const set = map.get(index) ?? new Set<string>();
    set.add(id);
    map.set(index, set);
  };

  for (const cell of cells) {
    for (let row = cell.rowIndex; row < cell.rowEnd; row += 1) addCell(rowCells, row, cell.sourceNodeId);
    for (let column = cell.columnIndex; column < cell.columnEnd; column += 1) addCell(columnCells, column, cell.sourceNodeId);
    if (!cell.bounds) continue;
    addBoundary(rowBoundaries, cell.rowIndex, cell.bounds.y);
    addBoundary(rowBoundaries, cell.rowEnd, cell.bounds.y + cell.bounds.height);
    addBoundary(columnBoundaries, cell.columnIndex, cell.bounds.x);
    addBoundary(columnBoundaries, cell.columnEnd, cell.bounds.x + cell.bounds.width);
  }

  const resolvedRows = new Map<number, number>();
  const resolvedColumns = new Map<number, number>();
  for (const [index, values] of rowBoundaries) {
    const value = median(values);
    if (value !== undefined) resolvedRows.set(index, value);
  }
  for (const [index, values] of columnBoundaries) {
    const value = median(values);
    if (value !== undefined) resolvedColumns.set(index, value);
  }

  const rowTracks: TableRowTrack[] = Array.from({ length: rowCount }, (_, rowIndex) => {
    const start = resolvedRows.get(rowIndex);
    const end = resolvedRows.get(rowIndex + 1);
    return {
      rowIndex,
      ...(start === undefined ? {} : { resolvedY: start }),
      ...(start === undefined || end === undefined ? {} : { resolvedHeight: Math.max(0, end - start) }),
      sourceCellIds: [...(rowCells.get(rowIndex) ?? [])].sort(),
    };
  });
  const columnTracks: TableColumnTrack[] = Array.from({ length: columnCount }, (_, columnIndex) => {
    const start = resolvedColumns.get(columnIndex);
    const end = resolvedColumns.get(columnIndex + 1);
    return {
      columnIndex,
      ...(start === undefined ? {} : { resolvedX: start }),
      ...(start === undefined || end === undefined ? {} : { resolvedWidth: Math.max(0, end - start) }),
      sourceCellIds: [...(columnCells.get(columnIndex) ?? [])].sort(),
    };
  });
  return {
    rowTracks,
    columnTracks,
    complete:
      rowTracks.every((track) => track.resolvedY !== undefined && track.resolvedHeight !== undefined) &&
      columnTracks.every((track) => track.resolvedX !== undefined && track.resolvedWidth !== undefined),
  };
}

function strategyHint(cells: readonly TableCellAnalysis[], geometryComplete: boolean): TableStrategyHint {
  if (!geometryComplete) return "absolute-semantic";
  return cells.some((cell) => cell.rowSpan > 1 || cell.columnSpan > 1) ? "span-hybrid" : "regular-grid";
}

function analyzeTable(
  table: RawNode,
  byId: ReadonlyMap<string, RawNode>,
  cssById: ReadonlyMap<string, CssNodeCascadeEvidence>,
): TableLayoutAnalysis {
  const diagnostics: TableLayoutDiagnostic[] = [];
  const { groups, rows, rowGroupById } = collectRows(table, byId, diagnostics);
  const occupancyByKey = new Map<string, TableOccupancySlot>();
  const cells: TableCellAnalysis[] = [];
  const rowAnalyses: TableRowAnalysis[] = [];
  const rowCount = rows.length;
  let columnCount = 0;

  for (const [rowIndex, row] of rows.entries()) {
    const group = rowGroupById.get(row.captureNodeId) ?? { index: 0, kind: "anonymous" as const };
    const rowCells = directChildren(row, byId).filter((node) => CELL_TAGS.has(tag(node)));
    if (rowCells.length === 0) {
      diagnostics.push({
        code: "TABLE_ROW_WITHOUT_CELL",
        message: "Captured table row contains no td/th children.",
        sourceNodeId: row.captureNodeId,
      });
    }
    let cursor = 0;
    const rowCellIds: string[] = [];
    for (const cell of rowCells) {
      while (occupancyByKey.has(`${rowIndex}:${cursor}`)) cursor += 1;
      const rawRowSpan = parsePositiveSpan(cell.source.attributes?.rowspan, cell.captureNodeId, "rowspan", diagnostics);
      const columnSpan = parsePositiveSpan(cell.source.attributes?.colspan, cell.captureNodeId, "colspan", diagnostics);
      const resolvedColumnSpan = columnSpan === "to-end" ? 1 : columnSpan;
      const rowSpan = rawRowSpan === "to-end" ? Math.max(1, rowCount - rowIndex) : rawRowSpan;
      const rowEnd = Math.min(rowCount, rowIndex + rowSpan);
      const columnEnd = cursor + resolvedColumnSpan;
      const conflicts = new Set<string>();
      for (let rowSlot = rowIndex; rowSlot < rowEnd; rowSlot += 1) {
        for (let columnSlot = cursor; columnSlot < columnEnd; columnSlot += 1) {
          const key = `${rowSlot}:${columnSlot}`;
          const existing = occupancyByKey.get(key);
          if (existing) {
            conflicts.add(existing.sourceCellId);
            continue;
          }
          occupancyByKey.set(key, {
            rowIndex: rowSlot,
            columnIndex: columnSlot,
            sourceCellId: cell.captureNodeId,
            origin: rowSlot === rowIndex && columnSlot === cursor,
          });
        }
      }
      if (conflicts.size > 0) {
        diagnostics.push({
          code: "TABLE_SPAN_CONFLICT",
          message: "Cell span overlaps previously occupied table grid slots; conflicting slots keep first ownership.",
          sourceNodeId: cell.captureNodeId,
          relatedSourceNodeIds: [...conflicts].sort(),
        });
      }
      const headers = (cell.source.attributes?.headers ?? "").split(/\s+/).filter(Boolean).sort();
      cells.push({
        sourceNodeId: cell.captureNodeId,
        kind: tag(cell) === "th" ? "header" : "data",
        rowIndex,
        columnIndex: cursor,
        rowSpan: rowEnd - rowIndex,
        columnSpan: resolvedColumnSpan,
        rowEnd,
        columnEnd,
        ...(cell.source.attributes?.scope ? { scope: cell.source.attributes.scope } : {}),
        headers,
        ...(cell.geometry?.bounds ? { bounds: cell.geometry.bounds } : {}),
        decision: decisionForCell(cell, rowEnd - rowIndex, resolvedColumnSpan),
      });
      rowCellIds.push(cell.captureNodeId);
      columnCount = Math.max(columnCount, columnEnd);
      cursor = columnEnd;
    }
    rowAnalyses.push({
      sourceNodeId: row.captureNodeId,
      rowIndex,
      groupIndex: group.index,
      groupKind: group.kind,
      cellSourceNodeIds: rowCellIds,
      ...(row.geometry?.bounds ? { bounds: row.geometry.bounds } : {}),
    });
  }

  const css = cssById.get(table.captureNodeId);
  const collapseEvidence = styleValue(css, "border-collapse");
  const spacingEvidence = styleValue(css, "border-spacing");
  const tableLayoutEvidence = styleValue(css, "table-layout");
  if (!collapseEvidence.computed || !spacingEvidence.computed || !tableLayoutEvidence.computed) {
    diagnostics.push({
      code: "TABLE_STYLE_EVIDENCE_MISSING",
      message: "One or more computed table layout properties are unavailable; CSS initial values are used as deterministic fallback.",
      sourceNodeId: table.captureNodeId,
    });
  }
  const spacing = parseBorderSpacing(spacingEvidence.computed ?? spacingEvidence.authored) ?? {
    horizontal: 0,
    vertical: 0,
  };
  const captionNode = directChildren(table, byId).find((node) => tag(node) === "caption");
  const captionCss = captionNode ? cssById.get(captionNode.captureNodeId) : undefined;
  const captionSide = styleValue(captionCss, "caption-side");
  const caption: TableCaptionAnalysis | undefined = captionNode
    ? {
        sourceNodeId: captionNode.captureNodeId,
        side: captionSide.computed ?? captionSide.authored ?? "top",
        ...(captionNode.geometry?.bounds ? { bounds: captionNode.geometry.bounds } : {}),
      }
    : undefined;

  if (rows.length === 0) {
    diagnostics.push({
      code: "TABLE_STRUCTURE_EMPTY",
      message: "Captured table has no reconstructable rows.",
      sourceNodeId: table.captureNodeId,
    });
  }
  const tracks = deriveTracks(cells, rowCount, columnCount);
  if (cells.length > 0 && !tracks.complete) {
    diagnostics.push({
      code: "TABLE_GEOMETRY_INCOMPLETE",
      message: "Cell geometry does not resolve every row/column track boundary; semantic occupancy remains authoritative.",
      sourceNodeId: table.captureNodeId,
    });
  }

  const strategy = strategyHint(cells, tracks.complete);
  const decision: TableDecisionEvidence = {
    confidence: clampConfidence(rows.length > 0 ? (tracks.complete ? 0.99 : 0.9) : 0.55),
    reasons: uniqueSorted([
      "table source semantics define row and cell hierarchy",
      "rowspan/colspan attributes define deterministic occupancy",
      tracks.complete ? "resolved geometry defines table track boundaries" : "semantic occupancy survives incomplete geometry",
      strategy === "regular-grid"
        ? "regular one-slot cells are compatible with downstream grid rendering"
        : strategy === "span-hybrid"
          ? "spanned cells require downstream grid/absolute hybrid consideration"
          : "incomplete geometry requires downstream semantic absolute fallback consideration",
    ]),
    sourceRefs: [table.captureNodeId, ...cells.map((cell) => cell.sourceNodeId)].sort(),
  };

  return {
    version: TABLE_LAYOUT_ENGINE_VERSION,
    sourceNodeId: table.captureNodeId,
    rowCount,
    columnCount,
    rowGroups: groups,
    rows: rowAnalyses,
    cells: cells.sort((left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex || left.sourceNodeId.localeCompare(right.sourceNodeId)),
    occupancy: [...occupancyByKey.values()].sort((left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex || left.sourceCellId.localeCompare(right.sourceCellId)),
    rowTracks: tracks.rowTracks,
    columnTracks: tracks.columnTracks,
    ...(caption ? { caption } : {}),
    borderCollapse: collapseEvidence.computed ?? collapseEvidence.authored ?? "separate",
    borderSpacing: {
      ...spacing,
      ...(spacingEvidence.authored ? { authored: spacingEvidence.authored } : {}),
    },
    tableLayout: tableLayoutEvidence.computed ?? tableLayoutEvidence.authored ?? "auto",
    strategyHint: strategy,
    ...(table.geometry?.bounds ? { bounds: table.geometry.bounds } : {}),
    decision,
    diagnostics: diagnostics.sort((left, right) => (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") || left.code.localeCompare(right.code)),
  };
}

export function analyzeTableLayout(input: TableLayoutInput): TableLayoutResult {
  const byId = new Map(input.snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const cssById = new Map(input.cascade.cascade.nodes.map((node) => [node.sourceNodeId, node]));
  const tables = input.snapshot.nodes
    .filter((node) => TABLE_TAGS.has(tag(node)))
    .map((table) => analyzeTable(table, byId, cssById))
    .sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
  return {
    version: TABLE_LAYOUT_ENGINE_VERSION,
    tables,
    diagnostics: tables.flatMap((table) => table.diagnostics),
  };
}

export function summarizeTableLayout(result: TableLayoutResult): TableLayoutSummary {
  return {
    version: result.version,
    tableCount: result.tables.length,
    rowCount: result.tables.reduce((sum, table) => sum + table.rowCount, 0),
    cellCount: result.tables.reduce((sum, table) => sum + table.cells.length, 0),
    spannedCellCount: result.tables.reduce(
      (sum, table) => sum + table.cells.filter((cell) => cell.rowSpan > 1 || cell.columnSpan > 1).length,
      0,
    ),
    collapsedBorderTableCount: result.tables.filter((table) => table.borderCollapse === "collapse").length,
    diagnosticCount: result.diagnostics.length,
  };
}
