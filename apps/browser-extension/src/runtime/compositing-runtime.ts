import { analyzeCompositing, type CompositingAnalysisResult } from "@w2f/compositing-engine";
import type { WtfRenderTree } from "@w2f/w2f-ir";
import { readRenderTreeOptimization } from "./render-tree-store.js";

export function analyzeCapturedCompositing(tree: WtfRenderTree): CompositingAnalysisResult {
  return analyzeCompositing({ tree });
}

export async function analyzePersistedCompositing(
  jobId: string,
): Promise<CompositingAnalysisResult> {
  const renderTree = await readRenderTreeOptimization(jobId);
  if (!renderTree) throw new Error(`Compositing Engine requires Render Tree for ${jobId}`);
  return analyzeCapturedCompositing(renderTree.tree);
}
