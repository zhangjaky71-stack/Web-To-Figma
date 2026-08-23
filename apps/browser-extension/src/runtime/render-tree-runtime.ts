import {
  optimizeRenderTree,
  type RenderTreeOptimizationResult,
} from "@w2f/render-tree-optimizer";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readBaseLayoutAnalysis } from "./layout-analysis-store.js";
import { readRawSnapshot } from "./snapshot-store.js";
import { readTableLayoutResult } from "./table-layout-store.js";

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
  return optimizeRenderTree({ snapshot, cascade, layout, tables });
}
