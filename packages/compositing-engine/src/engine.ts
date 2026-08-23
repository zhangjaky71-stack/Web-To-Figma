import type { WtfPaintModel, WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import {
  COMPOSITING_ANALYSIS_VERSION,
  type CompositingAnalysisInput,
  type CompositingAnalysisResult,
  type CompositingAnalysisSummary,
  type CompositingDependency,
  type CompositingDiagnostic,
  type CompositingEffect,
  type CompositingNodeDecision,
  type FallbackBoundary,
} from "./types.js";

interface BoundaryCandidate {
  rootId: string;
  triggers: Set<string>;
  effects: Set<CompositingEffect>;
  reasons: Set<string>;
  sourceRefs: Set<string>;
  promoted: boolean;
  confidence: number;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function active(value: string | undefined, inactive = "none"): boolean {
  return Boolean(value && value !== inactive && value !== "normal" && value !== "auto");
}

function effectsFor(node: WtfRenderNode): CompositingEffect[] {
  const effects: CompositingEffect[] = [];
  if (active(node.paint.blendMode)) effects.push("mix-blend-mode");
  if (active(node.paint.filter)) effects.push("filter");
  if (active(node.paint.backdropFilter)) effects.push("backdrop-filter");
  if (active(node.paint.maskImage)) effects.push("mask");
  if (node.paint.opacity < 1 && node.childIds.length > 0) effects.push("opacity-group");
  if (node.paint.isolation === "isolate") effects.push("isolation");
  if (node.kind === "canvas") effects.push("canvas");
  if (node.kind === "video-frame") effects.push("video-frame");
  if (node.kind === "fallback" || node.renderStrategy === "raster") effects.push("existing-raster");
  if (node.renderStrategy === "unsupported") effects.push("unsupported");
  return uniqueSorted(effects) as CompositingEffect[];
}

function dependenciesFor(effects: readonly CompositingEffect[]): CompositingDependency[] {
  const dependencies = new Set<CompositingDependency>();
  if (
    effects.some((effect) =>
      ["canvas", "video-frame", "existing-raster", "unsupported"].includes(effect),
    )
  ) {
    dependencies.add("self");
  }
  if (effects.includes("mix-blend-mode")) dependencies.add("sibling-backdrop");
  if (effects.includes("backdrop-filter")) dependencies.add("ancestor-backdrop");
  if (effects.some((effect) => ["filter", "mask", "opacity-group"].includes(effect))) {
    dependencies.add("flattened-subtree");
  }
  if (effects.includes("isolation")) dependencies.add("isolation-boundary");
  return uniqueSorted(dependencies) as CompositingDependency[];
}

function hasOwnBackdropPaint(paint: WtfPaintModel): boolean {
  return (
    paint.fills.length > 0 ||
    Boolean(paint.border) ||
    Boolean(paint.shadows?.length) ||
    active(paint.filter) ||
    active(paint.backdropFilter) ||
    active(paint.maskImage)
  );
}

function parentMap(tree: WtfRenderTree): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of tree.nodes) {
    if (node.parentId) map.set(node.id, node.parentId);
    for (const childId of node.childIds) {
      if (!map.has(childId)) map.set(childId, node.id);
    }
  }
  return map;
}

function depthOf(id: string, parents: ReadonlyMap<string, string>): number {
  let depth = 0;
  let current = parents.get(id);
  const seen = new Set<string>([id]);
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parents.get(current);
  }
  return depth;
}

function isAncestor(
  ancestorId: string,
  descendantId: string,
  parents: ReadonlyMap<string, string>,
): boolean {
  if (ancestorId === descendantId) return true;
  let current = parents.get(descendantId);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

function descendantIds(rootId: string, byId: ReadonlyMap<string, WtfRenderNode>): string[] {
  const output: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    const children = byId.get(id)?.childIds ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push(child);
    }
  }
  return output;
}

