import type {
  WtfContainerQueryInfo,
  WtfMediaRuleTrace,
  WtfResponsivePayload,
  WtfSizingMode,
} from "@w2f/w2f-ir";
import type { Rect, WtfResponsiveSnapshotRef } from "@w2f/w2f-schema";

export const RESPONSIVE_INFERENCE_VERSION = "1.0.0" as const;

export type ResponsiveInferenceVersion = typeof RESPONSIVE_INFERENCE_VERSION;
export type ResponsiveAxis = "width" | "height";

export interface ResponsiveAuthoredStyleEvidence {
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  display?: string;
  position?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
}

export interface ResponsiveNodeObservation {
  snapshotId: string;
  stableNodeId: string;
  stableConfidence: number;
  viewportWidth: number;
  viewportHeight: number;
  present: boolean;
  visible: boolean;
  bounds?: Rect;
  parentStableNodeId?: string;
  parentBounds?: Rect;
  display?: string;
  authored?: ResponsiveAuthoredStyleEvidence;
}

export interface ResponsiveBreakpointCandidate {
  lowerSnapshotId: string;
  upperSnapshotId: string;
  lowerObservedWidth: number;
  upperObservedWidth: number;
  affectedStableNodeIds: string[];
  properties: string[];
  source: "observed-transition" | "authored-media" | "authored-container";
  confidence: number;
  reasons: string[];
}

export interface ResponsiveSizingDecision {
  stableNodeId: string;
  axis: ResponsiveAxis;
  mode: WtfSizingMode;
  confidence: number;
  reasons: string[];
  snapshotIds: string[];
  source: "authored" | "geometry" | "combined" | "insufficient";
}

export type ResponsiveInferenceDiagnosticCode =
  | "RESPONSIVE_INFERENCE_INPUT_INVALID"
  | "RESPONSIVE_INFERENCE_SNAPSHOT_MISSING"
  | "RESPONSIVE_INFERENCE_VIEWPORT_MISMATCH"
  | "RESPONSIVE_INFERENCE_DUPLICATE_OBSERVATION"
  | "RESPONSIVE_INFERENCE_INSUFFICIENT_EVIDENCE"
  | "RESPONSIVE_INFERENCE_SIZING_CONFLICT"
  | "RESPONSIVE_INFERENCE_PARENT_EVIDENCE_MISSING"
  | "RESPONSIVE_INFERENCE_RULE_CONFLICT";

export interface ResponsiveInferenceDiagnostic {
  code: ResponsiveInferenceDiagnosticCode;
  message: string;
  stableNodeId?: string;
  snapshotId?: string;
  property?: string;
}

export interface ResponsiveInferenceInput {
  snapshots: WtfResponsiveSnapshotRef[];
  observations: ResponsiveNodeObservation[];
  mediaRules?: WtfMediaRuleTrace[];
  containerQueries?: WtfContainerQueryInfo[];
}

export interface ResponsiveInferenceResult {
  version: ResponsiveInferenceVersion;
  payload: WtfResponsivePayload;
  breakpointCandidates: ResponsiveBreakpointCandidate[];
  sizingDecisions: ResponsiveSizingDecision[];
  diagnostics: ResponsiveInferenceDiagnostic[];
}

export interface ResponsiveInferenceSummary {
  version: ResponsiveInferenceVersion;
  snapshotCount: number;
  ruleCount: number;
  breakpointCandidateCount: number;
  sizingDecisionCount: number;
  diagnosticCount: number;
}
