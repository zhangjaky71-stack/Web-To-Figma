import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadePropertyTrace, CssNodeCascadeEvidence } from "@w2f/css-cascade";
import type { BaseLayoutNodeAnalysis } from "@w2f/layout-analyzer";
import {
  assignStableIdentities,
  createDocumentIdentity,
  sha256Hex,
  shortStableHash,
  type StableAncestrySegment,
  type StableIdentityAssignment,
  type StableIdentityNodeInput,
} from "@w2f/stable-identity";
import type { TableLayoutResult } from "@w2f/table-layout-engine";
import type {
  WtfDecisionEvidence,
  WtfGeometry,
  WtfLayoutModel,
  WtfPaintModel,
  WtfRenderNode,
  WtfRenderNodeKind,
  WtfRenderTree,
  WtfSectionOutlineItem,
  WtfTextModel,
} from "@w2f/w2f-ir";
import {
  canonicalStringify,
  type NodeRevisionHashes,
  type Rect,
  type StructuralFingerprint,
} from "@w2f/w2f-schema";
import {
  RENDER_TREE_OPTIMIZER_VERSION,
  type RenderTreeDiagnostic,
  type RenderTreeOptimizationResult,
  type RenderTreeOptimizationSummary,
  type RenderTreeOptimizerInput,
} from "./types.js";

const SEMANTIC_SECTION_TAGS = new Set([
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
]);

const FORM_CONTROL_TAGS = new Set([
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "progress",
  "meter",
  "output",
]);

const TABLE_BOUNDARY_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
]);

const WRAPPER_TAGS = new Set(["div", "span"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const PAINT_OR_BOUNDARY_PREFIXES = [
  "background",
  "border",
  "outline",
  "box-shadow",
  "transform",
  "mix-blend-mode",
  "mask",
  "filter",
  "backdrop-filter",
  "clip-path",
  "z-index",
  "isolation",
] as const;

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function tag(node: RawNode | undefined): string {
  return node?.source.tagName?.toLowerCase() ?? "";
}

function sourceOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin === "null" ? undefined : parsed.origin;
  } catch {
    return undefined;
  }
}

function sourceType(url: string): "http" | "file" | "unknown" {
  if (/^https?:/i.test(url)) return "http";
  if (/^file:/i.test(url)) return "file";
  return "unknown";
}

function winner(trace: CssCascadePropertyTrace | undefined) {
  return trace?.candidates.find((candidate) => candidate.status === "winner");
}

function trace(node: CssNodeCascadeEvidence | undefined, property: string) {
  return node?.traces.find((item) => item.property.toLowerCase() === property.toLowerCase());
}

function computed(node: CssNodeCascadeEvidence | undefined, property: string): string | undefined {
  const value = trace(node, property)?.computedValue.trim();
  return value || undefined;
}

function authoredProperties(node: CssNodeCascadeEvidence | undefined): string[] {
  return (node?.traces ?? [])
    .filter((item) => winner(item) !== undefined)
    .map((item) => item.property.toLowerCase());
}

function hasIndependentPaintOrStacking(
  node: RawNode,
  css: CssNodeCascadeEvidence | undefined,
): boolean {
  if (node.visibility && Math.abs(node.visibility.opacity - 1) > 1e-6) return true;
  for (const property of authoredProperties(css)) {
    if (
      PAINT_OR_BOUNDARY_PREFIXES.some(
        (prefix) => property === prefix || property.startsWith(`${prefix}-`),
      )
    ) {
      return true;
    }
  }
  const opacity = computed(css, "opacity");
  if (opacity && opacity !== "1") return true;
  const transform = computed(css, "transform");
  if (transform && transform !== "none") return true;
  const blend = computed(css, "mix-blend-mode");
  if (blend && blend !== "normal") return true;
  const isolation = computed(css, "isolation");
  if (isolation && isolation !== "auto") return true;
  const filter = computed(css, "filter");
  if (filter && filter !== "none") return true;
  const backdrop = computed(css, "backdrop-filter");
  if (backdrop && backdrop !== "none") return true;
  const clipPath = computed(css, "clip-path");
  if (clipPath && clipPath !== "none") return true;
  const mask = computed(css, "mask-image") ?? computed(css, "mask");
  if (mask && mask !== "none") return true;
  const zIndex = computed(css, "z-index");
  return Boolean(zIndex && zIndex !== "auto");
}

function rectEqual(left: Rect | undefined, right: Rect | undefined, epsilon = 0.01): boolean {
  if (!left || !right) return false;
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.width - right.width) <= epsilon &&
    Math.abs(left.height - right.height) <= epsilon
  );
}

function hasNonZeroEdges(
  edges: { top: number; right: number; bottom: number; left: number } | undefined,
): boolean {
  return Boolean(
    edges &&
    [edges.top, edges.right, edges.bottom, edges.left].some((value) => Math.abs(value) > 1e-6),
  );
}

function hasBorder(box: BaseLayoutNodeAnalysis["boxModel"] | undefined): boolean {
  if (!box) return false;
  return !rectEqual(box.borderBox, box.paddingBox);
}