function nearestBackdropBoundary(
  nodeId: string,
  tree: WtfRenderTree,
  byId: ReadonlyMap<string, WtfRenderNode>,
  parents: ReadonlyMap<string, string>,
): string {
  let current = parents.get(nodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) return tree.rootId;
    if (
      current === tree.rootId ||
      node.paint.isolation === "isolate" ||
      node.childIds.length > 1 ||
      hasOwnBackdropPaint(node.paint)
    ) {
      return current;
    }
    current = parents.get(current);
  }
  return parents.get(nodeId) ?? nodeId;
}

function groupEffect(effects: readonly CompositingEffect[]): CompositingEffect | undefined {
  if (effects.includes("mask")) return "mask";
  if (effects.includes("filter")) return "filter";
  if (effects.includes("opacity-group")) return "opacity-group";
  return undefined;
}

function nearestGroupOwner(
  rootId: string,
  byId: ReadonlyMap<string, WtfRenderNode>,
  parents: ReadonlyMap<string, string>,
): { id: string; effect: CompositingEffect } | undefined {
  let current = parents.get(rootId);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) return undefined;
    const effect = groupEffect(effectsFor(node));
    if (effect) return { id: current, effect };
    current = parents.get(current);
  }
  return undefined;
}

function seedEffects(effects: readonly CompositingEffect[]): CompositingEffect[] {
  return effects.filter((effect) =>
    [
      "canvas",
      "video-frame",
      "existing-raster",
      "unsupported",
      "mix-blend-mode",
      "backdrop-filter",
    ].includes(effect),
  );
}

function sourceRefsFor(node: WtfRenderNode): string[] {
  return [
    `render:${node.id}`,
    ...node.sourceNodeIds.map((id) => `source:${id}`),
    ...(node.sourceStableIds ?? []).map((id) => `stable:${id}`),
  ];
}

function candidateForTrigger(
  trigger: WtfRenderNode,
  tree: WtfRenderTree,
  byId: ReadonlyMap<string, WtfRenderNode>,
  parents: ReadonlyMap<string, string>,
): BoundaryCandidate | undefined {
  const effects = effectsFor(trigger);
  const seeds = seedEffects(effects);
  if (seeds.length === 0) return undefined;

  let rootId = trigger.id;
  let promoted = false;
  let confidence = 0.9;
  const reasons = new Set<string>();
  const allEffects = new Set<CompositingEffect>(seeds);

  if (
    seeds.some((effect) =>
      ["canvas", "video-frame", "existing-raster", "unsupported"].includes(effect),
    )
  ) {
    reasons.add("local visual requires or already declares raster fallback");
  }
  if (effects.includes("mix-blend-mode")) {
    const target = nearestBackdropBoundary(trigger.id, tree, byId, parents);
    if (target !== rootId) promoted = true;
    rootId = target;
    reasons.add("mix-blend-mode depends on sibling/ancestor backdrop pixels");
    confidence = 0.98;
  }
  if (effects.includes("backdrop-filter")) {
    const target = nearestBackdropBoundary(trigger.id, tree, byId, parents);
    if (target !== rootId) promoted = true;
    rootId = target;
    reasons.add("backdrop-filter samples pixels behind the filtered node");
    confidence = 0.99;
  }

  let changed = true;
  while (changed) {
    changed = false;
    const rootNode = byId.get(rootId);
    if (!rootNode) break;
    const rootEffects = effectsFor(rootNode);
    if (rootEffects.includes("mix-blend-mode") || rootEffects.includes("backdrop-filter")) {
      const backdropRoot = nearestBackdropBoundary(rootId, tree, byId, parents);
      if (backdropRoot !== rootId) {
        rootId = backdropRoot;
        promoted = true;
        changed = true;
        reasons.add("promoted boundary itself participates in backdrop-dependent compositing");
      }
    }
    const owner = nearestGroupOwner(rootId, byId, parents);
    if (owner && owner.id !== rootId) {
      rootId = owner.id;
      promoted = true;
      changed = true;
      allEffects.add(owner.effect);
      reasons.add(
        `${owner.effect} requires the affected subtree to be flattened as one compositing group`,
      );
      confidence = Math.max(confidence, 0.96);
    }
  }

  const root = byId.get(rootId);
  if (root?.paint.isolation === "isolate") {
    allEffects.add("isolation");
    reasons.add("isolation:isolate contains backdrop dependency within this compositing subtree");
  }

  return {
    rootId,
    triggers: new Set([trigger.id]),
    effects: allEffects,
    reasons,
    sourceRefs: new Set(sourceRefsFor(trigger)),
    promoted,
    confidence,
  };
}

