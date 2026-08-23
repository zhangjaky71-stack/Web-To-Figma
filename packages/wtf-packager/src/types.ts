import type {
  CaptureTarget,
  WtfChecksums,
  WtfFeatureSet,
  WtfFileDescriptor,
  WtfFileRole,
  WtfManifest,
  WtfSecurityLimits,
} from "@w2f/w2f-schema";

export const WTF_PACKAGER_VERSION = "1.0.0" as const;
export const WTF_MANIFEST_PATH = "manifest.json" as const;
export const WTF_CHECKSUMS_PATH = "checksums.json" as const;

export interface WtfPackageIdentityInput {
  documentId: string;
  captureId: string;
  sourceFingerprint: string;
  capturedAt: string;
  revisionId?: string;
  parentRevisionId?: string;
}

export interface WtfPackageCompatibilityInput {
  writerVersion: string;
  minReaderVersion: string;
  capabilities: string[];
  assetCodecVersion?: string;
}

export interface WtfPackageJsonPayload {
  path: string;
  role: WtfFileRole | string;
  mediaType?: "application/json";
  json: unknown;
}

export interface WtfPackageBinaryPayload {
  path: string;
  role: WtfFileRole | string;
  mediaType: string;
  bytes: Uint8Array;
}

export type WtfPackagePayload = WtfPackageJsonPayload | WtfPackageBinaryPayload;

export interface WtfPackagerInput {
  filenameBase: string;
  identity: WtfPackageIdentityInput;
  captureTarget: CaptureTarget;
  compatibility: WtfPackageCompatibilityInput;
  features: WtfFeatureSet;
  payloads: WtfPackagePayload[];
  referenceTilesPath?: string;
  securityLimits?: WtfSecurityLimits;
}

export interface WtfPackagedEntry {
  path: string;
  mediaType: string;
  role: string;
  bytes: Uint8Array;
  sha256?: string;
}

export interface WtfPackageResult {
  version: typeof WTF_PACKAGER_VERSION;
  filename: string;
  mimeType: "application/x-wtf";
  manifest: WtfManifest;
  checksums: WtfChecksums;
  files: WtfFileDescriptor[];
  entries: WtfPackagedEntry[];
  bytes: Uint8Array;
  sha256: string;
}

export interface WtfPackageSummary {
  version: typeof WTF_PACKAGER_VERSION;
  filename: string;
  payloadCount: number;
  archiveEntryCount: number;
  archiveByteCount: number;
  jsonPayloadCount: number;
  binaryPayloadCount: number;
  assetPayloadCount: number;
  referencePayloadCount: number;
  fallbackPayloadCount: number;
  archiveSha256: string;
}
