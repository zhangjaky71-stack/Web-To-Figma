import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { Rect } from "@w2f/w2f-schema";

export const TABLE_LAYOUT_ENGINE_VERSION = "1.0.0" as const;

export type TableLayoutEngineVersion = typeof TABLE_LAYOUT_ENGINE_VERSION;
export type TableRowGroupKind = "header" | "body" | "footer" | "anonymous";
export type TableCellKind = "header" | "data";
export type TableStrategyHint = "regular-grid" | "span-hybrid" | "absolute-semantic";

export interface TableLayoutInput {
  snapshot: RawSnapshot;
  cascade: CssCascadeCapture;
}

export interface TableDecisionEvidence {
  confidence: number;
  reasons: string[];
  sourceRefs: string[];
}

export interface TableCaptionAnalysis {
  sourceNodeId: string;
  side: string;
  bounds?: Rect;
}

export interface TableRowGroupAnalysis {
  sourceNodeId?: string;
  kind: TableRowGroupKind;
  rowSourceNodeIds: string[];
  bounds?: Rect;
}

export interface TableRowAnalysis {
  sourceNodeId: string;
  rowIndex: number;
  groupIndex: number;
  groupKind: TableRowGroupKind;
  cellSourceNodeIds: string[];
  bounds?: Rect;
}

export interface TableCellAnalysis {
  sourceNodeId: string;
  kind: TableCellKind;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  rowEnd: number;
  columnEnd: number;
  scope?: string;
  headers: string[];
  bounds?: Rect;
  decision: TableDecisionEvidence;
}

export interface TableColumnTrack {
  columnIndex: number;
  resolvedX?: number;
  resolvedWidth?: number;
  sourceCellIds: string[];
}

export interface TableRowTrack {
  rowIndex: number;
  resolvedY?: number;
  resolvedHeight?: number;
  sourceCellIds: string[];
}

export interface TableOccupancySlot {
  rowIndex: number;
  columnIndex: number;
  sourceCellId: string;
  origin: boolean;
}

export interface TableLayoutAnalysis {
  version: TableLayoutEngineVersion;
  sourceNodeId: string;
  rowCount: number;
  columnCount: number;
  rowGroups: TableRowGroupAnalysis[];
  rows: TableRowAnalysis[];
  cells: TableCellAnalysis[];
  occupancy: TableOccupancySlot[];
  rowTracks: TableRowTrack[];
  columnTracks: TableColumnTrack[];
  caption?: TableCaptionAnalysis;
  borderCollapse: string;
  borderSpacing: {
    horizontal: number;
    vertical: number;
    authored?: string;
  };
  tableLayout: string;
  strategyHint: TableStrategyHint;
  bounds?: Rect;
  decision: TableDecisionEvidence;
  diagnostics: TableLayoutDiagnostic[];
}

export type TableLayoutDiagnosticCode =
  | "TABLE_STRUCTURE_EMPTY"
  | "TABLE_ROW_WITHOUT_CELL"
  | "TABLE_SPAN_INVALID"
  | "TABLE_SPAN_CONFLICT"
  | "TABLE_CELL_OUTSIDE_ROW"
  | "TABLE_ROW_OUTSIDE_TABLE"
  | "TABLE_GEOMETRY_INCOMPLETE"
  | "TABLE_STYLE_EVIDENCE_MISSING";

export interface TableLayoutDiagnostic {
  code: TableLayoutDiagnosticCode;
  message: string;
  sourceNodeId?: string;
  relatedSourceNodeIds?: string[];
}

export interface TableLayoutResult {
  version: TableLayoutEngineVersion;
  tables: TableLayoutAnalysis[];
  diagnostics: TableLayoutDiagnostic[];
}

export interface TableLayoutSummary {
  version: TableLayoutEngineVersion;
  tableCount: number;
  rowCount: number;
  cellCount: number;
  spannedCellCount: number;
  collapsedBorderTableCount: number;
  diagnosticCount: number;
}