function mergeCandidates(
  candidates: readonly BoundaryCandidate[],
  parents: ReadonlyMap<string, string>,
): BoundaryCandidate[] {
  const roots = uniqueSorted(candidates.map((candidate) => candidate.rootId));
  const outerRootFor = (rootId: string): string => {
    const ancestors = roots.filter((candidateRoot) => isAncestor(candidateRoot, rootId, parents));
    return (
      ancestors.sort(
        (a, b) => depthOf(a, parents) - depthOf(b, parents) || a.localeCompare(b),
      )[0] ?? rootId
    );
  };
  const merged = new Map<string, BoundaryCandidate>();
  for (const candidate of candidates) {
    const rootId = outerRootFor(candidate.rootId);
    const target = merged.get(rootId) ?? {
      rootId,
      triggers: new Set<string>(),
      effects: new Set<CompositingEffect>(),
      reasons: new Set<string>(),
      sourceRefs: new Set<string>(),
      promoted: false,
      confidence: 0,
    };
    for (const id of candidate.triggers) target.triggers.add(id);
    for (const effect of candidate.effects) target.effects.add(effect);
    for (const reason of candidate.reasons) target.reasons.add(reason);
    for (const ref of candidate.sourceRefs) target.sourceRefs.add(ref);
    target.promoted ||= candidate.promoted || rootId !== candidate.rootId;
    target.confidence = Math.max(target.confidence, candidate.confidence);
    merged.set(rootId, target);
  }
  return [...merged.values()].sort(
    (a, b) =>
      depthOf(a.rootId, parents) - depthOf(b.rootId, parents) || a.rootId.localeCompare(b.rootId),
  );
}

function boundaryFromCandidate(
  candidate: BoundaryCandidate,
  byId: ReadonlyMap<string, WtfRenderNode>,
): FallbackBoundary {
  const root = byId.get(candidate.rootId);
  if (!root) throw new Error(`fallback boundary root is missing: ${candidate.rootId}`);
  return {
    id: `fb_${candidate.rootId}`,
    rootRenderNodeId: candidate.rootId,
    memberRenderNodeIds: descendantIds(candidate.rootId, byId),
    triggerRenderNodeIds: uniqueSorted(candidate.triggers),
    effects: uniqueSorted(candidate.effects) as CompositingEffect[],
    promoted: candidate.promoted || !candidate.triggers.has(candidate.rootId),
    confidence: Math.min(1, Math.max(0, candidate.confidence)),
    reasons: uniqueSorted(candidate.reasons),
    sourceRefs: uniqueSorted(candidate.sourceRefs),
    bounds: root.geometry.bounds,
  };
}

function updateTree(tree: WtfRenderTree, boundaries: readonly FallbackBoundary[]): WtfRenderTree {
  const byBoundaryRoot = new Map(
    boundaries.map((boundary) => [boundary.rootRenderNodeId, boundary]),
  );
  return {
    rootId: tree.rootId,
    sections: tree.sections.map((section) => ({
      ...section,
      childSectionIds: [...section.childSectionIds],
    })),
    nodes: tree.nodes.map((node) => {
      const boundary = byBoundaryRoot.get(node.id);
      if (!boundary)
        return { ...node, childIds: [...node.childIds], sourceNodeIds: [...node.sourceNodeIds] };
      return {
        ...node,
        childIds: [...node.childIds],
        sourceNodeIds: [...node.sourceNodeIds],
        renderStrategy: "raster" as const,
        renderDecision: {
          confidence: boundary.confidence,
          reasons: uniqueSorted([
            ...node.renderDecision.reasons,
            ...boundary.reasons,
            "NODE-20 minimal safe fallback boundary",
          ]),
          sourceRefs: uniqueSorted([
            ...(node.renderDecision.sourceRefs ?? []),
            ...boundary.sourceRefs,
            `fallback-boundary:${boundary.id}`,
          ]),
        },
      };
    }),
  };
}

