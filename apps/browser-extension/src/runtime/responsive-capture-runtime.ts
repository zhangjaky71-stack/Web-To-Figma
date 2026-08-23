import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type {
  ResponsiveStableNodeEvidence,
  ResponsiveViewportContext,
  ResponsiveViewportPlan,
} from "@w2f/responsive-capture";
import {
  assignStableIdentities,
  createDocumentIdentity,
  type StableAncestrySegment,
  type StableIdentityNodeInput,
} from "@w2f/stable-identity";

function sourceTypeForUrl(url: string): "http" | "file" | "unknown" {
  if (/^https?:/i.test(url)) return "http";
  if (/^file:/i.test(url)) return "file";
  return "unknown";
}

function sourceOrigin(url: string): string | undefined {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

function nodeTagName(node: RawNode): string {
  return node.source.tagName?.trim().toLowerCase() || `#${node.kind}`;
}

function dataAttributes(node: RawNode): Record<string, string> | undefined {
  const attributes = Object.entries(node.source.attributes ?? {})
    .filter(([name]) => name.toLowerCase().startsWith("data-"))
    .sort(([left], [right]) => left.localeCompare(right));
  return attributes.length > 0 ? Object.fromEntries(attributes) : undefined;
}

function classList(node: RawNode): string[] | undefined {
  const value = node.source.attributes?.class;
  if (!value) return undefined;
  const classes = [
    ...new Set(
      value
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
  return classes.length > 0 ? classes : undefined;
}

function ancestrySegment(node: RawNode): StableAncestrySegment {
  const data = dataAttributes(node);
  const classes = classList(node);
  return {
    tagName: nodeTagName(node),
    ...(node.source.role ? { role: node.source.role } : {}),
    ...(node.source.attributes?.id ? { idAttribute: node.source.attributes.id } : {}),
    ...(data ? { dataAttributes: data } : {}),
    ...(classes ? { classList: classes } : {}),
  };
}

function ancestryForNode(node: RawNode, nodeById: Map<string, RawNode>): StableAncestrySegment[] {
  const ancestry: StableAncestrySegment[] = [];
  const visited = new Set<string>();
  let parentId = node.relationships.sourceParentId;
  while (parentId && !visited.has(parentId) && ancestry.length < 64) {
    visited.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) break;
    ancestry.unshift(ancestrySegment(parent));
    parentId = parent.relationships.sourceParentId;
  }
  return ancestry;
}

function structuralPosition(
  node: RawNode,
  nodeById: Map<string, RawNode>,
  documentOrder: number,
): { siblingIndex: number; sameKindIndex: number; documentOrder: number } {
  const parentId = node.relationships.sourceParentId;
  const parent = parentId ? nodeById.get(parentId) : undefined;
  if (!parent) return { siblingIndex: 0, sameKindIndex: 0, documentOrder };
  const siblings = parent.childCaptureNodeIds;
  const siblingIndex = Math.max(0, siblings.indexOf(node.captureNodeId));
  const tagName = nodeTagName(node);
  let sameKindIndex = 0;
  for (let index = 0; index < siblingIndex; index += 1) {
    const siblingId = siblings[index];
    const sibling = siblingId ? nodeById.get(siblingId) : undefined;
    if (sibling && nodeTagName(sibling) === tagName) sameKindIndex += 1;
  }
  return { siblingIndex, sameKindIndex, documentOrder };
}

export async function buildResponsiveStableNodeEvidence(
  snapshot: RawSnapshot,
): Promise<ResponsiveStableNodeEvidence[]> {
  const document = await createDocumentIdentity({
    sourceType: sourceTypeForUrl(snapshot.url),
    sourceUrl: snapshot.url,
  });
  const origin = sourceOrigin(snapshot.url);
  const nodeById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const inputs: StableIdentityNodeInput[] = snapshot.nodes.map((node, documentOrder) => {
    const data = dataAttributes(node);
    const classes = classList(node);
    const ancestry = ancestryForNode(node, nodeById);
    return {
      captureNodeId: node.captureNodeId,
      documentId: document.documentId,
      ...(origin ? { sourceOrigin: origin } : {}),
      ...(node.source.namespace ? { namespace: node.source.namespace } : {}),
      tagName: nodeTagName(node),
      ...(node.source.role ? { role: node.source.role } : {}),
      ...(node.source.attributes?.id ? { idAttribute: node.source.attributes.id } : {}),
      ...(data ? { dataAttributes: data } : {}),
      ...(classes ? { classList: classes } : {}),
      ...(ancestry.length > 0 ? { ancestry } : {}),
      structuralPosition: structuralPosition(node, nodeById, documentOrder),
      ...(node.textContent ? { textContent: node.textContent } : {}),
    };
  });
  const assignments = await assignStableIdentities(inputs);
  const stableByCapture = new Map(
    assignments.map((assignment) => [assignment.captureNodeId, assignment.identity.id]),
  );
  return assignments
    .map((assignment) => {
      const node = nodeById.get(assignment.captureNodeId);
      const parentCaptureNodeId = node?.relationships.sourceParentId;
      const parentStableNodeId = parentCaptureNodeId
        ? stableByCapture.get(parentCaptureNodeId)
        : undefined;
      return {
        captureNodeId: assignment.captureNodeId,
        stableNodeId: assignment.identity.id,
        confidence: assignment.identity.confidence,
        signatureHash: assignment.signatureHash,
        ...(parentCaptureNodeId ? { sourceParentCaptureNodeId: parentCaptureNodeId } : {}),
        ...(parentStableNodeId ? { sourceParentStableNodeId: parentStableNodeId } : {}),
      };
    })
    .sort((left, right) => left.captureNodeId.localeCompare(right.captureNodeId));
}

export async function probeCurrentViewport(tabId: number): Promise<ResponsiveViewportContext> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    }),
    args: [],
  });
  const value = results[0]?.result;
  if (
    !value ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    !Number.isFinite(value.dpr) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.dpr <= 0
  ) {
    throw new Error("Unable to probe the current responsive viewport");
  }
  return { width: value.width, height: value.height, dpr: value.dpr };
}

export function assertSnapshotMatchesResponsivePlan(
  snapshot: RawSnapshot,
  plan: ResponsiveViewportPlan,
): void {
  const width = snapshot.environment.viewportWidth;
  const height = snapshot.environment.viewportHeight;
  const dpr = snapshot.environment.scale.context.devicePixelRatio;
  if (
    Math.abs(width - plan.width) > 1 ||
    Math.abs(height - plan.height) > 1 ||
    Math.abs(dpr - plan.dpr) > 0.01
  ) {
    throw new Error(
      `Responsive viewport mismatch for ${plan.id}: captured ${width}x${height}@${dpr}, planned ${plan.width}x${plan.height}@${plan.dpr}`,
    );
  }
}
