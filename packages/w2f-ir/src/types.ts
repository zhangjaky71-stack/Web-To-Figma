import type {
  NodeRelationships,
  NodeRevisionHashes,
  Rect,
  ScrollContainerInfo,
  StructuralFingerprint,
  WtfReferenceTileDescriptor,
  WtfResponsiveSnapshotRef,
  WtfRevision,
  WtfStateSnapshotRef,
  WtfTokenGraph,
} from "@w2f/w2f-schema";

export const WTF_IR_VERSION = "2.0.0" as const;

export type WtfIrVersion = typeof WTF_IR_VERSION;

export interface WtfDecisionEvidence {
  confidence: number;
  reasons: string[];
  sourceRefs?: string[];
}

export interface WtfStableIdentity {
  id: string;
  confidence: number;
  evidence: string[];
}

export type WtfSourceNodeKind =
  "document" | "element" | "text" | "pseudo" | "shadow-root" | "iframe" | "slot" | "comment";

export type WtfRenderNodeKind =
  | "document"
  | "section"
  | "container"
  | "text"
  | "image"
  | "vector"
  | "video-frame"
  | "canvas"
  | "table"
  | "row"
  | "cell"
  | "control"
  | "decoration"
  | "fallback";

export type WtfVisualState = "current" | "light" | "dark";

export type WtfAnimationCaptureMode = "freeze-current" | "reset-initial";

export interface WtfCaptureEnvironment {
  id: string;
  browserName: string;
  browserVersion: string;
  platform: string;
  language: string;
  direction: "ltr" | "rtl";
  colorScheme: "light" | "dark";
  reducedMotion: boolean;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  pageZoom: number;
  cssZoom?: number;
}

export interface WtfBoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WtfBoxModel {
  contentBox: Rect;
  paddingBox: Rect;
  borderBox: Rect;
  margin: WtfBoxEdges;
}

export interface WtfGeometry {
  bounds: Rect;
  box?: WtfBoxModel;
  transform?: readonly [number, number, number, number, number, number];
  transformOrigin?: { x: number; y: number };
  clipBounds?: Rect;
  containingBlockId?: string;
  scrollContainerId?: string;
  paintOrder?: number;
  zIndex?: number | "auto";
}

export type WtfCssLengthSemantic =
  | { type: "px"; value: number }
  | { type: "percent"; value: number }
  | { type: "em"; value: number }
  | { type: "rem"; value: number }
  | { type: "viewport"; unit: "vw" | "vh" | "vmin" | "vmax"; value: number }
  | { type: "keyword"; value: string }
  | { type: "expression"; raw: string };

export interface WtfCssLength {
  semantic: WtfCssLengthSemantic;
  resolvedPx?: number;
  authoredValue?: string;
}

export type WtfSizingMode = "fill" | "hug" | "fixed" | "intrinsic" | "content" | "unknown";

export interface WtfSizingDecision extends WtfDecisionEvidence {
  mode: WtfSizingMode;
  value?: WtfCssLength;
  min?: WtfCssLength;
  max?: WtfCssLength;
}

export interface WtfAxisSizing {
  width: WtfSizingDecision;
  height: WtfSizingDecision;
}

export interface WtfFlexItemModel {
  grow?: number;
  shrink?: number;
  basis?: WtfCssLength;
  alignSelf?: string;
  order?: number;
}

export interface WtfFlexContainerModel {
  direction: "row" | "row-reverse" | "column" | "column-reverse";
  wrap: "nowrap" | "wrap" | "wrap-reverse";
  justifyContent: string;
  alignItems: string;
  alignContent?: string;
  rowGap?: number;
  columnGap?: number;
}

export interface WtfGridTrack {
  authored: string;
  resolvedPx?: number;
  min?: WtfCssLength;
  max?: WtfCssLength;
}

export interface WtfGridContainerModel {
  columns: WtfGridTrack[];
  rows: WtfGridTrack[];
  autoFlow?: string;
  rowGap?: number;
  columnGap?: number;
}

export interface WtfGridItemModel {
  columnStart?: number | string;
  columnEnd?: number | string;
  rowStart?: number | string;
  rowEnd?: number | string;
}

export interface WtfAbsoluteConstraints {
  left?: WtfCssLength;
  right?: WtfCssLength;
  top?: WtfCssLength;
  bottom?: WtfCssLength;
}

export type WtfLayoutMode =
  "none" | "flow" | "flex" | "grid" | "absolute" | "table" | "inline" | "contents" | "unknown";

