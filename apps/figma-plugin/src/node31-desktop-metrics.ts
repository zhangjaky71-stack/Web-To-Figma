import type { WtfAssetRecord, WtfRenderTree } from "@w2f/w2f-ir";

export interface W2fNode31ObservedGeometryNode {
  renderNodeId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface W2fNode31ObservedTextNode {
  renderNodeId: string;
  characters: string;
  matchedFontRunCount: number;
  fontRunCount: number;
}

export interface W2fNode31ResponsiveObservation {
  stateId: string;
  expectedFingerprint: string;
  observedFingerprint: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function relativeBounds(
  bounds: W2fNode31ObservedGeometryNode["bounds"],
  root: W2fNode31ObservedGeometryNode["bounds"],
) {
  return {
    x: bounds.x - root.x,
    y: bounds.y - root.y,
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height),
  };
}

function intersectionOverUnion(
  expected: W2fNode31ObservedGeometryNode["bounds"],
  observed: W2fNode31ObservedGeometryNode["bounds"],
): number {
  const left = Math.max(expected.x, observed.x);
  const top = Math.max(expected.y, observed.y);
  const right = Math.min(expected.x + expected.width, observed.x + observed.width);
  const bottom = Math.min(expected.y + expected.height, observed.y + observed.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const expectedArea = Math.max(0, expected.width) * Math.max(0, expected.height);
  const observedArea = Math.max(0, observed.width) * Math.max(0, observed.height);
  const union = expectedArea + observedArea - intersection;
  if (union <= 0) {
    return expected.x === observed.x && expected.y === observed.y ? 1 : 0;
  }
  return clamp01(intersection / union);
}

/**
 * Mean root-relative IoU across native-compatible render nodes. Missing mapped
 * nodes score zero; page placement on the Figma canvas is intentionally ignored.
 */
export function measureNode31GeometryFidelity(
  renderTree: WtfRenderTree,
  observedNodes: readonly W2fNode31ObservedGeometryNode[],
): number {
  const expectedRoot = renderTree.nodes.find((node) => node.id === renderTree.rootId);
  const observedById = new Map(observedNodes.map((node) => [node.renderNodeId, node]));
  const observedRoot = observedById.get(renderTree.rootId);
  if (!expectedRoot || !observedRoot) return 0;

  const expectedCandidates = renderTree.nodes.filter(
    (node) => node.renderStrategy !== "raster" && node.renderStrategy !== "unsupported",
  );
  if (expectedCandidates.length === 0) return 1;

  const expectedRootBounds = expectedRoot.geometry.bounds;
  let total = 0;
  for (const node of expectedCandidates) {
    const observed = observedById.get(node.id);
    if (!observed) continue;
    total += intersectionOverUnion(
      relativeBounds(node.geometry.bounds, expectedRootBounds),
      relativeBounds(observed.bounds, observedRoot.bounds),
    );
  }
  return clamp01(total / expectedCandidates.length);
}

function positionalCharacterAccuracy(expected: string, observed: string): number {
  const denominator = Math.max(expected.length, observed.length);
  if (denominator === 0) return 1;
  let matches = 0;
  const comparable = Math.min(expected.length, observed.length);
  for (let index = 0; index < comparable; index += 1) {
    if (expected[index] === observed[index]) matches += 1;
  }
  return clamp01(matches / denominator);
}

/**
 * Text fidelity is character preservation weighted 80% plus exact supported-font
 * run preservation weighted 20%. Missing text nodes and missing font-run evidence
 * score zero instead of being silently excluded.
 */
export function measureNode31TextFidelity(
  renderTree: WtfRenderTree,
  observedNodes: readonly W2fNode31ObservedTextNode[],
): number {
  const expected = renderTree.nodes.filter(
    (node) => node.text && node.renderStrategy !== "raster" && node.renderStrategy !== "unsupported",
  );
  if (expected.length === 0) return 1;
  const observedById = new Map(observedNodes.map((node) => [node.renderNodeId, node]));

  let weighted = 0;
  let weightTotal = 0;
  for (const node of expected) {
    const sourceText = node.text?.value ?? "";
    const sourceRuns = node.text?.runs.length ?? 0;
    const weight = Math.max(1, sourceText.length);
    weightTotal += weight;
    const observed = observedById.get(node.id);
    if (!observed) continue;
    const characterScore = positionalCharacterAccuracy(sourceText, observed.characters);
    const expectedRunCount = Math.max(0, sourceRuns);
    const observedRunCount = Math.max(0, observed.fontRunCount);
    const denominator = Math.max(expectedRunCount, observedRunCount);
    const fontScore =
      denominator === 0
        ? 1
        : clamp01(Math.max(0, observed.matchedFontRunCount) / Math.max(1, denominator));
    weighted += (characterScore * 0.8 + fontScore * 0.2) * weight;
  }
  return weightTotal > 0 ? clamp01(weighted / weightTotal) : 1;
}

const VISUAL_ASSET_KINDS = new Set<WtfAssetRecord["kind"]>([
  "image",
  "svg",
  "canvas-raster",
  "video-frame",
  "fallback-raster",
]);

function expectedVisualAssetIds(
  renderTree: WtfRenderTree,
  assets: readonly WtfAssetRecord[],
): Set<string> {
  const visualAssetIds = new Set(
    assets.filter((asset) => VISUAL_ASSET_KINDS.has(asset.kind)).map((asset) => asset.id),
  );
  const ids = new Set<string>();
  for (const node of renderTree.nodes) {
    if (node.renderStrategy === "unsupported") continue;
    for (const id of node.assetRefs ?? []) {
      if (visualAssetIds.has(id)) ids.add(id);
    }
    for (const fill of node.paint.fills) {
      if (fill.type === "image" && visualAssetIds.has(fill.assetId)) ids.add(fill.assetId);
    }
  }
  return ids;
}

/**
 * Asset fidelity is hash-presence over visual assets actually referenced by the
 * render tree. Font metadata and Pixel Ground Truth reference images are excluded
 * because they have dedicated text/visual metrics and must not inflate the asset score.
 */
export function measureNode31AssetFidelity(
  renderTree: WtfRenderTree,
  assets: readonly WtfAssetRecord[],
  appliedAssetIds: ReadonlySet<string>,
): number {
  const expected = expectedVisualAssetIds(renderTree, assets);
  if (expected.size === 0) return 1;
  let present = 0;
  for (const id of expected) {
    if (appliedAssetIds.has(id)) present += 1;
  }
  return clamp01(present / expected.size);
}

/**
 * Responsive fidelity uses exact state fingerprints generated by independent
 * Desktop renders. No inferred or simulator-only state is accepted by this helper.
 */
export function measureNode31ResponsiveFidelity(
  observations: readonly W2fNode31ResponsiveObservation[],
): number {
  if (observations.length === 0) return 0;
  const uniqueStateIds = new Set<string>();
  let matches = 0;
  for (const observation of observations) {
    if (!observation.stateId || uniqueStateIds.has(observation.stateId)) continue;
    uniqueStateIds.add(observation.stateId);
    if (
      observation.expectedFingerprint.length > 0 &&
      observation.expectedFingerprint === observation.observedFingerprint
    ) {
      matches += 1;
    }
  }
  return uniqueStateIds.size > 0 ? clamp01(matches / uniqueStateIds.size) : 0;
}
