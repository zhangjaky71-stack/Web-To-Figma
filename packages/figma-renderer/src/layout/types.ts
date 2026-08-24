import type { WtfRenderNode } from "@w2f/w2f-ir";

export type W2fFigmaAutoLayoutMode = "HORIZONTAL" | "VERTICAL";
export type W2fFigmaLayoutWrap = "NO_WRAP" | "WRAP";
export type W2fFigmaPrimaryAlign = "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
export type W2fFigmaCounterAlign = "MIN" | "MAX" | "CENTER" | "BASELINE";
export type W2fFigmaSizingMode = "FIXED" | "HUG" | "FILL";
export type W2fFigmaGridTrackType = "FIXED" | "FLEX";
export type W2fFigmaGridItemsPositioning = "MANUAL" | "ROW_AUTO_FLOW";

export interface W2fAutoLayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface W2fAutoLayoutContainerPlan {
  renderNodeId: string;
  mode: W2fFigmaAutoLayoutMode;
  wrap: W2fFigmaLayoutWrap;
  reverseChildren: boolean;
  primaryAlign: W2fFigmaPrimaryAlign;
  counterAlign: W2fFigmaCounterAlign;
  counterAlignStretch: boolean;
  itemSpacing: number;
  counterAxisSpacing?: number;
  padding: W2fAutoLayoutPadding;
  horizontalSizing: Exclude<W2fFigmaSizingMode, "FILL">;
  verticalSizing: Exclude<W2fFigmaSizingMode, "FILL">;
  strokesIncludedInLayout: true;
  nativeCompatible: boolean;
  reasons: readonly string[];
}

export interface W2fAutoLayoutChildPlan {
  renderNodeId: string;
  horizontalSizing: W2fFigmaSizingMode;
  verticalSizing: W2fFigmaSizingMode;
  layoutGrow: 0 | 1;
  counterAxisStretch: boolean;
  absolutePositioned: boolean;
  order: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface W2fAutoLayoutPlan {
  container: W2fAutoLayoutContainerPlan;
  children: readonly W2fAutoLayoutChildPlan[];
}

export interface W2fAutoLayoutPlannerInput {
  container: WtfRenderNode;
  children: readonly WtfRenderNode[];
}

export interface W2fGridTrackPlan {
  type: W2fFigmaGridTrackType;
  value: number;
  authored: string;
}

export interface W2fGridChildPlan {
  renderNodeId: string;
  rowIndex?: number;
  columnIndex?: number;
  rowSpan: number;
  columnSpan: number;
}

export interface W2fGridContainerPlan {
  renderNodeId: string;
  rows: readonly W2fGridTrackPlan[];
  columns: readonly W2fGridTrackPlan[];
  rowGap: number;
  columnGap: number;
  itemsPositioning: W2fFigmaGridItemsPositioning;
  nativeCompatible: boolean;
  reasons: readonly string[];
}

export interface W2fGridLayoutPlan {
  container: W2fGridContainerPlan;
  children: readonly W2fGridChildPlan[];
}

export interface W2fGridLayoutPlannerInput {
  container: WtfRenderNode;
  children: readonly WtfRenderNode[];
}
