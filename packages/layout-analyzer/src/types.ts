import type {
  WtfLayoutModel,
  WtfSizingMode,
} from "@w2f/w2f-ir";
import type { Rect } from "@w2f/w2f-schema";

export const BASE_LAYOUT_ANALYSIS_VERSION = "1.0.0" as const;

export type BaseLayoutAnalysisVersion = typeof BASE_LAYOUT_ANALYSIS_VERSION;

export interface LayoutPropertyEvidence {
  computed?: string;
  authored?: string;
  sourceRef?: string;
}

export interface LayoutStyleEvidence {
  display?: LayoutPropertyEvidence;
  position?: LayoutPropertyEvidence;
  width?: LayoutPropertyEvidence;
  height?: LayoutPropertyEvidence;
  minWidth?: LayoutPropertyEvidence;
  maxWidth?: LayoutPropertyEvidence;
  minHeight?: LayoutPropertyEvidence;
  maxHeight?: LayoutPropertyEvidence;
  paddingTop?: LayoutPropertyEvidence;
  paddingRight?: LayoutPropertyEvidence;
  paddingBottom?: LayoutPropertyEvidence;
  paddingLeft?: LayoutPropertyEvidence;
  rowGap?: LayoutPropertyEvidence;
  columnGap?: LayoutPropertyEvidence;
  overflowX?: LayoutPropertyEvidence;
  overflowY?: LayoutPropertyEvidence;
  flexDirection?: LayoutPropertyEvidence;
  flexWrap?: LayoutPropertyEvidence;
  justifyContent?: LayoutPropertyEvidence;
  alignItems?: LayoutPropertyEvidence;
  alignContent?: LayoutPropertyEvidence;
  flexGrow?: LayoutPropertyEvidence;
  flexShrink?: LayoutPropertyEvidence;
  flexBasis?: LayoutPropertyEvidence;
  alignSelf?: LayoutPropertyEvidence;
  order?: LayoutPropertyEvidence;
  gridTemplateColumns?: LayoutPropertyEvidence;
  gridTemplateRows?: LayoutPropertyEvidence;
  gridAutoFlow?: LayoutPropertyEvidence;
  gridColumnStart?: LayoutPropertyEvidence;
  gridColumnEnd?: LayoutPropertyEvidence;
  gridRowStart?: LayoutPropertyEvidence;
  gridRowEnd?: LayoutPropertyEvidence;
  left?: LayoutPropertyEvidence;
  right?: LayoutPropertyEvidence;
  top?: LayoutPropertyEvidence;
  bottom?: LayoutPropertyEvidence;
}

export interface LayoutResponsiveSizingHint {
  width?: {
    mode: WtfSizingMode;
    confidence: number;
    reasons: string[];
    sourceRefs?: string[];
  };
  height?: {
    mode: WtfSizingMode;
    confidence: number;
    reasons: string[];
    sourceRefs?: string[];
  };
}

export interface LayoutNodeObservation {
  sourceNodeId: string;
  stableNodeId?: string;
  parentSourceNodeId?: string;
  childSourceNodeIds: string[];
  kind: "document" | "element" | "text" | "pseudo" | "shadow-root" | "iframe" | "slot" | "comment";
  bounds?: Rect;
  parentBounds?: Rect;
  style: LayoutStyleEvidence;
  responsiveSizing?: LayoutResponsiveSizingHint;
}

export type BaseLayoutDiagnosticCode =
  | "LAYOUT_NODE_INVALID"
  | "LAYOUT_DISPLAY_UNKNOWN"
  | "LAYOUT_GEOMETRY_MISSING"
  | "LAYOUT_LENGTH_UNRESOLVED"
  | "LAYOUT_FLEX_EVIDENCE_INCOMPLETE"
  | "LAYOUT_GRID_EVIDENCE_INCOMPLETE"
  | "LAYOUT_TABLE_DEFERRED"
  | "LAYOUT_SIZING_CONFLICT";

export interface BaseLayoutDiagnostic {
  code: BaseLayoutDiagnosticCode;
  message: string;
  sourceNodeId?: string;
  property?: string;
}

export interface BaseLayoutNodeAnalysis {
  sourceNodeId: string;
  stableNodeId?: string;
  layout: WtfLayoutModel;
  diagnostics: BaseLayoutDiagnostic[];
}

export interface BaseLayoutAnalysisInput {
  nodes: LayoutNodeObservation[];
}

export interface BaseLayoutAnalysis {
  version: BaseLayoutAnalysisVersion;
  nodes: BaseLayoutNodeAnalysis[];
  diagnostics: BaseLayoutDiagnostic[];
}

export interface BaseLayoutAnalysisSummary {
  version: BaseLayoutAnalysisVersion;
  nodeCount: number;
  flexNodeCount: number;
  gridNodeCount: number;
  absoluteNodeCount: number;
  tableNodeCount: number;
  unknownNodeCount: number;
  diagnosticCount: number;
}
