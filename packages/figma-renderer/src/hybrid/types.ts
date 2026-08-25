import type { WtfIrBundle, WtfRenderTree } from "@w2f/w2f-ir";

export type W2fReferenceTileDescriptor = WtfIrBundle["assets"]["referenceTiles"][number];

export interface W2fRasterTilePlan {
  tileId: string;
  path: string;
  sha256: string;
  viewportId: string;
  dpr: number;
  row: number;
  column: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
}

export interface W2fRasterBoundaryReadyPlan {
  state: "ready";
  renderNodeId: string;
  sourceNodeId: string;
  referenceId: string;
  descendantRenderNodeIds: readonly string[];
  tiles: readonly W2fRasterTilePlan[];
}

export interface W2fRasterBoundaryMissingPlan {
  state: "missing";
  renderNodeId: string;
  descendantRenderNodeIds: readonly string[];
  reason: string;
}

export type W2fRasterBoundaryPlan = W2fRasterBoundaryReadyPlan | W2fRasterBoundaryMissingPlan;

export interface W2fHybridRasterPlan {
  boundaries: readonly W2fRasterBoundaryPlan[];
  readyBoundaryCount: number;
  missingBoundaryCount: number;
  tileCount: number;
}

export interface W2fHybridRasterPlannerInput {
  renderTree: WtfRenderTree;
  referenceTiles: readonly W2fReferenceTileDescriptor[];
}