function hasSemanticBoundary(node: RawNode): boolean {
  const nodeTag = tag(node);
  if (SEMANTIC_SECTION_TAGS.has(nodeTag) || TABLE_BOUNDARY_TAGS.has(nodeTag)) return true;
  if (node.source.role?.trim()) return true;
  const attributes = node.source.attributes ?? {};
  return Boolean(
    attributes["aria-label"]?.trim() ||
    attributes["aria-labelledby"]?.trim() ||
    attributes["aria-describedby"]?.trim() ||
    attributes["contenteditable"] === "true",
  );
}

function hasClipBoundary(layout: WtfLayoutModel | undefined): boolean {
  const values = [layout?.overflowX, layout?.overflowY]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return values.some((value) => value !== "visible" && value !== "unset" && value !== "initial");
}

function hasLayoutResponsibility(layout: WtfLayoutModel | undefined): boolean {
  if (!layout) return true;
  if (["flex", "grid", "table", "absolute"].includes(layout.mode)) return true;
  if (layout.position !== "static") return true;
  if (layout.flexItem || layout.gridItem || layout.absoluteConstraints) return true;
  if (hasNonZeroEdges(layout.padding)) return true;
  if (
    layout.effectiveGap &&
    (Math.abs(layout.effectiveGap.row) > 1e-6 || Math.abs(layout.effectiveGap.column) > 1e-6)
  ) {
    return true;
  }
  return hasClipBoundary(layout);
}

function classifyKind(node: RawNode): WtfRenderNodeKind {
  const nodeTag = tag(node);
  if (node.kind === "document") return "document";
  if (SEMANTIC_SECTION_TAGS.has(nodeTag)) return "section";
  if (node.kind === "text") return "text";
  if (node.kind === "pseudo") return "decoration";
  if (nodeTag === "img" || nodeTag === "picture") return "image";
  if (nodeTag === "svg") return "vector";
  if (nodeTag === "video") return "video-frame";
  if (nodeTag === "canvas") return "canvas";
  if (nodeTag === "table") return "table";
  if (nodeTag === "tr") return "row";
  if (nodeTag === "td" || nodeTag === "th") return "cell";
  if (FORM_CONTROL_TAGS.has(nodeTag) || node.formVisual) return "control";
  return "container";
}

function meaningfulClass(node: RawNode): string | undefined {
  const classes = (node.source.attributes?.class ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 48 && !/[a-f0-9]{8,}/i.test(item));
  return classes[0];
}

function renderName(node: RawNode): string {
  const attributes = node.source.attributes ?? {};
  const aria = attributes["aria-label"]?.trim();
  if (aria) return aria.slice(0, 80);
  if (node.source.role?.trim()) return node.source.role.trim();
  if (attributes.id?.trim()) return `${tag(node) || node.kind}#${attributes.id.trim()}`;
  const klass = meaningfulClass(node);
  if (klass) return `${tag(node) || node.kind}.${klass}`;
  if (node.kind === "pseudo") return `::${node.pseudo?.type ?? node.source.pseudoType ?? "pseudo"}`;
  if (node.kind === "text") return "Text";
  return tag(node) || node.kind;
}

function fallbackLayout(): WtfLayoutModel {
  const unknown = {
    mode: "unknown" as const,
    confidence: 0.15,
    reasons: ["NODE-19 received no base layout evidence"],
    sourceRefs: [],
  };
  return {
    mode: "unknown",
    display: "unknown",
    position: "static",
    sizing: {
      width: unknown,
      height: unknown,
    },
    decision: {
      confidence: 0.15,
      reasons: ["base layout evidence unavailable"],
      sourceRefs: [],
    },
  };
}

