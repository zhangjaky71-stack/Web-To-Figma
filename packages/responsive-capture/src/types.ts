import type { WtfResponsiveSnapshotRef } from "@w2f/w2f-schema";

export const RESPONSIVE_CAPTURE_VERSION = "1.0.0" as const;
export const RESPONSIVE_COMMON_WIDTHS = [1440, 1280, 1024, 768, 390] as const;
export const RESPONSIVE_DEFAULT_WIDTHS = [1440, 768, 390] as const;
export const RESPONSIVE_MAX_VIEWPORTS = 8 as const;

export type ResponsiveCaptureVersion = typeof RESPONSIVE_CAPTURE_VERSION;
export type ResponsiveCaptureMode = "current" | "common" | "custom";
export type ResponsiveViewportSource = "current" | "synthetic";

export interface ResponsiveViewportContext {
  width: number;
  height: number;
  dpr: number;
}

export interface ResponsiveViewportRequest {
  width: number;
  height?: number;
  dpr?: number;
}

export type ResponsiveCaptureRequest =
  | { mode: "current" }
  | { mode: "common" }
  | { mode: "custom"; viewports: ResponsiveViewportRequest[] };

export interface ResponsiveViewportPlan extends ResponsiveViewportContext {
  id: string;
  source: ResponsiveViewportSource;
}

export interface ResponsiveSnapshotArtifactRefs {
  rawSnapshot: string;
  cssCascade?: string;
  environment: string;
  assets?: string;
  pixelGroundTruth?: string;
}

export interface ResponsiveStableNodeEvidence {
  captureNodeId: string;
  stableNodeId: string;
  confidence: number;
  signatureHash: string;
  sourceParentCaptureNodeId?: string;
  sourceParentStableNodeId?: string;
}

export interface ResponsiveSnapshotInput {
  plan: ResponsiveViewportPlan;
  ref: WtfResponsiveSnapshotRef;
  artifactId: string;
  artifacts: ResponsiveSnapshotArtifactRefs;
  stableNodes: ResponsiveStableNodeEvidence[];
}

export type ResponsiveSnapshotEvidence = ResponsiveSnapshotInput;

export interface ResponsiveCaptureDiagnostic {
  code:
    | "RESPONSIVE_REQUEST_INVALID"
    | "RESPONSIVE_VIEWPORT_LIMIT_EXCEEDED"
    | "RESPONSIVE_VIEWPORT_UNSUPPORTED"
    | "RESPONSIVE_CAPTURE_FAILED"
    | "RESPONSIVE_DIMENSION_MISMATCH"
    | "RESPONSIVE_STABLE_IDENTITY_FAILED"
    | "RESPONSIVE_CAPTURE_CANCELLED";
  message: string;
  viewportId?: string;
  sourceNodeId?: string;
}

export interface ResponsiveCapture {
  version: ResponsiveCaptureVersion;
  mode: ResponsiveCaptureMode;
  baseViewport: ResponsiveViewportContext;
  plannedViewports: ResponsiveViewportPlan[];
  snapshots: ResponsiveSnapshotEvidence[];
  diagnostics: ResponsiveCaptureDiagnostic[];
}

export interface ResponsiveCaptureSummary {
  version: ResponsiveCaptureVersion;
  mode: ResponsiveCaptureMode;
  plannedViewportCount: number;
  capturedSnapshotCount: number;
  stableNodeEvidenceCount: number;
  diagnosticCount: number;
}
