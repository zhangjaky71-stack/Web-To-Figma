import type { NodeRelationships, Rect, ScrollContainerInfo } from "@w2f/w2f-schema";
import type { FrameContext } from "@w2f/w2f-schema/frame-context";

export const RAW_SNAPSHOT_VERSION = "1.0.0" as const;

export type RawSnapshotVersion = typeof RAW_SNAPSHOT_VERSION;
export type RawCaptureAdapter = "standard" | "cdp";
export type RawNodeKind =
  | "document"
  | "element"
  | "text"
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

export interface RawCaptureEnvironment {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  visualViewportScale?: number;
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
