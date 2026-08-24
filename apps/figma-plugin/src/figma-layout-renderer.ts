import { createAutoLayoutPlan, type W2fAutoLayoutChildPlan } from "@w2f/figma-renderer";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";

export interface W2fFigmaLayoutStats {
  autoLayoutFrameCount: number;
  skippedIncompatibleFlexCount: number;
  fillAxisCount: number;
  hugAxisCount: number;
  absoluteChildCount: number;
}

type LayoutChildNode = SceneNode & {
  layoutPositioning: "AUTO" | "ABSOLUTE";
  layoutSizingHorizontal: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical: "FIXED" | "HUG" | "FILL";
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
};

function isFrame(node: SceneNode | undefined): node is FrameNode {
  return node?.type === "FRAME";
}

function supportsLayoutChild(node: SceneNode): node is LayoutChildNode {
  return (
    "layoutPositioning" in node &&
    "layoutSizingHorizontal" in node &&
    "layoutSizingVertical" in node &&
    "minWidth" in node &&
    "maxWidth" in node &&
    "minHeight" in node &&
    "maxHeight" in node
  );
}

function supportsHug(node: LayoutChildNode): boolean {
  return node.type === "TEXT" || (node.type === "FRAME" && node.layoutMode !== "NONE");
}

function positiveOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function applyAxisSizing(
  node: LayoutChildNode,
  axis: "horizontal" | "vertical",
  mode: W2fAutoLayoutChildPlan["horizontalSizing"],
  stats: W2fFigmaLayoutStats,
): void {
  const property = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
  if (mode === "HUG" && !supportsHug(node)) {
    node[property] = "FIXED";
    return;
  }
  node[property] = mode;
  if (mode === "FILL") stats.fillAxisCount += 1;
  if (mode === "HUG") stats.hugAxisCount += 1;
}

function renderNodeMap(renderTree: WtfRenderTree): ReadonlyMap<string, WtfRenderNode> {
  return new Map(renderTree.nodes.map((node) => [node.id, node]));
}

function directChildren(
  renderNode: WtfRenderNode,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): WtfRenderNode[] {
  return renderNode.childIds
    .map((id) => nodes.get(id))
    .filter((node): node is WtfRenderNode => Boolean(node));
}

function reorderChildren(
  frame: FrameNode,
  planIds: readonly string[],
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,
): void {
  let index = 0;
  for (const renderNodeId of planIds) {
    const child = nodesByRenderNodeId.get(renderNodeId);
    if (!child || child.parent !== frame) continue;
    frame.insertChild(index, child);
    index += 1;
  }
}

function applyAbsoluteConstraints(node: LayoutChildNode, renderNode: WtfRenderNode): void {
  const constraints = renderNode.layout.absoluteConstraints;
  if (!constraints || !("constraints" in node)) return;
  const horizontal: Constraints["horizontal"] =
    constraints.left && constraints.right
      ? "STRETCH"
      : constraints.right
        ? "MAX"
        : constraints.left
          ? "MIN"
          : "MIN";
  const vertical: Constraints["vertical"] =
    constraints.top && constraints.bottom
      ? "STRETCH"
      : constraints.bottom
        ? "MAX"
        : constraints.top
          ? "MIN"
          : "MIN";
  node.constraints = { horizontal, vertical };
}

export function applyFigmaLayouts(
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,
  renderTree: WtfRenderTree,
): W2fFigmaLayoutStats {
  const renderNodes = renderNodeMap(renderTree);
  const stats: W2fFigmaLayoutStats = {
    autoLayoutFrameCount: 0,
    skippedIncompatibleFlexCount: 0,
    fillAxisCount: 0,
    hugAxisCount: 0,
    absoluteChildCount: 0,
  };

  const prepared: Array<{
    renderNode: WtfRenderNode;
    frame: FrameNode;
    plan: NonNullable<ReturnType<typeof createAutoLayoutPlan>>;
    absolutePositions: Map<string, { x: number; y: number }>;
  }> = [];

  for (const renderNode of renderTree.nodes) {
    const frame = nodesByRenderNodeId.get(renderNode.id);
    if (!isFrame(frame)) continue;
    const plan = createAutoLayoutPlan({
      container: renderNode,
      children: directChildren(renderNode, renderNodes),
    });
    if (!plan) continue;
    if (!plan.container.nativeCompatible) {
      stats.skippedIncompatibleFlexCount += 1;
      continue;
    }

    const absolutePositions = new Map<string, { x: number; y: number }>();
    for (const childPlan of plan.children) {
      if (!childPlan.absolutePositioned) continue;
      const child = nodesByRenderNodeId.get(childPlan.renderNodeId);
      if (child?.parent === frame) absolutePositions.set(childPlan.renderNodeId, { x: child.x, y: child.y });
    }

    const orderedIds = plan.children.map((child) => child.renderNodeId);
    if (plan.container.reverseChildren) orderedIds.reverse();
    reorderChildren(frame, orderedIds, nodesByRenderNodeId);

    const originalWidth = frame.width;
    const originalHeight = frame.height;
    frame.layoutMode = plan.container.mode;
    frame.layoutWrap = plan.container.wrap;
    frame.primaryAxisAlignItems = plan.container.primaryAlign;
    frame.counterAxisAlignItems = plan.container.counterAlign;
    frame.paddingTop = plan.container.padding.top;
    frame.paddingRight = plan.container.padding.right;
    frame.paddingBottom = plan.container.padding.bottom;
    frame.paddingLeft = plan.container.padding.left;
    frame.itemSpacing = plan.container.itemSpacing;
    if (plan.container.wrap === "WRAP") {
      frame.counterAxisSpacing = plan.container.counterAxisSpacing ?? plan.container.itemSpacing;
    }
    frame.strokesIncludedInLayout = plan.container.strokesIncludedInLayout;
    frame.resize(Math.max(0.01, originalWidth), Math.max(0.01, originalHeight));
    frame.layoutSizingHorizontal = plan.container.horizontalSizing;
    frame.layoutSizingVertical = plan.container.verticalSizing;
    stats.autoLayoutFrameCount += 1;

    prepared.push({ renderNode, frame, plan, absolutePositions });
  }

  for (const { frame, plan, absolutePositions } of prepared) {
    for (const childPlan of plan.children) {
      const child = nodesByRenderNodeId.get(childPlan.renderNodeId);
      if (!child || child.parent !== frame || !supportsLayoutChild(child)) continue;
      const sourceChild = renderNodes.get(childPlan.renderNodeId);

      if (childPlan.absolutePositioned) {
        child.layoutPositioning = "ABSOLUTE";
        const position = absolutePositions.get(childPlan.renderNodeId);
        if (position) {
          child.x = position.x;
          child.y = position.y;
        }
        if (sourceChild) applyAbsoluteConstraints(child, sourceChild);
        stats.absoluteChildCount += 1;
      } else {
        child.layoutPositioning = "AUTO";
        applyAxisSizing(child, "horizontal", childPlan.horizontalSizing, stats);
        applyAxisSizing(child, "vertical", childPlan.verticalSizing, stats);
      }

      child.minWidth = positiveOrNull(childPlan.minWidth);
      child.maxWidth = positiveOrNull(childPlan.maxWidth);
      child.minHeight = positiveOrNull(childPlan.minHeight);
      child.maxHeight = positiveOrNull(childPlan.maxHeight);
    }
  }

  return stats;
}
