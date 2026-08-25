import type { WtfAssetRecord, WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";
import type { W2fDeterminismRunInput } from "./node30-types.js";

export interface W2fDeterminismIrInput {
  runId: string;
  environmentFingerprint: string;
  assets: readonly WtfAssetRecord[];
  sourceGraph: WtfSourceGraph;
  renderTree: WtfRenderTree;
  expectedStableCaptureNodeIds?: readonly string[];
}

export function createDeterminismRunFromIr(input: W2fDeterminismIrInput): W2fDeterminismRunInput {
  if (!input.environmentFingerprint.trim()) {
    throw new Error("NODE-30 determinism requires environmentFingerprint");
  }
  const missingAssetHashes = input.assets.filter((asset) => !asset.sha256).map((asset) => asset.id);
  if (missingAssetHashes.length > 0) {
    throw new Error(`NODE-30 determinism requires asset hashes: ${missingAssetHashes.join(", ")}`);
  }

  const stableByCaptureId = new Map(
    input.sourceGraph.nodes
      .filter((node) => node.stableIdentity)
      .map((node) => [node.captureNodeId, node.stableIdentity!.id]),
  );
  for (const captureNodeId of input.expectedStableCaptureNodeIds ?? []) {
    if (!stableByCaptureId.has(captureNodeId)) {
      throw new Error(`NODE-30 expected stable identity missing for ${captureNodeId}`);
    }
  }

  const layoutDecisions = input.renderTree.nodes.map((node) => ({
    id: node.id,
    sourceStableIds: [...(node.sourceStableIds ?? [])],
    layoutMode: node.layout.mode,
    sizing: node.layout.sizing,
    layoutDecision: node.layout.decision,
    flexContainer: node.layout.flexContainer,
    flexItem: node.layout.flexItem,
    gridContainer: node.layout.gridContainer,
    gridItem: node.layout.gridItem,
    absoluteConstraints: node.layout.absoluteConstraints,
    renderStrategy: node.renderStrategy,
    renderDecision: node.renderDecision,
  }));

  return {
    runId: input.runId,
    environmentFingerprint: input.environmentFingerprint,
    assetHashes: input.assets.map((asset) => asset.sha256!),
    sourceGraph: input.sourceGraph,
    renderTree: input.renderTree,
    stableIdentityIds: [...stableByCaptureId.values()],
    layoutDecisions,
  };
}
