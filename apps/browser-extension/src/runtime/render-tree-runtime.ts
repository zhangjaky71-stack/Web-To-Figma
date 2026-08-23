import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { BaseLayoutAnalysis } from "@w2f/layout-analyzer";
import { optimizeRenderTree, type RenderTreeOptimizationResult } from "@w2f/render-tree-optimizer";
import type { TableLayoutResult } from "@w2f/table-layout-engine";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readBaseLayoutAnalysis } from "./layout-analysis-store.js";
import { readRawSnapshot } from "./snapshot-store.js";
import { readTableLayoutResult } from "./table-layout-store.js";

export function optimizeCapturedRenderTree(
  snapshot: RawSnapshot,
  cascade: CssCascadeCapture,
  layout: BaseLayoutAnalysis,
  tables: TableLayoutResult,
): Promise<RenderTreeOptimizationResult> {
  return optimizeRenderTree({ snapshot, cascade, layout, tables });
}

export async function optimizePersistedRenderTree(
  jobId: string,
): Promise<RenderTreeOptimizationResult> {
  const [snapshot, cascade, layout, tables] = await Promise.all([
    readRawSnapshot(jobId),
    readCssCascadeCapture(jobId),
    readBaseLayoutAnalysis(jobId),
    readTableLayoutResult(jobId),
  ]);
  if (!snapshot) throw new Error(`Render Tree Optimizer requires RawSnapshot for ${jobId}`);
  if (!cascade) throw new Error(`Render Tree Optimizer requires CssCascadeCapture for ${jobId}`);
  if (!layout) throw new Error(`Render Tree Optimizer requires BaseLayoutAnalysis for ${jobId}`);
  if (!tables) throw new Error(`Render Tree Optimizer requires TableLayoutResult for ${jobId}`);
  return optimizeCapturedRenderTree(snapshot, cascade, layout, tables);
}
