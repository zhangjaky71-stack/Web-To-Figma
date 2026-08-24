import {
  createAutoLayoutPlan,
  createGridLayoutPlan,
  type W2fAutoLayoutChildPlan,
  type W2fGridChildPlan,
  type W2fGridTrackPlan,
} from "@w2f/figma-renderer";
import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";

export interface W2fFigmaLayoutStats {
  autoLayoutFrameCount: number;
  skippedIncompatibleFlexCount: number;
  gridFrameCount: number;
  skippedIncompatibleGridCount: number;
  gridPlacementCount: number;
  gridPlacementFallbackCount: number;
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

type GridChildNode = SceneNode & {
  gridRowSpan: number;
  gridColumnSpan: number;
  setGridChildPosition(rowIndex: number, columnIndex: number): void;
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

function supportsGridChild(node: SceneNode): node is GridChildNode {
  return (
    "gridRowSpan" in node &&
    "gridColumnSpan" in node &&
    "setGridChildPosition" in node &&
    typeof (node as { setGridChildPosition?: unknown }).setGridChildPosition === "function"
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
        : "MIN";
  const vertical: Constraints["vertical"] =
    constraints.top && constraints.bottom
      ? "STRETCH"
      : constraints.bottom
        ? "MAX"
        : "MIN";
  node.constraints = { horizontal, vertical };
}

function applyGridTrack(target: GridTrackSize, plan: W2fGridTrackPlan): void {
  target.type = plan.type;
  target.value = Math.max(plan.type === "FLEX" ? 0.0001 : 0, plan.value);
}

function applyGridChild(
  child: SceneNode,
  childPlan: W2fGridChildPlan,
  stats: W2fFigmaLayoutStats,
): void {
  if (!supportsGridChild(child)) return;
  child.gridRowSpan = Math.max(1, childPlan.rowSpan);
  child.gridColumnSpan = Math.max(1, childPlan.columnSpan);
  if (childPlan.rowIndex === undefined || childPlan.columnIndex === undefined) return;
  try {
    child.setGridChildPosition(childPlan.rowIndex, childPlan.columnIndex);
    stats.gridPlacementCount += 1;
  } catch {
    stats.gridPlacementFallbackCount += 1;
  }
}

export function applyFigmaLayouts(
  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,
  renderTree: WtfRenderTree,
): W2fFigmaLayoutStats {
  const renderNodes = renderNodeMap(renderTree);
  const stats: W2fFigmaLayoutStats = {
    autoLayoutFrameCount: 0,
    skippedIncompatibleFlexCount: 0,
    gridFrameCount: 0,
    skippedIncompatibleGridCount: 0,
    gridPlacementCount: 0,
    gridPlacementFallbackCount: 0,
    fillAxisCount: 0,
    hugAxisCount: 0,
    absoluteChildCount: 0,
  };

  const preparedFlex: Array<{
    frame: FrameNode;
    plan: NonNullable<ReturnType<typeof createAutoLayoutPlan>>;
    absolutePositions: Map<string, { x: number; y: number }>;
  }> = [];
  const preparedGrid: Array<{
    frame: FrameNode;
    plan: NonNullable<ReturnType<typeof createGridLayoutPlan>>;
  }> = [];

  for (const renderNode of renderTree.nodes) {
    const frame = nodesByRenderNodeId.get(renderNode.id);
    if (!isFrame(frame)) continue;
    const children = directChildren(renderNode, renderNodes);
    const flexPlan = createAutoLayoutPlan({ container: renderNode, children });
    if (flexPlan) {
      if (!flexPlan.container.nativeCompatible) {
        stats.skippedIncompatibleFlexCount += 1;
        continue;
      }

      const absolutePositions = new Map<string, { x: number; y: number }>();
      for (const childPlan of flexPlan.children) {
        if (!childPlan.absolutePositioned) continue;
        const child = nodesByRenderNodeId.get(childPlan.renderNodeId);
        if (child?.parent === frame) {
          absolutePositions.set(childPlan.renderNodeId, { x: child.x, y: child.y });
        }
      }

      const orderedIds = flexPlan.children.map((child) => child.renderNodeId);
      if (flexPlan.container.reverseChildren) orderedIds.reverse();
      reorderChildren(frame, orderedIds, nodesByRenderNodeId);

      const originalWidth = frame.width;
      const originalHeight = frame.height;
      frame.layoutMode = flexPlan.container.mode;
      if (frame.layoutMode === "HORIZONTAL") frame.layoutWrap = flexPlan.container.wrap;
      frame.primaryAxisAlignItems = flexPlan.container.primaryAlign;
      frame.counterAxisAlignItems = flexPlan.container.counterAlign;
      frame.paddingTop = flexPlan.container.padding.top;
      frame.paddingRight = flexPlan.container.padding.right;
      frame.paddingBottom = flexPlan.container.padding.bottom;
      frame.paddingLeft = flexPlan.container.padding.left;
      frame.itemSpacing = flexPlan.container.itemSpacing;
      if (frame.layoutMode === "HORIZONTAL" && flexPlan.container.wrap === "WRAP") {
        frame.counterAxisSpacing =
          flexPlan.container.counterAxisSpacing ?? flexPlan.container.itemSpacing;
      }
      frame.strokesIncludedInLayout = flexPlan.container.strokesIncludedInLayout;
      frame.resize(Math.max(0.01, originalWidth), Math.max(0.01, originalHeight));
      frame.layoutSizingHorizontal = flexPlan.container.horizontalSizing;
      frame.layoutSizingVertical = flexPlan.container.verticalSizing;
      stats.autoLayoutFrameCount += 1;
      preparedFlex.push({ frame, plan: flexPlan, absolutePositions });
      continue;
    }

    const gridPlan = createGridLayoutPlan({ container: renderNode, children });
    if (!gridPlan) continue;
    if (!gridPlan.container.nativeCompatible) {
      stats.skippedIncompatibleGridCount += 1;
      continue;
    }

    const originalWidth = frame.width;
    const originalHeight = frame.height;
    frame.layoutMode = "GRID";
    frame.gridAutoTracks = "NONE";
    frame.gridItemsPositioning = gridPlan.container.itemsPositioning;
    frame.gridColumnCount = Math.max(1, gridPlan.container.columns.length);
    frame.gridRowCount = Math.max(1, gridPlan.container.rows.length);
    frame.gridColumnGap = gridPlan.container.columnGap;
    frame.gridRowGap = gridPlan.container.rowGap;
    gridPlan.container.columns.forEach((track, index) => {
      const target = frame.gridColumnSizes[index];
      if (target) applyGridTrack(target, track);
    });
    gridPlan.container.rows.forEach((track, index) => {
      const target = frame.gridRowSizes[index];
      if (target) applyGridTrack(target, track);
    });
    frame.resize(Math.max(0.01, originalWidth), Math.max(0.01, originalHeight));
    stats.gridFrameCount += 1;
    preparedGrid.push({ frame, plan: gridPlan });
  }

  for (const { frame, plan, absolutePositions } of preparedFlex) {
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

  for (const { frame, plan } of preparedGrid) {
    for (const childPlan of plan.children) {
      const child = nodesByRenderNodeId.get(childPlan.renderNodeId);
      if (!child || child.parent !== frame) continue;
      applyGridChild(child, childPlan, stats);
    }
  }

  return stats;
}