function numeric(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function paintModel(node: RawNode, css: CssNodeCascadeEvidence | undefined): WtfPaintModel {
  const rawOpacity = node.visibility?.opacity;
  const cssOpacity = numeric(computed(css, "opacity"));
  const opacity = Math.max(0, Math.min(1, rawOpacity ?? cssOpacity ?? 1));
  const blendMode = computed(css, "mix-blend-mode");
  const isolation = computed(css, "isolation");
  const filter = computed(css, "filter");
  const backdropFilter = computed(css, "backdrop-filter");
  const maskImage = computed(css, "mask-image") ?? computed(css, "mask");
  const clipPath = computed(css, "clip-path");
  return {
    fills: [],
    opacity,
    ...(blendMode && blendMode !== "normal" ? { blendMode } : {}),
    ...(isolation && isolation !== "auto" ? { isolation } : {}),
    ...(filter && filter !== "none" ? { filter } : {}),
    ...(backdropFilter && backdropFilter !== "none" ? { backdropFilter } : {}),
    ...(maskImage && maskImage !== "none" ? { maskImage } : {}),
    ...(clipPath && clipPath !== "none" ? { clipPath } : {}),
  };
}

function geometryModel(
  node: RawNode,
  analysis: BaseLayoutNodeAnalysis | undefined,
  css: CssNodeCascadeEvidence | undefined,
): WtfGeometry {
  const bounds = node.geometry?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const zRaw = computed(css, "z-index");
  const zNumber = zRaw && zRaw !== "auto" ? Number(zRaw) : undefined;
  const clipping = hasClipBoundary(analysis?.layout);
  return {
    bounds,
    ...(analysis?.boxModel ? { box: analysis.boxModel } : {}),
    ...(clipping ? { clipBounds: bounds } : {}),
    ...(node.geometry?.scrollContainerId
      ? { scrollContainerId: node.geometry.scrollContainerId }
      : {}),
    ...(typeof node.paintOrder === "number" ? { paintOrder: node.paintOrder } : {}),
    ...(zRaw === "auto"
      ? { zIndex: "auto" as const }
      : typeof zNumber === "number" && Number.isFinite(zNumber)
        ? { zIndex: zNumber }
        : {}),
  };
}

function textModel(node: RawNode): WtfTextModel | undefined {
  if (!node.text) return undefined;
  return {
    value: node.text.value,
    runs: node.text.runs.map((run) => ({
      start: run.start,
      end: run.end,
      text: run.text,
      font: {
        family: run.font.family,
        ...(run.font.style ? { style: run.font.style } : {}),
        ...(run.font.weight !== undefined ? { weight: run.font.weight } : {}),
        ...(run.font.stretch ? { stretch: run.font.stretch } : {}),
        ...(run.font.variationSettings ? { variationSettings: run.font.variationSettings } : {}),
        ...(run.font.featureSettings ? { featureSettings: run.font.featureSettings } : {}),
      },
      fontSize: run.fontSize,
      ...(run.lineHeight !== undefined ? { lineHeight: run.lineHeight } : {}),
      ...(run.letterSpacing !== undefined ? { letterSpacing: run.letterSpacing } : {}),
      ...(run.decoration ? { decoration: run.decoration } : {}),
      ...(run.baselineShift !== undefined ? { baselineShift: run.baselineShift } : {}),
      ...(run.direction ? { direction: run.direction } : {}),
    })),
    fragments: node.text.fragments.map((fragment) => ({
      start: fragment.start,
      end: fragment.end,
      bounds: fragment.bounds,
      baseline: fragment.baseline,
      lineIndex: fragment.lineIndex,
    })),
    ...(node.text.whiteSpace ? { whiteSpace: node.text.whiteSpace } : {}),
    ...(node.text.wordBreak ? { wordBreak: node.text.wordBreak } : {}),
    ...(node.text.overflowWrap ? { overflowWrap: node.text.overflowWrap } : {}),
    ...(node.text.textAlign ? { textAlign: node.text.textAlign } : {}),
    ...(node.text.direction ? { direction: node.text.direction } : {}),
  };
}

function preferredParentMap(
  snapshot: RawSnapshot,
  diagnostics: RenderTreeDiagnostic[],
): Map<string, string> {
  const byId = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const fallbackParent = new Map<string, string>();
  for (const parent of snapshot.nodes) {
    for (const childId of parent.childCaptureNodeIds) {
      if (!fallbackParent.has(childId)) fallbackParent.set(childId, parent.captureNodeId);
    }
  }
  const parentById = new Map<string, string>();
  for (const node of snapshot.nodes) {
    if (node.captureNodeId === snapshot.rootCaptureNodeId) continue;
    const candidate =
      node.relationships.composedParentId ??
      node.relationships.sourceParentId ??
      fallbackParent.get(node.captureNodeId);
    if (candidate && candidate !== node.captureNodeId && byId.has(candidate)) {
      parentById.set(node.captureNodeId, candidate);
    } else {
      parentById.set(node.captureNodeId, snapshot.rootCaptureNodeId);
      diagnostics.push({
        code: "RENDER_TREE_PARENT_MISSING",
        message: "Source/composed parent is unavailable; node is attached to the capture root.",
        sourceNodeId: node.captureNodeId,
      });
    }
  }

  for (const node of snapshot.nodes) {
    if (node.captureNodeId === snapshot.rootCaptureNodeId) continue;
    const seen = new Set<string>([node.captureNodeId]);
    let current = parentById.get(node.captureNodeId);
    while (current) {
      if (seen.has(current)) {
        parentById.set(node.captureNodeId, snapshot.rootCaptureNodeId);
        diagnostics.push({
          code: "RENDER_TREE_PARENT_CYCLE",
          message: "Parent cycle detected; node is attached to the capture root.",
          sourceNodeId: node.captureNodeId,
          relatedSourceNodeIds: [...seen, current].sort(),
        });
        break;
      }
      seen.add(current);
      current = parentById.get(current);
    }
  }
  return parentById;
}

function childMap(
  snapshot: RawSnapshot,
  parentById: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const order = new Map(snapshot.nodes.map((node, index) => [node.captureNodeId, index]));
  const result = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    const parentId = parentById.get(node.captureNodeId);
    if (!parentId) continue;
    const children = result.get(parentId) ?? [];
    children.push(node.captureNodeId);
    result.set(parentId, children);
  }
  for (const children of result.values()) {
    children.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }
  return result;
}

