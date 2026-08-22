import type { NodeRelationships, Rect, ScrollContainerInfo } from "@w2f/w2f-schema";
import type { FrameContext } from "@w2f/w2f-schema/frame-context";
import type { ScaleContextEvidence } from "@w2f/w2f-schema/scale-context";

export const RAW_SNAPSHOT_VERSION = "1.0.0" as const;

export type RawSnapshotVersion = typeof RAW_SNAPSHOT_VERSION;
export type RawCaptureAdapter = "standard" | "cdp";
export type RawNodeKind =
  | "document"
  | "element"
  | "text"
  | "pseudo"
  | "shadow-root"
  | "iframe"
  | "slot"
  | "comment";

export interface RawVisibilityEvidence {
  display: string;
  visibility: string;
  contentVisibility?: string;
  opacity: number;
  hiddenAttribute: boolean;
  rendered: boolean;
}

export interface RawGeometry {
  bounds: Rect;
  clientRects?: Rect[];
  scrollContainerId?: string;
}

export interface RawSourceReference {
  tagName?: string;
  namespace?: string;
  role?: string;
  attributes?: Record<string, string>;
  sourceSelector?: string;
  backendNodeId?: number;
  pseudoType?: string;
}

export interface RawFontEvidence {
  family: string;
  style?: string;
  weight?: number | string;
  stretch?: string;
  variationSettings?: string;
  featureSettings?: string;
}

export interface RawTextRunEvidence {
  start: number;
  end: number;
  text: string;
  font: RawFontEvidence;
  fontSize: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  color?: string;
  decoration?: string;
  baselineShift?: number;
  direction?: "ltr" | "rtl";
}

export type RawBaselineSource = "font-metrics" | "line-box-estimate" | "cdp-layout-estimate";

export interface RawTextFragmentEvidence {
  start: number;
  end: number;
  bounds: Rect;
  baseline: number;
  baselineSource: RawBaselineSource;
  baselineConfidence: number;
  lineIndex: number;
}

export interface RawTextEvidence {
  value: string;
  runs: RawTextRunEvidence[];
  fragments: RawTextFragmentEvidence[];
  whiteSpace?: string;
  wordBreak?: string;
  overflowWrap?: string;
  textAlign?: string;
  direction?: "ltr" | "rtl";
  writingMode?: string;
}

export interface RawInlineEvidence {
  display: string;
  writingMode: string;
  verticalAlign?: string;
  fragmentBounds: Rect[];
}

export interface RawPseudoEvidence {
  type: string;
  content: string;
  contentKind: "none" | "text" | "complex";
  generatedText?: string;
}

export interface RawFormVisualEvidence {
  controlKind: "input" | "textarea" | "select" | "button" | "progress" | "meter" | "output";
  inputType?: string;
  disabled: boolean;
  readOnly?: boolean;
  required?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  multiple?: boolean;
  placeholder?: string;
  appearance?: string;
  accentColor?: string;
  textValueCapture: "not-applicable" | "omitted-sensitive";
}

export interface RawNode {
  captureNodeId: string;
  kind: RawNodeKind;
  relationships: NodeRelationships;
  childCaptureNodeIds: string[];
  frameContext: FrameContext;
  source: RawSourceReference;
  geometry?: RawGeometry;
  visibility?: RawVisibilityEvidence;
  textContent?: string;
  text?: RawTextEvidence;
  inline?: RawInlineEvidence;
  pseudo?: RawPseudoEvidence;
  formVisual?: RawFormVisualEvidence;
  paintOrder?: number;
}

export interface RawFrameRecord {
  context: FrameContext;
  rootCaptureNodeId?: string;
  accessible: boolean;
  inaccessibleReason?: string;
}

export interface RawCaptureExclusion {
  kind: "redact" | "exclude";
  bounds: Rect;
}

export type RawCaptureTarget =
  | { type: "document" }
  | {
      type: "region";
      bounds: Rect;
      exclusions: RawCaptureExclusion[];
    };

export interface RawLayoutMetricsEvidence {
  contentSize?: Rect;
  layoutViewport?: {
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
  };
  visualViewport?: {
    offsetX: number;
    offsetY: number;
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
    scale: number;
    zoom?: number;
  };
}

export interface RawCaptureEnvironment {
  viewportWidth: number;
  viewportHeight: number;
  scale: ScaleContextEvidence;
  layoutMetrics?: RawLayoutMetricsEvidence;
}

export interface RawCaptureDiagnostic {
  code: string;
  message: string;
  frameId?: string;
  sourceNodeId?: string;
}

export interface RawSnapshot {
  version: RawSnapshotVersion;
  adapter: RawCaptureAdapter;
  capturedAt: string;
  url: string;
  title: string;
  rootCaptureNodeId: string;
  captureTarget: RawCaptureTarget;
  environment: RawCaptureEnvironment;
  nodes: RawNode[];
  frames: RawFrameRecord[];
  scrollContainers: ScrollContainerInfo[];
  diagnostics: RawCaptureDiagnostic[];
}

export interface RawSnapshotSummary {
  version: RawSnapshotVersion;
  adapter: RawCaptureAdapter;
  nodeCount: number;
  frameCount: number;
  scrollContainerCount: number;
  diagnosticCount: number;
}
