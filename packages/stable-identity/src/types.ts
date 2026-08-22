import type { WtfSourceNode, WtfStableIdentity } from "@w2f/w2f-ir";
import type { WtfDocumentIdentity } from "@w2f/w2f-schema";

export type StableSourceType = "http" | "file" | "local-folder" | "unknown";

export interface DocumentIdentityInput {
  sourceType: StableSourceType;
  sourceUrl?: string;
  sourceKey?: string;
  rootStructuralFingerprint?: string;
}

export interface StableDocumentIdentity {
  documentId: string;
  sourceFingerprint: string;
  normalizedSourceLocator: string;
}

export interface CaptureIdentityInput {
  documentId: string;
  capturedAt: string;
  captureNonce: string;
}

export interface StableCaptureIdentity {
  captureId: string;
  capturedAt: string;
}

export interface RevisionIdentityInput {
  document: StableDocumentIdentity;
  capture: StableCaptureIdentity;
  revisionNonce?: string;
  parentRevisionId?: string;
}

export interface StableAncestrySegment {
  tagName: string;
  role?: string;
  idAttribute?: string;
  dataAttributes?: Readonly<Record<string, string>>;
  classList?: readonly string[];
}

export interface StableStructuralPosition {
  siblingIndex: number;
  sameKindIndex?: number;
  documentOrder?: number;
}

export interface StableIdentityNodeInput {
  captureNodeId: string;
  documentId: string;
  sourceOrigin?: string;
  namespace?: string;
  tagName: string;
  role?: string;
  idAttribute?: string;
  dataAttributes?: Readonly<Record<string, string>>;
  classList?: readonly string[];
  ancestry?: readonly StableAncestrySegment[];
  structuralPosition: StableStructuralPosition;
  textContent?: string;
  assetFingerprints?: readonly string[];
}

export interface StableIdentitySignals {
  documentId: string;
  sourceOrigin?: string;
  tagName: string;
  namespace?: string;
  role?: string;
  stableIdAttribute?: string;
  stableDataAttributes: readonly string[];
  meaningfulClasses: readonly string[];
  ancestry: readonly string[];
  normalizedText?: string;
  assetFingerprints: readonly string[];
  structuralPosition: StableStructuralPosition;
  usesStructuralFallback: boolean;
}

export interface StableIdentityAssignment {
  captureNodeId: string;
  identity: WtfStableIdentity;
  signatureHash: string;
  signals: StableIdentitySignals;
}

export interface StableMappedNode {
  captureNodeId: string;
  stableIdentity: WtfStableIdentity;
}

export type StableMappingStatus = "matched" | "added" | "removed" | "ambiguous";

export interface StableNodeMapping {
  stableNodeId: string;
  status: StableMappingStatus;
  previousCaptureNodeIds: string[];
  currentCaptureNodeIds: string[];
  confidence: number;
}

export interface StableSourceMappingResult {
  mappings: StableNodeMapping[];
  matched: number;
  added: number;
  removed: number;
  ambiguous: number;
}

export interface ApplyIdentityResult {
  nodes: WtfSourceNode[];
  unmappedCaptureNodeIds: string[];
  unusedAssignments: string[];
}

export interface StableRevisionIdentity {
  manifestIdentity: WtfDocumentIdentity;
  revisionId: string;
}