function ancestryFor(
  nodeId: string,
  parentById: ReadonlyMap<string, string>,
  byId: ReadonlyMap<string, RawNode>,
): StableAncestrySegment[] {
  const chain: RawNode[] = [];
  let current = parentById.get(nodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current);
    if (!parent) break;
    chain.push(parent);
    current = parentById.get(current);
  }
  return chain.reverse().map((node) => {
    const attributes = node.source.attributes ?? {};
    const dataAttributes = Object.fromEntries(
      Object.entries(attributes).filter(([name]) => name.startsWith("data-")),
    );
    const classList = (attributes.class ?? "").split(/\s+/).filter(Boolean);
    return {
      tagName: tag(node) || node.kind,
      ...(node.source.role ? { role: node.source.role } : {}),
      ...(attributes.id ? { idAttribute: attributes.id } : {}),
      ...(Object.keys(dataAttributes).length > 0 ? { dataAttributes } : {}),
      ...(classList.length > 0 ? { classList } : {}),
    };
  });
}

async function stableAssignments(
  snapshot: RawSnapshot,
  parentById: ReadonlyMap<string, string>,
  childrenById: ReadonlyMap<string, string[]>,
): Promise<Map<string, StableIdentityAssignment>> {
  const documentIdentity = await createDocumentIdentity({
    sourceType: sourceType(snapshot.url),
    sourceUrl: snapshot.url,
  });
  const byId = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const origin = sourceOrigin(snapshot.url);
  const order = new Map(snapshot.nodes.map((node, index) => [node.captureNodeId, index]));
  const inputs: StableIdentityNodeInput[] = snapshot.nodes.map((node) => {
    const attributes = node.source.attributes ?? {};
    const parentId = parentById.get(node.captureNodeId);
    const siblings = parentId ? (childrenById.get(parentId) ?? []) : [node.captureNodeId];
    const siblingIndex = Math.max(0, siblings.indexOf(node.captureNodeId));
    const nodeTag = tag(node) || (node.kind === "text" ? "#text" : node.kind);
    const sameKind = siblings.filter((id) => {
      const sibling = byId.get(id);
      return sibling && (tag(sibling) || sibling.kind) === nodeTag;
    });
    const dataAttributes = Object.fromEntries(
      Object.entries(attributes).filter(([name]) => name.startsWith("data-")),
    );
    const classList = (attributes.class ?? "").split(/\s+/).filter(Boolean);
    return {
      captureNodeId: node.captureNodeId,
      documentId: documentIdentity.documentId,
      ...(origin ? { sourceOrigin: origin } : {}),
      ...(node.source.namespace ? { namespace: node.source.namespace } : {}),
      tagName: nodeTag,
      ...(node.source.role ? { role: node.source.role } : {}),
      ...(attributes.id ? { idAttribute: attributes.id } : {}),
      ...(Object.keys(dataAttributes).length > 0 ? { dataAttributes } : {}),
      ...(classList.length > 0 ? { classList } : {}),
      ancestry: ancestryFor(node.captureNodeId, parentById, byId),
      structuralPosition: {
        siblingIndex,
        sameKindIndex: Math.max(0, sameKind.indexOf(node.captureNodeId)),
        documentOrder: order.get(node.captureNodeId) ?? 0,
      },
      ...(node.textContent || node.text?.value
        ? { textContent: node.textContent ?? node.text?.value ?? "" }
        : {}),
    };
  });
  const assignments = await assignStableIdentities(inputs);
  return new Map(assignments.map((assignment) => [assignment.captureNodeId, assignment]));
}

function tableBoundaryIds(tables: TableLayoutResult): Set<string> {
  const result = new Set<string>();
  for (const table of tables.tables) {
    result.add(table.sourceNodeId);
    for (const group of table.rowGroups) if (group.sourceNodeId) result.add(group.sourceNodeId);
    for (const row of table.rows) result.add(row.sourceNodeId);
    for (const cell of table.cells) result.add(cell.sourceNodeId);
    if (table.caption) result.add(table.caption.sourceNodeId);
  }
  return result;
}

function isSafeDecorativeChain(node: RawNode, child: RawNode | undefined): boolean {
  if (node.kind !== "pseudo" || child?.kind !== "pseudo") return false;
  if (node.pseudo?.contentKind !== "none") return false;
  return rectEqual(node.geometry?.bounds, child.geometry?.bounds);
}

function canFoldWrapper(
  node: RawNode,
  child: RawNode | undefined,
  parent: RawNode | undefined,
  analysis: BaseLayoutNodeAnalysis | undefined,
  parentAnalysis: BaseLayoutNodeAnalysis | undefined,
  css: CssNodeCascadeEvidence | undefined,
  scrollRoots: ReadonlySet<string>,
  tableBoundaries: ReadonlySet<string>,
): boolean {
  if (!child) return false;
  if (node.kind === "document" || node.kind === "text" || node.kind === "comment") return false;
  if (isSafeDecorativeChain(node, child)) return true;
  const nodeTag = tag(node);
  if (!(WRAPPER_TAGS.has(nodeTag) || node.kind === "slot" || node.kind === "shadow-root"))
    return false;
  if (hasSemanticBoundary(node) || tableBoundaries.has(node.captureNodeId)) return false;
  if (scrollRoots.has(node.captureNodeId)) return false;
  if (hasIndependentPaintOrStacking(node, css)) return false;
  if (hasLayoutResponsibility(analysis?.layout)) return false;
  if (hasBorder(analysis?.boxModel)) return false;
  if (parentAnalysis && ["flex", "grid", "table"].includes(parentAnalysis.layout.mode))
    return false;
  if (analysis?.layout.flexItem || analysis?.layout.gridItem) return false;
  if (
    node.geometry?.bounds &&
    child.geometry?.bounds &&
    !rectEqual(node.geometry.bounds, child.geometry.bounds)
  ) {
    return false;
  }
  if (!node.geometry?.bounds || !child.geometry?.bounds) return false;
  if (parent && tag(parent) === "table") return false;
  return true;
}

