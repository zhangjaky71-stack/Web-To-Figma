import type { WtfSourceNode } from "@w2f/w2f-ir";
import type {
  ApplyIdentityResult,
  StableIdentityAssignment,
  StableMappedNode,
  StableNodeMapping,
  StableSourceMappingResult,
} from "./types.js";

function clampConfidence(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

function groupByStableId(nodes: readonly StableMappedNode[]): Map<string, StableMappedNode[]> {
  const groups = new Map<string, StableMappedNode[]>();
  for (const node of nodes) {
    const id = node.stableIdentity.id.trim();
    if (!id) throw new TypeError("stableIdentity.id must be non-empty");
    if (!node.captureNodeId.trim()) throw new TypeError("captureNodeId must be non-empty");
    const group = groups.get(id) ?? [];
    group.push(node);
    groups.set(id, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.captureNodeId.localeCompare(right.captureNodeId));
  }
  return groups;
}

function mappingConfidence(
  previous: readonly StableMappedNode[],
  current: readonly StableMappedNode[],
  ambiguous: boolean,
): number {
  const values = [...previous, ...current].map((node) => node.stableIdentity.confidence);
  if (values.length === 0) return 0;
  const base = Math.min(...values);
  return clampConfidence(ambiguous ? base * 0.6 : base);
}

export function mapStableNodesAcrossCaptures(
  previousNodes: readonly StableMappedNode[],
  currentNodes: readonly StableMappedNode[],
): StableSourceMappingResult {
  const previous = groupByStableId(previousNodes);
  const current = groupByStableId(currentNodes);
  const stableIds = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const mappings: StableNodeMapping[] = [];

  for (const stableNodeId of stableIds) {
    const before = previous.get(stableNodeId) ?? [];
    const after = current.get(stableNodeId) ?? [];
    const ambiguous = before.length > 1 || after.length > 1;
    const status: StableNodeMapping["status"] = ambiguous
      ? "ambiguous"
      : before.length === 1 && after.length === 1
        ? "matched"
        : before.length === 0
          ? "added"
          : "removed";

    mappings.push({
      stableNodeId,
      status,
      previousCaptureNodeIds: before.map((node) => node.captureNodeId),
      currentCaptureNodeIds: after.map((node) => node.captureNodeId),
      confidence: mappingConfidence(before, after, ambiguous),
    });
  }

  return {
    mappings,
    matched: mappings.filter((mapping) => mapping.status === "matched").length,
    added: mappings.filter((mapping) => mapping.status === "added").length,
    removed: mappings.filter((mapping) => mapping.status === "removed").length,
    ambiguous: mappings.filter((mapping) => mapping.status === "ambiguous").length,
  };
}

export function applyStableIdentityAssignments(
  nodes: readonly WtfSourceNode[],
  assignments: readonly StableIdentityAssignment[],
): ApplyIdentityResult {
  const assignmentByCaptureId = new Map<string, StableIdentityAssignment>();
  for (const assignment of assignments) {
    if (assignmentByCaptureId.has(assignment.captureNodeId)) {
      throw new TypeError(`duplicate assignment for captureNodeId: ${assignment.captureNodeId}`);
    }
    assignmentByCaptureId.set(assignment.captureNodeId, assignment);
  }

  const consumed = new Set<string>();
  const unmappedCaptureNodeIds: string[] = [];
  const updated = nodes.map((node) => {
    const assignment = assignmentByCaptureId.get(node.captureNodeId);
    if (!assignment) {
      unmappedCaptureNodeIds.push(node.captureNodeId);
      return { ...node };
    }
    consumed.add(node.captureNodeId);
    return { ...node, stableIdentity: { ...assignment.identity } };
  });

  return {
    nodes: updated,
    unmappedCaptureNodeIds: unmappedCaptureNodeIds.sort(),
    unusedAssignments: [...assignmentByCaptureId.keys()]
      .filter((captureNodeId) => !consumed.has(captureNodeId))
      .sort(),
  };
}

export function toStableMappedNodes(nodes: readonly WtfSourceNode[]): StableMappedNode[] {
  return nodes
    .filter(
      (
        node,
      ): node is WtfSourceNode & { stableIdentity: NonNullable<WtfSourceNode["stableIdentity"]> } =>
        Boolean(node.stableIdentity),
    )
    .map((node) => ({
      captureNodeId: node.captureNodeId,
      stableIdentity: node.stableIdentity,
    }));
}
