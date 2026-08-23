import {
  analyzeBaseLayout,
  type BaseLayoutAnalysis,
  type LayoutNodeObservation,
  type LayoutPropertyEvidence,
} from "@w2f/layout-analyzer";
import type { RawSnapshot } from "@w2f/capture-core";
import type {
  CssCascadeCapture,
  CssNodeCascadeEvidence,
  CssCascadePropertyTrace,
} from "@w2f/css-cascade";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readRawSnapshot } from "./snapshot-store.js";

const LAYOUT_PROPERTIES = {
  display: "display",
  position: "position",
  width: "width",
  height: "height",
  minWidth: "min-width",
  maxWidth: "max-width",
  minHeight: "min-height",
  maxHeight: "max-height",
  paddingTop: "padding-top",
  paddingRight: "padding-right",
  paddingBottom: "padding-bottom",
  paddingLeft: "padding-left",
  marginTop: "margin-top",
  marginRight: "margin-right",
  marginBottom: "margin-bottom",
  marginLeft: "margin-left",
  borderTopWidth: "border-top-width",
  borderRightWidth: "border-right-width",
  borderBottomWidth: "border-bottom-width",
  borderLeftWidth: "border-left-width",
  rowGap: "row-gap",
  columnGap: "column-gap",
  overflowX: "overflow-x",
  overflowY: "overflow-y",
  flexDirection: "flex-direction",
  flexWrap: "flex-wrap",
  justifyContent: "justify-content",
  alignItems: "align-items",
  alignContent: "align-content",
  flexGrow: "flex-grow",
  flexShrink: "flex-shrink",
  flexBasis: "flex-basis",
  alignSelf: "align-self",
  order: "order",
  gridTemplateColumns: "grid-template-columns",
  gridTemplateRows: "grid-template-rows",
  gridAutoFlow: "grid-auto-flow",
  gridColumnStart: "grid-column-start",
  gridColumnEnd: "grid-column-end",
  gridRowStart: "grid-row-start",
  gridRowEnd: "grid-row-end",
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
} as const;

function winner(trace: CssCascadePropertyTrace | undefined) {
  return trace?.candidates.find((candidate) => candidate.status === "winner");
}

function evidence(
  cascadeNode: CssNodeCascadeEvidence | undefined,
  property: string,
): LayoutPropertyEvidence | undefined {
  const trace = cascadeNode?.traces.find((item) => item.property === property);
  if (!trace) return undefined;
  const winning = winner(trace);
  const stylesheetRef = winning?.source.stylesheetRef;
  const selector = winning?.source.selector;
  const sourceRef = [stylesheetRef, selector, winning?.source.ruleIndex?.toString()]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .join("#");
  return {
    ...(trace.computedValue ? { computed: trace.computedValue } : {}),
    ...(winning?.authoredValue ? { authored: winning.authoredValue } : {}),
    ...(sourceRef ? { sourceRef } : {}),
  };
}

function styleEvidence(
  cascadeNode: CssNodeCascadeEvidence | undefined,
  rawDisplay: string | undefined,
): LayoutNodeObservation["style"] {
  const style: LayoutNodeObservation["style"] = {};
  for (const [field, property] of Object.entries(LAYOUT_PROPERTIES)) {
    const propertyEvidence = evidence(cascadeNode, property);
    if (propertyEvidence) {
      (style as Record<string, LayoutPropertyEvidence | undefined>)[field] = propertyEvidence;
    }
  }
  if (!style.display && rawDisplay) style.display = { computed: rawDisplay };
  return style;
}

export function buildBaseLayoutObservations(
  snapshot: RawSnapshot,
  cascade: CssCascadeCapture,
): LayoutNodeObservation[] {
  const rawById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const cascadeById = new Map(cascade.cascade.nodes.map((node) => [node.sourceNodeId, node]));
  return snapshot.nodes.map((node) => {
    const parentId = node.relationships.sourceParentId ?? node.relationships.composedParentId;
    const parent = parentId ? rawById.get(parentId) : undefined;
    return {
      sourceNodeId: node.captureNodeId,
      ...(parentId ? { parentSourceNodeId: parentId } : {}),
      childSourceNodeIds: [...node.childCaptureNodeIds],
      kind: node.kind,
      ...(node.geometry?.bounds ? { bounds: node.geometry.bounds } : {}),
      ...(parent?.geometry?.bounds ? { parentBounds: parent.geometry.bounds } : {}),
      style: styleEvidence(cascadeById.get(node.captureNodeId), node.visibility?.display),
    };
  });
}

export function analyzeSnapshotBaseLayout(
  snapshot: RawSnapshot,
  cascade: CssCascadeCapture,
): BaseLayoutAnalysis {
  return analyzeBaseLayout({ nodes: buildBaseLayoutObservations(snapshot, cascade) });
}

export async function analyzePersistedBaseLayout(jobId: string): Promise<BaseLayoutAnalysis> {
  const [snapshot, cascade] = await Promise.all([
    readRawSnapshot(jobId),
    readCssCascadeCapture(jobId),
  ]);
  if (!snapshot) throw new Error(`Base Layout Analyzer requires RawSnapshot for ${jobId}`);
  if (!cascade) throw new Error(`Base Layout Analyzer requires CssCascadeCapture for ${jobId}`);
  return analyzeSnapshotBaseLayout(snapshot, cascade);
}