function normalizeLayoutForRender(
  analysis: BaseLayoutNodeAnalysis | undefined,
  sourceNodeId: string,
  diagnostics: RenderTreeDiagnostic[],
): WtfLayoutModel {
  if (analysis) return analysis.layout;
  diagnostics.push({
    code: "RENDER_TREE_LAYOUT_MISSING",
    message: "No base layout evidence is available; an unknown layout model is retained.",
    sourceNodeId,
  });
  return fallbackLayout();
}

function structuralDecision(
  sourceNodeIds: readonly string[],
  foldedCount: number,
): WtfDecisionEvidence {
  return {
    confidence: clampConfidence(foldedCount > 0 ? 0.94 : 0.98),
    reasons: [
      foldedCount > 0
        ? "meaningless single-child wrappers were folded under strict boundary checks"
        : "source/composed boundary is preserved",
      "render strategy is structural only; NODE-20 may revise compositing/fallback policy",
    ],
    sourceRefs: [...sourceNodeIds],
  };
}

async function hashPayload(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}

async function fingerprintFor(
  node: WtfRenderNode,
  source: RawNode,
  childKinds: readonly WtfRenderNodeKind[],
): Promise<StructuralFingerprint> {
  const semanticHash = await hashPayload([
    "w2f-render-semantic-v1",
    node.kind,
    tag(source),
    source.source.role ?? "",
    childKinds,
  ]);
  const layoutHash = await hashPayload([
    "w2f-render-layout-v1",
    node.layout.mode,
    node.layout.position,
    node.layout.sizing.width.mode,
    node.layout.sizing.height.mode,
    node.layout.padding ?? null,
    node.layout.effectiveGap ?? null,
    node.layout.flexContainer ?? null,
    node.layout.flexItem ?? null,
    node.layout.gridContainer ?? null,
    node.layout.gridItem ?? null,
    node.layout.absoluteConstraints ?? null,
  ]);
  const paintHash = await hashPayload([
    "w2f-render-paint-boundary-v1",
    node.paint.opacity,
    node.paint.blendMode ?? "",
    node.paint.isolation ?? "",
    node.paint.filter ?? "",
    node.paint.backdropFilter ?? "",
    node.paint.maskImage ?? "",
    node.paint.clipPath ?? "",
  ]);
  const combinedHash = await hashPayload([
    "w2f-render-structural-v1",
    semanticHash,
    layoutHash,
    paintHash,
  ]);
  return {
    semanticHash,
    layoutHash,
    paintHash,
    combinedHash,
    confidence: clampConfidence(
      node.geometry.bounds.width > 0 || node.geometry.bounds.height > 0 ? 0.95 : 0.78,
    ),
  };
}

function subtreeContentEvidence(
  sourceNodeId: string,
  childrenBySourceId: ReadonlyMap<string, string[]>,
  sourceById: ReadonlyMap<string, RawNode>,
  seen = new Set<string>(),
): unknown {
  if (seen.has(sourceNodeId)) return ["cycle"];
  const sourceNode = sourceById.get(sourceNodeId);
  if (!sourceNode) return ["missing"];
  seen.add(sourceNodeId);
  const children = (childrenBySourceId.get(sourceNodeId) ?? []).map((childId) =>
    subtreeContentEvidence(childId, childrenBySourceId, sourceById, seen),
  );
  seen.delete(sourceNodeId);
  return [
    sourceNode.kind,
    tag(sourceNode),
    sourceNode.source.role ?? "",
    sourceNode.textContent ?? sourceNode.text?.value ?? "",
    sourceNode.source.attributes ?? {},
    children,
  ];
}

async function revisionHashesFor(
  node: WtfRenderNode,
  source: RawNode,
  fingerprint: StructuralFingerprint,
  childrenBySourceId: ReadonlyMap<string, string[]>,
  sourceById: ReadonlyMap<string, RawNode>,
): Promise<NodeRevisionHashes> {
  return {
    contentHash: await hashPayload([
      "w2f-render-content-v1",
      subtreeContentEvidence(source.captureNodeId, childrenBySourceId, sourceById),
    ]),
    geometryHash: await hashPayload(["w2f-render-geometry-v1", node.geometry]),
    layoutHash: fingerprint.layoutHash,
    ...(fingerprint.paintHash ? { paintHash: fingerprint.paintHash } : {}),
    hierarchyHash: await hashPayload(["w2f-render-hierarchy-v1", node.childIds]),
  };
}

function headingName(
  renderSourceId: string,
  childrenById: ReadonlyMap<string, string[]>,
  byId: ReadonlyMap<string, RawNode>,
): string | undefined {
  for (const childId of childrenById.get(renderSourceId) ?? []) {
    const child = byId.get(childId);
    if (!child || !HEADING_TAGS.has(tag(child))) continue;
    const text = (child.text?.value ?? child.textContent ?? "").trim();
    if (text) return text.slice(0, 80);
  }
  return undefined;
}

