import type { WtfRenderNode, WtfRenderTree } from "@w2f/w2f-ir";
import type { W2fImportProfile } from "./protocol.js";

export const W2F_RASTER_TEXT_POLICY_VERSION = "1.0.0" as const;

export const W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS = {
  version: "w2f.rasterTextPolicy.version",
  status: "w2f.rasterTextPolicy.status",
  profile: "w2f.rasterTextPolicy.profile",
  textNodeCount: "w2f.rasterTextPolicy.textNodeCount",
  visualJustifications: "w2f.rasterTextPolicy.visualJustifications",
  ignoredTextQualityReasons: "w2f.rasterTextPolicy.ignoredTextQualityReasons",
  reason: "w2f.rasterTextPolicy.reason",
} as const;

export type W2fRasterTextPolicyStatus =
  | "not-applicable"
  | "raster-authorized"
  | "native-preserved";

export interface W2fRasterTextPolicyDecision {
  version: typeof W2F_RASTER_TEXT_POLICY_VERSION;
  boundaryRenderNodeId: string;
  profile: W2fImportProfile;
  status: W2fRasterTextPolicyStatus;
  textRenderNodeIds: readonly string[];
  visualJustifications: readonly string[];
  ignoredTextQualityReasons: readonly string[];
  reason: string;
}

const VISUAL_JUSTIFICATION_PATTERNS: readonly RegExp[] = [
  /\bmix-blend-mode\b/i,
  /\bbackdrop-filter\b/i,
  /\bcomposit(?:ing|ion)\b/i,
  /\bflatten(?:ed|ing)\b.*\b(?:subtree|group)\b/i,
  /\b(?:mask|filter|opacity-group)\b.*\b(?:flatten|subtree|group)\b/i,
  /\b(?:canvas|webgl|video-frame)\b/i,
  /\bunsupported\s+(?:blend|visual|compositing|effect|paint)\b/i,
  /\blocal visual requires or already declares raster fallback\b/i,
];

const TEXT_QUALITY_REASON_PATTERNS: readonly RegExp[] = [
  /\bfont\b/i,
  /\btypograph/i,
  /\btext\s+(?:fidelity|quality|geometry|metric|wrapp)/i,
  /\bgeometry\s+(?:correction|drift|score|error)/i,
  /\bpixel\s+(?:score|similarity|difference)/i,
  /\bqa\s+score\b/i,
];

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function nodeMap(tree: WtfRenderTree): ReadonlyMap<string, WtfRenderNode> {
  return new Map(tree.nodes.map((node) => [node.id, node]));
}

function subtreeNodeIds(
  rootId: string,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): readonly string[] {
  const output: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    const children = nodes.get(id)?.childIds ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId) stack.push(childId);
    }
  }
  return output;
}

function isTextNode(node: WtfRenderNode): boolean {
  return node.kind === "text" || node.text !== undefined;
}

function matchingReasons(reasons: readonly string[], patterns: readonly RegExp[]): string[] {
  return uniqueSorted(reasons.filter((reason) => patterns.some((pattern) => pattern.test(reason))));
}

export function evaluateRasterTextPolicy(
  renderTree: WtfRenderTree,
  boundaryRenderNodeId: string,
  profile: W2fImportProfile,
): W2fRasterTextPolicyDecision {
  const nodes = nodeMap(renderTree);
  const boundary = nodes.get(boundaryRenderNodeId);
  if (!boundary) {
    throw new TypeError(`Raster text policy boundary is missing: ${boundaryRenderNodeId}`);
  }

  const textRenderNodeIds = uniqueSorted(
    subtreeNodeIds(boundaryRenderNodeId, nodes).filter((id) => {
      const node = nodes.get(id);
      return Boolean(node && isTextNode(node));
    }),
  );
  const decisionReasons = uniqueSorted(boundary.renderDecision.reasons);
  const visualJustifications = matchingReasons(decisionReasons, VISUAL_JUSTIFICATION_PATTERNS);
  const ignoredTextQualityReasons = matchingReasons(decisionReasons, TEXT_QUALITY_REASON_PATTERNS);

  if (textRenderNodeIds.length === 0) {
    return {
      version: W2F_RASTER_TEXT_POLICY_VERSION,
      boundaryRenderNodeId,
      profile,
      status: "not-applicable",
      textRenderNodeIds,
      visualJustifications,
      ignoredTextQualityReasons,
      reason: "Raster boundary contains no ordinary text nodes.",
    };
  }

  if (profile === "design-friendly") {
    return {
      version: W2F_RASTER_TEXT_POLICY_VERSION,
      boundaryRenderNodeId,
      profile,
      status: "native-preserved",
      textRenderNodeIds,
      visualJustifications,
      ignoredTextQualityReasons,
      reason:
        "Design-friendly profile preserves ordinary text natively even when a visual fallback boundary exists.",
    };
  }

  if (visualJustifications.length === 0) {
    return {
      version: W2F_RASTER_TEXT_POLICY_VERSION,
      boundaryRenderNodeId,
      profile,
      status: "native-preserved",
      textRenderNodeIds,
      visualJustifications,
      ignoredTextQualityReasons,
      reason:
        "Ordinary text cannot be rasterized without an explicit visual/compositing dependency; font, geometry, text-quality or pixel-score reasons do not authorize raster text.",
    };
  }

  return {
    version: W2F_RASTER_TEXT_POLICY_VERSION,
    boundaryRenderNodeId,
    profile,
    status: "raster-authorized",
    textRenderNodeIds,
    visualJustifications,
    ignoredTextQualityReasons,
    reason:
      "Raster text is authorized only because the boundary carries an explicit visual/compositing dependency under the selected fidelity profile; text-quality reasons are not authorization inputs.",
  };
}

export function rasterTextPolicyAllowsRaster(decision: W2fRasterTextPolicyDecision): boolean {
  return decision.status !== "native-preserved";
}
