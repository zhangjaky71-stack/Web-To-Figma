import type { WtfRenderTree } from "@w2f/w2f-ir";
import type { Rect } from "@w2f/w2f-schema";

export const COMPOSITING_ANALYSIS_VERSION = "1.0.0" as const;
export type CompositingAnalysisVersion = typeof COMPOSITING_ANALYSIS_VERSION;

export type CompositingEffect =
  | "mix-blend-mode"
  | "filter"
  | "backdrop-filter"
  | "mask"
  | "opacity-group"
  | "isolation"
  | "canvas"
  | "video-frame"
  | "existing-raster"
  | "unsupported";

export type CompositingDependency =
  "self" | "sibling-backdrop" | "ancestor-backdrop" | "flattened-subtree" | "isolation-boundary";

export type CompositingDiagnosticCode =
  | "COMPOSITING_TREE_INVALID"
  | "COMPOSITING_LOCAL_FALLBACK"
  | "COMPOSITING_FALLBACK_PROMOTED"
  | "COMPOSITING_BOUNDARY_MERGED";

export interface CompositingDiagnostic {
  code: CompositingDiagnosticCode;
  message: string;
  renderNodeIds?: string[];
  sourceNodeIds?: string[];
  evidence?: string[];
}

export interface CompositingNodeDecision {
  renderNodeId: string;
  sourceNodeIds: string[];
  effects: CompositingEffect[];
  dependencies: CompositingDependency[];
  localFallbackSeed: boolean;
  fallbackBoundaryRootId?: string;
  promoted: boolean;
  confidence: number;
  reasons: string[];
  sourceRefs: string[];
}

export interface FallbackBoundary {
  id: string;
  rootRenderNodeId: string;
  memberRenderNodeIds: string[];
  triggerRenderNodeIds: string[];
  effects: CompositingEffect[];
  promoted: boolean;
  confidence: number;
  reasons: string[];
  sourceRefs: string[];
  bounds: Rect;
}

export interface CompositingAnalysisInput {
  tree: WtfRenderTree;
}

export interface CompositingAnalysisResult {
  version: CompositingAnalysisVersion;
  tree: WtfRenderTree;
  boundaries: FallbackBoundary[];
  decisions: CompositingNodeDecision[];
  diagnostics: CompositingDiagnostic[];
}

export interface CompositingAnalysisSummary {
  version: CompositingAnalysisVersion;
  renderNodeCount: number;
  fallbackBoundaryCount: number;
  fallbackMemberNodeCount: number;
  fallbackTriggerNodeCount: number;
  promotedBoundaryCount: number;
  diagnosticCount: number;
}
