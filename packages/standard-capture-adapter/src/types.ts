import type { RawCaptureTarget, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeAcquisition } from "@w2f/css-cascade";
import type {
  EnvironmentCapture,
  EnvironmentCaptureAdapter,
  EnvironmentEvidenceAvailability,
} from "@w2f/environment-capture";

export const STANDARD_CAPTURE_ADAPTER_VERSION = "1.0.0" as const;

export interface StandardCaptureInput {
  captureTarget: RawCaptureTarget;
  maxNodes?: number;
  includeComments?: boolean;
}

export interface StandardCaptureResult {
  snapshot: RawSnapshot;
}

export interface StandardCascadeFrameHint {
  frameId: string;
  parentFrameId?: string;
  url?: string;
  ownerSourceNodeId?: string;
}

export interface StandardCascadeTargetHint {
  sourceNodeId: string;
  frameId: string;
  sourceSelector?: string;
  shadowHostSourceNodeId?: string;
  pseudoType?: string;
  pseudoHostSourceNodeId?: string;
}

export interface StandardCascadeInput {
  frames: StandardCascadeFrameHint[];
  targets: StandardCascadeTargetHint[];
  maxRules?: number;
  maxDeclarations?: number;
}

export interface StandardCascadeResult {
  acquisition: CssCascadeAcquisition;
}

export interface StandardEnvironmentScaleInput {
  pageZoom?: number;
  pageZoomAvailability: EnvironmentEvidenceAvailability;
  visualViewportScale?: number;
  cssZoom?: number;
  cssZoomAvailability: EnvironmentEvidenceAvailability;
}

export interface StandardEnvironmentInput {
  adapter: EnvironmentCaptureAdapter;
  snapshotId: string;
  frames: StandardCascadeFrameHint[];
  targets: StandardCascadeTargetHint[];
  scale: StandardEnvironmentScaleInput;
  maxRules?: number;
  maxDeclarations?: number;
}

export interface StandardEnvironmentResult {
  capture: EnvironmentCapture;
}