export function analyzeCompositing(input: CompositingAnalysisInput): CompositingAnalysisResult {
  const tree = input.tree;
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  if (!byId.has(tree.rootId))
    throw new TypeError("Compositing Engine requires a valid Render Tree root");
  const parents = parentMap(tree);
  const diagnostics: CompositingDiagnostic[] = [];
  const candidates = tree.nodes.flatMap((node) => {
    const candidate = candidateForTrigger(node, tree, byId, parents);
    return candidate ? [candidate] : [];
  });
  const merged = mergeCandidates(candidates, parents);
  const boundaries = merged.map((candidate) => boundaryFromCandidate(candidate, byId));

  for (const boundary of boundaries) {
    diagnostics.push({
      code: boundary.promoted ? "COMPOSITING_FALLBACK_PROMOTED" : "COMPOSITING_LOCAL_FALLBACK",
      message: boundary.promoted
        ? "Fallback was promoted to the smallest captured compositing subtree that contains required pixel dependencies."
        : "Fallback remains local because no cross-node compositing dependency requires promotion.",
      renderNodeIds: [boundary.rootRenderNodeId, ...boundary.triggerRenderNodeIds],
      evidence: boundary.reasons,
    });
  }
  if (merged.length < candidates.length) {
    diagnostics.push({
      code: "COMPOSITING_BOUNDARY_MERGED",
      message:
        "Nested or overlapping fallback candidates were merged under their outer safe boundary.",
      renderNodeIds: boundaries.map((boundary) => boundary.rootRenderNodeId),
    });
  }

  const memberBoundary = new Map<string, FallbackBoundary>();
  for (const boundary of boundaries) {
    for (const id of boundary.memberRenderNodeIds) memberBoundary.set(id, boundary);
  }
  const decisions: CompositingNodeDecision[] = tree.nodes.map((node) => {
    const effects = effectsFor(node);
    const boundary = memberBoundary.get(node.id);
    const isTrigger = boundary?.triggerRenderNodeIds.includes(node.id) ?? false;
    return {
      renderNodeId: node.id,
      sourceNodeIds: [...node.sourceNodeIds],
      effects,
      dependencies: dependenciesFor(effects),
      localFallbackSeed: seedEffects(effects).length > 0,
      ...(boundary ? { fallbackBoundaryRootId: boundary.rootRenderNodeId } : {}),
      promoted: Boolean(boundary?.promoted && isTrigger),
      confidence: boundary?.confidence ?? 1,
      reasons: boundary && isTrigger ? [...boundary.reasons] : [],
      sourceRefs: sourceRefsFor(node),
    };
  });

  return {
    version: COMPOSITING_ANALYSIS_VERSION,
    tree: updateTree(tree, boundaries),
    boundaries,
    decisions,
    diagnostics,
  };
}

export function summarizeCompositingAnalysis(
  result: CompositingAnalysisResult,
): CompositingAnalysisSummary {
  const members = new Set(result.boundaries.flatMap((boundary) => boundary.memberRenderNodeIds));
  const triggers = new Set(result.boundaries.flatMap((boundary) => boundary.triggerRenderNodeIds));
  return {
    version: result.version,
    renderNodeCount: result.tree.nodes.length,
    fallbackBoundaryCount: result.boundaries.length,
    fallbackMemberNodeCount: members.size,
    fallbackTriggerNodeCount: triggers.size,
    promotedBoundaryCount: result.boundaries.filter((boundary) => boundary.promoted).length,
    diagnosticCount: result.diagnostics.length,
  };
}