function buildSections(
  treeNodes: readonly WtfRenderNode[],
  primarySourceByRenderId: ReadonlyMap<string, RawNode>,
  childrenBySourceId: ReadonlyMap<string, string[]>,
  byId: ReadonlyMap<string, RawNode>,
): WtfSectionOutlineItem[] {
  const renderById = new Map(treeNodes.map((node) => [node.id, node]));
  const root = treeNodes.find((node) => !node.parentId);
  const rootWidth = root?.geometry.bounds.width ?? 0;
  const sectionRenderIds = new Set<string>();

  for (const node of treeNodes) {
    const source = primarySourceByRenderId.get(node.id);
    if (!source || node.kind === "document") continue;
    if (SEMANTIC_SECTION_TAGS.has(tag(source))) {
      sectionRenderIds.add(node.id);
      continue;
    }
    const parent = node.parentId ? renderById.get(node.parentId) : undefined;
    const topLevel = parent?.kind === "document" || parent?.kind === "section";
    const bounds = node.geometry.bounds;
    const hasHeading = headingName(source.captureNodeId, childrenBySourceId, byId) !== undefined;
    if (
      node.kind === "container" &&
      topLevel &&
      bounds.height >= 120 &&
      (rootWidth <= 0 || bounds.width >= rootWidth * 0.5) &&
      hasHeading
    ) {
      sectionRenderIds.add(node.id);
    }
  }

  const sectionIdByRender = new Map<string, string>();
  for (const renderId of [...sectionRenderIds].sort())
    sectionIdByRender.set(renderId, `section:${renderId}`);

  const result: WtfSectionOutlineItem[] = [];
  for (const renderId of sectionRenderIds) {
    const node = renderById.get(renderId);
    const source = primarySourceByRenderId.get(renderId);
    if (!node || !source) continue;
    let parent = node.parentId ? renderById.get(node.parentId) : undefined;
    let parentSectionId: string | undefined;
    while (parent) {
      parentSectionId = sectionIdByRender.get(parent.id);
      if (parentSectionId) break;
      parent = parent.parentId ? renderById.get(parent.parentId) : undefined;
    }
    const name =
      headingName(source.captureNodeId, childrenBySourceId, byId) ??
      source.source.attributes?.["aria-label"] ??
      renderName(source);
    result.push({
      id: sectionIdByRender.get(renderId) ?? `section:${renderId}`,
      renderNodeId: renderId,
      name,
      kind: tag(source) || "visual-section",
      childSectionIds: [],
    });
    if (parentSectionId) {
      const parentItem = result.find((item) => item.id === parentSectionId);
      if (parentItem)
        parentItem.childSectionIds.push(sectionIdByRender.get(renderId) ?? `section:${renderId}`);
    }
  }
  for (const section of result) section.childSectionIds.sort();
  return result.sort((left, right) => left.renderNodeId.localeCompare(right.renderNodeId));
}

