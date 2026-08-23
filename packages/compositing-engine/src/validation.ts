import { COMPOSITING_ANALYSIS_VERSION, type CompositingAnalysisResult } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCompositingAnalysisResult(value: unknown): value is CompositingAnalysisResult {
  if (!isRecord(value) || value.version !== COMPOSITING_ANALYSIS_VERSION) return false;
  if (!isRecord(value.tree) || !Array.isArray(value.tree.nodes) || !Array.isArray(value.tree.sections)) {
    return false;
  }
  if (!Array.isArray(value.boundaries) || !Array.isArray(value.decisions) || !Array.isArray(value.diagnostics)) {
    return false;
  }
  return value.boundaries.every((boundary) => {
    if (!isRecord(boundary)) return false;
    return (
      typeof boundary.id === "string" &&
      typeof boundary.rootRenderNodeId === "string" &&
      Array.isArray(boundary.memberRenderNodeIds) &&
      Array.isArray(boundary.triggerRenderNodeIds) &&
      Array.isArray(boundary.effects) &&
      typeof boundary.promoted === "boolean" &&
      typeof boundary.confidence === "number" &&
      boundary.confidence >= 0 &&
      boundary.confidence <= 1 &&
      Array.isArray(boundary.reasons) &&
      Array.isArray(boundary.sourceRefs) &&
      isRecord(boundary.bounds)
    );
  });
}
