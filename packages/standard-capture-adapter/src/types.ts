import type { RawCaptureTarget, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeAcquisition } from "@w2f/css-cascade";

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