export async function optimizeRenderTree(
  input: RenderTreeOptimizerInput,
): Promise<RenderTreeOptimizationResult> {
  const diagnostics: RenderTreeDiagnostic[] = [];
  const snapshot = input.snapshot;
  const byId = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const order = new Map(snapshot.nodes.map((node, index) => [node.captureNodeId, index]));
  const layoutById = new Map(input.layout.nodes.map((node) => [node.sourceNodeId, node]));
  const cssById = new Map(input.cascade.cascade.nodes.map((node) => [node.sourceNodeId, node]));
  const parentById = preferredParentMap(snapshot, diagnostics);
  const childrenById = childMap(snapshot, parentById);
  const stableById = await stableAssignments(snapshot, parentById, childrenById);
  const scrollRoots = new Set(snapshot.scrollContainers.map((item) => item.sourceNodeId));
  const tableBoundaries = tableBoundaryIds(input.tables);

  const foldable = new Set<string>();
  const comments = new Set<string>();
  for (const node of snapshot.nodes) {
    if (node.kind === "comment") {
      comments.add(node.captureNodeId);
      continue;
    }
    if (node.captureNodeId === snapshot.rootCaptureNodeId) continue;
    const childIds = childrenById.get(node.captureNodeId) ?? [];
    if (childIds.length !== 1) continue;
    const child = byId.get(childIds[0] ?? "");
    const parentId = parentById.get(node.captureNodeId);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (
      canFoldWrapper(
        node,
        child,
        parent,
        layoutById.get(node.captureNodeId),
        parentId ? layoutById.get(parentId) : undefined,
        cssById.get(node.captureNodeId),
        scrollRoots,
        tableBoundaries,
      )
    ) {
      foldable.add(node.captureNodeId);
    } else if (WRAPPER_TAGS.has(tag(node)) || node.kind === "slot" || node.kind === "shadow-root") {
      diagnostics.push({
        code: "RENDER_TREE_WRAPPER_PRESERVED",
        message:
          "Wrapper was preserved because at least one safe-removal condition was not proven.",
        sourceNodeId: node.captureNodeId,
      });
    }
  }

  const targetMemo = new Map<string, string>();
  const resolveTarget = (sourceNodeId: string): string => {
    const cached = targetMemo.get(sourceNodeId);
    if (cached) return cached;
    if (comments.has(sourceNodeId)) {
      const parent = parentById.get(sourceNodeId) ?? snapshot.rootCaptureNodeId;
      const target = parent === sourceNodeId ? snapshot.rootCaptureNodeId : resolveTarget(parent);
      targetMemo.set(sourceNodeId, target);
      return target;
    }
    if (foldable.has(sourceNodeId)) {
      const childId = childrenById.get(sourceNodeId)?.[0];
      if (childId) {
        const target = resolveTarget(childId);
        targetMemo.set(sourceNodeId, target);
        return target;
      }
    }
    targetMemo.set(sourceNodeId, sourceNodeId);
    return sourceNodeId;
  };

  for (const node of snapshot.nodes) resolveTarget(node.captureNodeId);
  const rootTarget = resolveTarget(snapshot.rootCaptureNodeId);
  if (!byId.has(rootTarget)) {
    throw new Error("Render Tree root target is missing from RawSnapshot");
  }

  const keptSourceIds = snapshot.nodes
    .map((node) => node.captureNodeId)
    .filter((id) => !comments.has(id) && resolveTarget(id) === id);
  const aggregatedByTarget = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    const target = resolveTarget(node.captureNodeId);
    const list = aggregatedByTarget.get(target) ?? [];
    list.push(node.captureNodeId);
    aggregatedByTarget.set(target, list);
  }
  for (const list of aggregatedByTarget.values()) {
    list.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }

  const renderIdBySourceTarget = new Map<string, string>();
  for (const keptId of keptSourceIds) {
    const sourceNodeIds = aggregatedByTarget.get(keptId) ?? [keptId];
    const stableIds = sourceNodeIds.flatMap((id) => {
      const stable = stableById.get(id)?.identity.id;
      return stable ? [stable] : [];
    });
    const hash = await hashPayload([
      "w2f-render-node-v1",
      stableIds.length > 0 ? stableIds : sourceNodeIds,
      classifyKind(byId.get(keptId) as RawNode),
    ]);
    renderIdBySourceTarget.set(keptId, `rn_${shortStableHash(hash)}`);
  }

  const keptParentTarget = new Map<string, string>();
  for (const keptId of keptSourceIds) {
    if (keptId === rootTarget) continue;
    let parentId = parentById.get(keptId);
    let parentTarget: string | undefined;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const candidate = resolveTarget(parentId);
      if (candidate !== keptId && renderIdBySourceTarget.has(candidate)) {
        parentTarget = candidate;
        break;
      }
      parentId = parentById.get(parentId);
    }
    keptParentTarget.set(keptId, parentTarget ?? rootTarget);
  }

  const renderChildrenByTarget = new Map<string, string[]>();
  for (const keptId of keptSourceIds) {
    const parentTarget = keptParentTarget.get(keptId);
    if (!parentTarget || keptId === rootTarget) continue;
    const children = renderChildrenByTarget.get(parentTarget) ?? [];
    children.push(keptId);
    renderChildrenByTarget.set(parentTarget, children);
  }
  for (const children of renderChildrenByTarget.values()) {
    children.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }

  const provisionalNodes: WtfRenderNode[] = [];
  const primarySourceByRenderId = new Map<string, RawNode>();
  for (const keptId of keptSourceIds) {
    const source = byId.get(keptId);
    if (!source) continue;
    const renderId = renderIdBySourceTarget.get(keptId);
    if (!renderId) continue;
    const sourceNodeIds = aggregatedByTarget.get(keptId) ?? [keptId];
    const stableIds = uniqueSorted(
      sourceNodeIds.flatMap((id) => {
        const assignment = stableById.get(id);
        if (!assignment) return [];
        if (assignment.identity.confidence < 0.5) {
          diagnostics.push({
            code: "RENDER_TREE_STABLE_IDENTITY_LOW_CONFIDENCE",
            message: "Stable source mapping exists but has low confidence.",
            sourceNodeId: id,
          });
        }
        return [assignment.identity.id];
      }),
    );
    const analysis = layoutById.get(keptId);
    if (!source.geometry?.bounds) {
      diagnostics.push({
        code: "RENDER_TREE_GEOMETRY_MISSING",
        message:
          "Render node is preserved with zero geometry because Browser bounds are unavailable.",
        sourceNodeId: keptId,
      });
    }
    const childSourceTargets = renderChildrenByTarget.get(keptId) ?? [];
    const childIds = childSourceTargets.flatMap((id) => {
      const value = renderIdBySourceTarget.get(id);
      return value ? [value] : [];
    });
    const parentTarget = keptParentTarget.get(keptId);
    const parentRenderId = parentTarget ? renderIdBySourceTarget.get(parentTarget) : undefined;
    const layout = normalizeLayoutForRender(analysis, keptId, diagnostics);
    const paint = paintModel(source, cssById.get(keptId));
    const text = textModel(source);
    const renderStrategy = layout.mode === "absolute" ? "absolute" : "native";
    const node: WtfRenderNode = {
      id: renderId,
      ...(parentRenderId ? { parentId: parentRenderId } : {}),
      childIds,
      sourceNodeIds,
      ...(stableIds.length > 0 ? { sourceStableIds: stableIds } : {}),
      kind: classifyKind(source),
      name: renderName(source),
      geometry: geometryModel(source, analysis, cssById.get(keptId)),
      layout,
      paint,
      ...(text ? { text } : {}),
      renderStrategy,
      renderDecision: structuralDecision(sourceNodeIds, sourceNodeIds.length - 1),
    };
    provisionalNodes.push(node);
    primarySourceByRenderId.set(renderId, source);
  }

  const nodeById = new Map(provisionalNodes.map((node) => [node.id, node]));
  const fingerprintByRenderId = new Map<string, StructuralFingerprint>();
  for (const node of provisionalNodes) {
    const source = primarySourceByRenderId.get(node.id);
    if (!source) continue;
    const childKinds = node.childIds.flatMap((id) => {
      const child = nodeById.get(id);
      return child ? [child.kind] : [];
    });
    fingerprintByRenderId.set(node.id, await fingerprintFor(node, source, childKinds));
  }

  const candidateGroups = new Map<string, string[]>();
  for (const node of provisionalNodes) {
    if (["document", "text", "decoration", "fallback"].includes(node.kind)) continue;
    const fingerprint = fingerprintByRenderId.get(node.id);
    if (!fingerprint) continue;
    const group = candidateGroups.get(fingerprint.combinedHash) ?? [];
    group.push(node.id);
    candidateGroups.set(fingerprint.combinedHash, group);
  }
  const groupIdByFingerprint = new Map<string, string>();
  for (const [fingerprint, ids] of candidateGroups) {
    if (ids.length < 2) continue;
    const groupHash = await hashPayload(["w2f-component-candidate-group-v1", fingerprint]);
    groupIdByFingerprint.set(fingerprint, `rcg_${shortStableHash(groupHash)}`);
  }

  const finalNodes: WtfRenderNode[] = [];
  for (const node of provisionalNodes) {
    const source = primarySourceByRenderId.get(node.id);
    const fingerprint = fingerprintByRenderId.get(node.id);
    if (!source || !fingerprint) {
      finalNodes.push(node);
      continue;
    }
    const groupId = groupIdByFingerprint.get(fingerprint.combinedHash);
    const revisionHashes = await revisionHashesFor(node, source, fingerprint, childrenById, byId);
    finalNodes.push({
      ...node,
      ...(groupId ? { componentCandidate: { fingerprint, groupId } } : {}),
      revisionHashes,
    });
  }

  const renderIdBySource: Record<string, string> = {};
  for (const source of snapshot.nodes) {
    const target = resolveTarget(source.captureNodeId);
    const renderId = renderIdBySourceTarget.get(target) ?? renderIdBySourceTarget.get(rootTarget);
    if (renderId) renderIdBySource[source.captureNodeId] = renderId;
  }

  const rootRenderId = renderIdBySourceTarget.get(rootTarget);
  if (!rootRenderId) throw new Error("Render Tree root render ID is unavailable");
  const rootNode = finalNodes.find((node) => node.id === rootRenderId);
  if (rootNode?.parentId) {
    delete rootNode.parentId;
    diagnostics.push({
      code: "RENDER_TREE_ROOT_REPAIRED",
      message: "Render root parent was removed to preserve a single-root tree.",
      sourceNodeId: rootTarget,
    });
  }

  const tree: WtfRenderTree = {
    rootId: rootRenderId,
    nodes: finalNodes.sort((left, right) => {
      const leftSource = left.sourceNodeIds[0] ?? "";
      const rightSource = right.sourceNodeIds[0] ?? "";
      return (
        (order.get(leftSource) ?? 0) - (order.get(rightSource) ?? 0) ||
        left.id.localeCompare(right.id)
      );
    }),
    sections: buildSections(finalNodes, primarySourceByRenderId, childrenById, byId),
  };

  diagnostics.sort(
    (left, right) =>
      (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );

  return {
    version: RENDER_TREE_OPTIMIZER_VERSION,
    tree,
    diagnostics,
    sourceToRenderNodeId: Object.fromEntries(
      Object.entries(renderIdBySource).sort(
        ([left], [right]) =>
          (order.get(left) ?? 0) - (order.get(right) ?? 0) || left.localeCompare(right),
      ),
    ),
  };
}

export function summarizeRenderTreeOptimization(
  result: RenderTreeOptimizationResult,
): RenderTreeOptimizationSummary {
  const sourceNodeCount = Object.keys(result.sourceToRenderNodeId).length;
  const groupIds = new Set(
    result.tree.nodes.flatMap((node) =>
      node.componentCandidate?.groupId ? [node.componentCandidate.groupId] : [],
    ),
  );
  return {
    version: result.version,
    sourceNodeCount,
    renderNodeCount: result.tree.nodes.length,
    foldedSourceNodeCount: Math.max(0, sourceNodeCount - result.tree.nodes.length),
    sectionCount: result.tree.sections.length,
    componentCandidateCount: result.tree.nodes.filter((node) => node.componentCandidate).length,
    componentCandidateGroupCount: groupIds.size,
    diagnosticCount: result.diagnostics.length,
  };
}
