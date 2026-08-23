import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { WtfBoxModel, WtfLayoutModel } from "@w2f/w2f-ir";

export const BASE_LAYOUT_ANALYZER_VERSION = "1.0.0" as const;

export type BaseLayoutAnalyzerVersion = typeof BASE_LAYOUT_ANALYZER_VERSION;

export interface BaseLayoutAnalyzerInput {
  snapshot: RawSnapshot;
  cascade: CssCascadeCapture;
}

export type BaseLayoutDiagnosticCode =
  | "BASE_LAYOUT_CSS_NODE_MISSING"
  | "BASE_LAYOUT_GEOMETRY_MISSING"
  | "BASE_LAYOUT_TABLE_DEFERRED"
  | "BASE_LAYOUT_PARENT_GEOMETRY_MISSING"
  | "BASE_LAYOUT_GRID_TRACK_UNRESOLVED"
  | "BASE_LAYOUT_VALUE_UNRESOLVED";

export interface BaseLayoutDiagnostic {
  code: BaseLayoutDiagnosticCode;
  message: string;
  sourceNodeId?: string;
  property?: string;
}

export interface BaseLayoutNodeAnalysis {
  sourceNodeId: string;
  parentSourceNodeId?: string;
  layout: WtfLayoutModel;
  boxModel?: WtfBoxModel;
}

export interface BaseLayoutAnalysisResult {
  version: BaseLayoutAnalyzerVersion;
  nodes: BaseLayoutNodeAnalysis[];
  diagnostics: BaseLayoutDiagnostic[];
}

export type BaseLayoutAnalysis = BaseLayoutAnalysisResult;

export interface BaseLayoutAnalysisSummary {
  version: BaseLayoutAnalyzerVersion;
  nodeCount: number;
  flowCount: number;
  flexCount: number;
  gridCount: number;
  absoluteCount: number;
  tableCount: number;
  inlineCount: number;
  contentsCount: number;
  unknownCount: number;
  diagnosticCount: number;
}