export interface WtfLayoutModel {
  mode: WtfLayoutMode;
  display: string;
  position: "static" | "relative" | "absolute" | "fixed" | "sticky" | string;
  sizing: WtfAxisSizing;
  padding?: WtfBoxEdges;
  effectiveGap?: { row: number; column: number };
  overflowX?: string;
  overflowY?: string;
  flexContainer?: WtfFlexContainerModel;
  flexItem?: WtfFlexItemModel;
  gridContainer?: WtfGridContainerModel;
  gridItem?: WtfGridItemModel;
  absoluteConstraints?: WtfAbsoluteConstraints;
  decision: WtfDecisionEvidence;
}

export interface WtfColor {
  r: number;
  g: number;
  b: number;
  a: number;
  colorSpace?: string;
}

export interface WtfGradientStop {
  offset: number;
  color: WtfColor;
}

export type WtfPaintFill =
  | { type: "solid"; color: WtfColor }
  | {
      type: "linear-gradient" | "radial-gradient" | "conic-gradient";
      angleDeg?: number;
      stops: WtfGradientStop[];
      authoredValue?: string;
    }
  | { type: "image"; assetId: string; fit?: string; authoredValue?: string };

export interface WtfBorderSide {
  width: number;
  style: string;
  color: WtfColor;
}

export interface WtfBorderModel {
  top?: WtfBorderSide;
  right?: WtfBorderSide;
  bottom?: WtfBorderSide;
  left?: WtfBorderSide;
  radius?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
}

export interface WtfShadow {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: WtfColor;
}

export interface WtfPaintModel {
  fills: WtfPaintFill[];
  border?: WtfBorderModel;
  shadows?: WtfShadow[];
  opacity: number;
  blendMode?: string;
  isolation?: string;
  filter?: string;
  backdropFilter?: string;
  maskImage?: string;
  clipPath?: string;
}

export interface WtfFontDescriptor {
  family: string;
  style?: string;
  weight?: number | string;
  stretch?: string;
  variationSettings?: string;
  featureSettings?: string;
  postscriptName?: string;
  sourceRef?: string;
  fingerprint?: string;
}

export interface WtfTextRun {
  start: number;
  end: number;
  text: string;
  font: WtfFontDescriptor;
  fontSize: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  color?: WtfColor;
  decoration?: string;
  baselineShift?: number;
  direction?: "ltr" | "rtl";
}

export interface WtfLineFragment {
  start: number;
  end: number;
  bounds: Rect;
  baseline: number;
  lineIndex: number;
}

export interface WtfTextModel {
  value: string;
  runs: WtfTextRun[];
  fragments: WtfLineFragment[];
  whiteSpace?: string;
  wordBreak?: string;
  overflowWrap?: string;
  textAlign?: string;
  direction?: "ltr" | "rtl";
  editableStrategyHint?: "editable" | "balanced" | "pixel";
}

export type WtfAssetKind =
  | "image"
  | "svg"
  | "font-metadata"
  | "canvas-raster"
  | "video-frame"
  | "fallback-raster"
  | "pixel-reference";

export interface WtfAssetProvenance {
  provider?: string;
  sourceUrl?: string;
  originalUrl?: string;
  stylesheetRef?: string;
  sourceNodeId?: string;
}

export interface WtfAssetRecord {
  id: string;
  kind: WtfAssetKind;
  mediaType: string;
  sha256?: string;
  embeddedPath?: string;
  byteLength?: number;
  width?: number;
  height?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  currentSrc?: string;
  authoredSrc?: string;
  provenance?: WtfAssetProvenance;
}

export interface WtfStyleSourceTrace {
  stylesheetRef?: string;
  selector?: string;
  ruleIndex?: number;
  inline?: boolean;
}

export interface WtfStyleDeclaration {
  property: string;
  computedValue: string;
  authoredValue?: string;
  important?: boolean;
  inherited?: boolean;
  source?: WtfStyleSourceTrace;
}

export interface WtfStyleRecord {
  id: string;
  declarations: WtfStyleDeclaration[];
  customProperties?: Record<string, string>;
  cascadeHash?: string;
}

export interface WtfSourceNode {
  captureNodeId: string;
  stableIdentity?: WtfStableIdentity;
  kind: WtfSourceNodeKind;
  relationships: NodeRelationships;
  childCaptureNodeIds: string[];
  tagName?: string;
  namespace?: string;
  role?: string;
  attributes?: Record<string, string>;
  sourceSelector?: string;
  pseudoType?: "before" | "after" | "marker" | string;
  textContent?: string;
  geometry?: WtfGeometry;
  styleRef?: string;
  textRef?: string;
  assetRefs?: string[];
  structuralFingerprint?: StructuralFingerprint;
  revisionHashes?: NodeRevisionHashes;
}

export interface WtfSourceGraph {
  rootCaptureNodeId: string;
  nodes: WtfSourceNode[];
  scrollContainers: ScrollContainerInfo[];
  revision: WtfRevision;
}

