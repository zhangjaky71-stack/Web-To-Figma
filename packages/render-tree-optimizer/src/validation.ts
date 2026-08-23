import { RENDER_TREE_OPTIMIZER_VERSION, type RenderTreeOptimizationResult } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRenderTreeOptimizationResult(
  value: unknown,
): value is RenderTreeOptimizationResult {
  if (
    !isRecord(value) ||
    value.version !== RENDER_TREE_OPTIMIZER_VERSION ||
    !isRecord(value.tree) ||
    typeof value.tree.rootId !== "string" ||
    !Array.isArray(value.tree.nodes) ||
    !Array.isArray(value.tree.sections) ||
    !Array.isArray(value.diagnostics) ||
    !isRecord(value.sourceToRenderNodeId)
  ) {
    return false;
  }
  const nodeIds = new Set<string>();
  for (const node of value.tree.nodes) {
    if (
      !isRecord(node) ||
      typeof node.id !== "string" ||
      !Array.isArray(node.childIds) ||
      !Array.isArray(node.sourceNodeIds) ||
      node.sourceNodeIds.length === 0 ||
      typeof node.kind !== "string" ||
      typeof node.name !== "string" ||
      !isRecord(node.geometry) ||
      !isRecord(node.layout) ||
      !isRecord(node.paint) ||
      typeof node.renderStrategy !== "string" ||
      !isRecord(node.renderDecision)
    ) {
      return false;
    }
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }
  if (!nodeIds.has(value.tree.rootId)) return false;
  for (const node of value.tree.nodes) {
    if (!isRecord(node)) return false;
    if (
      node.parentId !== undefined &&
      (typeof node.parentId !== "string" || !nodeIds.has(node.parentId))
    ) {
      return false;
    }
    if (
      !Array.isArray(node.childIds) ||
      !node.childIds.every((id) => typeof id === "string" && nodeIds.has(id))
    ) {
      return false;
    }
  }
  return Object.values(value.sourceToRenderNodeId).every(
    (renderNodeId) => typeof renderNodeId === "string" && nodeIds.has(renderNodeId),
  );
}
