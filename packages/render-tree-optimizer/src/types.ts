import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { BaseLayoutAnalysis } from "@w2f/layout-analyzer";
import type { TableLayoutResult } from "@w2f/table-layout-engine";
import type { WtfRenderTree } from "@w2f/w2f-ir";

export const RENDER_TREE_OPTIMIZER_VERSION = "1.0.0" as const;

export type RenderTreeOptimizerVersion = typeof RENDER_TREE_OPTIMIZER_VERSION;

export interface RenderTreeOptimizerInput {
  snapshot: RawSnapshot;
  cascade: CssCascadeCapture;
  layout: BaseLayoutAnalysis;
  tables: TableLayoutResult;
}

export type RenderTreeDiagnosticCode =
  | "RENDER_TREE_GEOMETRY_MISSING"
  | "RENDER_TREE_LAYOUT_MISSING"
  | "RENDER_TREE_PARENT_MISSING"
  | "RENDER_TREE_PARENT_CYCLE"
  | "RENDER_TREE_ROOT_REPAIRED"
  | "RENDER_TREE_WRAPPER_PRESERVED"
  | "RENDER_TREE_STABLE_IDENTITY_LOW_CONFIDENCE"
  | "RENDER_TREE_DECORATION_NOT_COMBINED";

export interface RenderTreeDiagnostic {
  code: RenderTreeDiagnosticCode;
  message: string;
  sourceNodeId?: string;
  relatedSourceNodeIds?: string[];
}

export interface RenderTreeOptimizationResult {
  version: RenderTreeOptimizerVersion;
  tree: WtfRenderTree;
  diagnostics: RenderTreeDiagnostic[];
  sourceToRenderNodeId: Record<string, string>;
}

export interface RenderTreeOptimizationSummary {
  version: RenderTreeOptimizerVersion;
  sourceNodeCount: number;
  renderNodeCount: number;
  foldedSourceNodeCount: number;
  sectionCount: number;
  componentCandidateCount: number;
  componentCandidateGroupCount: number;
  diagnosticCount: number;
}