export type WtfRenderStrategy =
  "native" | "emulated" | "wrapper" | "absolute" | "raster" | "unsupported";

export interface WtfComponentCandidate {
  fingerprint: StructuralFingerprint;
  groupId?: string;
}

export interface WtfRenderNode {
  id: string;
  parentId?: string;
  childIds: string[];
  sourceNodeIds: string[];
  sourceStableIds?: string[];
  kind: WtfRenderNodeKind;
  name: string;
  geometry: WtfGeometry;
  layout: WtfLayoutModel;
  paint: WtfPaintModel;
  text?: WtfTextModel;
  assetRefs?: string[];
  renderStrategy: WtfRenderStrategy;
  renderDecision: WtfDecisionEvidence;
  componentCandidate?: WtfComponentCandidate;
  revisionHashes?: NodeRevisionHashes;
  diagnosticIds?: string[];
}

export interface WtfSectionOutlineItem {
  id: string;
  renderNodeId: string;
  name: string;
  kind?: string;
  childSectionIds: string[];
}

export interface WtfRenderTree {
  rootId: string;
  nodes: WtfRenderNode[];
  sections: WtfSectionOutlineItem[];
}

export interface WtfResponsiveRange {
  minWidth?: number;
  maxWidth?: number;
  value: unknown;
  snapshotIds: string[];
}

export interface WtfResponsiveRule extends WtfDecisionEvidence {
  targetStableNodeId: string;
  property: string;
  ranges: WtfResponsiveRange[];
}

export interface WtfMediaRuleTrace {
  query: string;
  activeInSnapshotIds: string[];
  affectedProperties: string[];
}

export interface WtfContainerQueryInfo {
  containerName?: string;
  containerType?: string;
  conditions: string[];
  affectedStableNodeIds: string[];
}

export interface WtfResponsivePayload {
  snapshots: WtfResponsiveSnapshotRef[];
  rules: WtfResponsiveRule[];
  mediaRules: WtfMediaRuleTrace[];
  containerQueries: WtfContainerQueryInfo[];
}

export interface WtfStateSnapshot extends WtfStateSnapshotRef {
  pseudoStates?: string[];
  visualState?: WtfVisualState;
  environmentRef?: string;
}

export interface WtfStatesPayload {
  states: WtfStateSnapshot[];
}

export type WtfDiagnosticDomain =
  | "SOURCE"
  | "PERMISSION"
  | "CAPTURE"
  | "DOM"
  | "CSS"
  | "TEXT"
  | "ASSET"
  | "RESPONSIVE"
  | "LAYOUT"
  | "COMPOSITING"
  | "FILE"
  | "FIGMA"
  | "FONT"
  | "RENDER"
  | "QA"
  | "PERFORMANCE"
  | "SECURITY";

export type WtfDiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export interface WtfDiagnostic {
  id: string;
  code: string;
  domain: WtfDiagnosticDomain;
  severity: WtfDiagnosticSeverity;
  message: string;
  sourceNodeIds?: string[];
  renderNodeIds?: string[];
  evidence?: string[];
  metadata?: Record<string, unknown>;
}

export interface WtfDiagnosticsPayload {
  diagnostics: WtfDiagnostic[];
}

export interface WtfStylesPayload {
  styles: WtfStyleRecord[];
}

export interface WtfAssetsPayload {
  assets: WtfAssetRecord[];
  referenceTiles: WtfReferenceTileDescriptor[];
}

export interface WtfDocumentPayload {
  irVersion: WtfIrVersion;
  documentId: string;
  captureId: string;
  revisionId: string;
  sourceFingerprint: string;
  sourceGraphRootId: string;
  renderTreeRootId: string;
  environmentRefs: string[];
  environments: WtfCaptureEnvironment[];
  animationCaptureMode: WtfAnimationCaptureMode;
  visualState: WtfVisualState;
}

export interface WtfIrBundle {
  document: WtfDocumentPayload;
  sourceGraph: WtfSourceGraph;
  renderTree: WtfRenderTree;
  styles: WtfStylesPayload;
  assets: WtfAssetsPayload;
  responsive: WtfResponsivePayload;
  states: WtfStatesPayload;
  diagnostics: WtfDiagnosticsPayload;
  tokens: WtfTokenGraph;
}

export interface WtfIrEnvelope {
  irVersion: WtfIrVersion;
  bundle: WtfIrBundle;
}

export interface WtfIrValidationError {
  path: string;
  code: string;
  message: string;
}

export type WtfIrValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: WtfIrValidationError[] };

export interface WtfIrMigrationResult {
  migrated: boolean;
  fromVersion: string;
  toVersion: WtfIrVersion;
  envelope: WtfIrEnvelope;
}
