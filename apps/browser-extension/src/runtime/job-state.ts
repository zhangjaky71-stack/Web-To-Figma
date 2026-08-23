import type { RawSnapshotSummary } from "@w2f/capture-core";
import type { ResponsiveCaptureMode, ResponsiveViewportPlan } from "@w2f/responsive-capture";
import type { SourceDescriptor } from "@w2f/source-providers";
import { isRegionSelectionResult, type RegionSelectionResult } from "./region-selection.js";

export type CaptureJobMode = "full-page" | "region" | "responsive";

export type CaptureJobStatus = "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PageProbe {
  url: string;
  title: string;
  documentWidth: number;
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface CaptureSnapshotReceipt extends RawSnapshotSummary {
  storageKey: string;
  capturedAt: string;
  referenceScreenshotKey?: string;
  fallbackFromCdp?: boolean;
  cssCascadeStorageKey?: string;
  cssCascadeAdapter?: "standard" | "cdp";
  cssStyleCount?: number;
  cssTokenCount?: number;
  cssCascadeDiagnosticCount?: number;
  environmentStorageKey?: string;
  environmentAdapter?: "standard" | "cdp";
  mediaRuleCount?: number;
  activeMediaRuleCount?: number;
  containerCount?: number;
  containerQueryCount?: number;
  environmentDiagnosticCount?: number;
  assetStorageKey?: string;
  assetAdapter?: "standard" | "cdp";
  assetCount?: number;
  assetReferenceCount?: number;
  assetDeduplicatedReferenceCount?: number;
  assetUniqueByteCount?: number;
  assetDiagnosticCount?: number;
  pixelGroundTruthStorageKey?: string;
  pixelGroundTruthAdapter?: "standard" | "cdp";
  rasterReferenceCount?: number;
  rasterTileReferenceCount?: number;
  rasterUniqueTileCount?: number;
  rasterUniqueByteCount?: number;
  rasterDiagnosticCount?: number;
}

export interface ResponsiveCaptureReceipt {
  storageKey: string;
  mode: ResponsiveCaptureMode;
  plannedViewportCount: number;
  capturedSnapshotCount: number;
  stableNodeEvidenceCount: number;
  diagnosticCount: number;
  viewportWidths: number[];
  inferenceStorageKey: string;
  responsiveRuleCount: number;
  breakpointCandidateCount: number;
  responsiveSizingDecisionCount: number;
  responsiveInferenceDiagnosticCount: number;
}

export interface CaptureJobState {
  jobId: string;
  mode: CaptureJobMode;
  status: CaptureJobStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  tabId?: number;
  source?: SourceDescriptor;
  page?: PageProbe;
  region?: RegionSelectionResult;
  capture?: CaptureSnapshotReceipt;
  responsivePlan?: ResponsiveViewportPlan[];
  responsive?: ResponsiveCaptureReceipt;
  error?: string;
}

const TERMINAL_STATUSES = new Set<CaptureJobStatus>(["completed", "failed", "cancelled"]);

function canonicalTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("invalid job timestamp");
  return date.toISOString();
}

function isSourceDescriptor(value: unknown): value is SourceDescriptor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    ["http-page", "file-tab", "local-folder"].includes(String(record.provider)) &&
    ["http", "file", "local-folder"].includes(String(record.sourceType)) &&
    typeof record.baseLocator === "string" &&
    typeof record.displayName === "string" &&
    typeof record.offline === "boolean"
  );
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return (
    value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function isCaptureSnapshotReceipt(value: unknown): value is CaptureSnapshotReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === "1.0.0" &&
    (record.adapter === "standard" || record.adapter === "cdp") &&
    [
      record.nodeCount,
      record.frameCount,
      record.scrollContainerCount,
      record.diagnosticCount,
    ].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0) &&
    typeof record.storageKey === "string" &&
    record.storageKey.length > 0 &&
    typeof record.capturedAt === "string" &&
    !Number.isNaN(Date.parse(record.capturedAt)) &&
    (record.referenceScreenshotKey === undefined ||
      (typeof record.referenceScreenshotKey === "string" &&
        record.referenceScreenshotKey.length > 0)) &&
    (record.fallbackFromCdp === undefined || typeof record.fallbackFromCdp === "boolean") &&
    (record.cssCascadeStorageKey === undefined ||
      (typeof record.cssCascadeStorageKey === "string" &&
        record.cssCascadeStorageKey.length > 0)) &&
    (record.cssCascadeAdapter === undefined ||
      record.cssCascadeAdapter === "standard" ||
      record.cssCascadeAdapter === "cdp") &&
    isOptionalNonNegativeInteger(record.cssStyleCount) &&
    isOptionalNonNegativeInteger(record.cssTokenCount) &&
    isOptionalNonNegativeInteger(record.cssCascadeDiagnosticCount) &&
    (record.environmentStorageKey === undefined ||
      (typeof record.environmentStorageKey === "string" &&
        record.environmentStorageKey.length > 0)) &&
    (record.environmentAdapter === undefined ||
      record.environmentAdapter === "standard" ||
      record.environmentAdapter === "cdp") &&
    isOptionalNonNegativeInteger(record.mediaRuleCount) &&
    isOptionalNonNegativeInteger(record.activeMediaRuleCount) &&
    isOptionalNonNegativeInteger(record.containerCount) &&
    isOptionalNonNegativeInteger(record.containerQueryCount) &&
    isOptionalNonNegativeInteger(record.environmentDiagnosticCount) &&
    (record.assetStorageKey === undefined ||
      (typeof record.assetStorageKey === "string" && record.assetStorageKey.length > 0)) &&
    (record.assetAdapter === undefined ||
      record.assetAdapter === "standard" ||
      record.assetAdapter === "cdp") &&
    isOptionalNonNegativeInteger(record.assetCount) &&
    isOptionalNonNegativeInteger(record.assetReferenceCount) &&
    isOptionalNonNegativeInteger(record.assetDeduplicatedReferenceCount) &&
    isOptionalNonNegativeInteger(record.assetUniqueByteCount) &&
    isOptionalNonNegativeInteger(record.assetDiagnosticCount) &&
    (record.pixelGroundTruthStorageKey === undefined ||
      (typeof record.pixelGroundTruthStorageKey === "string" &&
        record.pixelGroundTruthStorageKey.length > 0)) &&
    (record.pixelGroundTruthAdapter === undefined ||
      record.pixelGroundTruthAdapter === "standard" ||
      record.pixelGroundTruthAdapter === "cdp") &&
    isOptionalNonNegativeInteger(record.rasterReferenceCount) &&
    isOptionalNonNegativeInteger(record.rasterTileReferenceCount) &&
    isOptionalNonNegativeInteger(record.rasterUniqueTileCount) &&
    isOptionalNonNegativeInteger(record.rasterUniqueByteCount) &&
    isOptionalNonNegativeInteger(record.rasterDiagnosticCount)
  );
}

function isResponsiveViewportPlan(value: unknown): value is ResponsiveViewportPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    typeof record.height === "number" &&
    Number.isFinite(record.height) &&
    typeof record.dpr === "number" &&
    Number.isFinite(record.dpr) &&
    (record.source === "current" || record.source === "synthetic")
  );
}

function isResponsiveCaptureReceipt(value: unknown): value is ResponsiveCaptureReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.storageKey === "string" &&
    record.storageKey.length > 0 &&
    (record.mode === "current" || record.mode === "common" || record.mode === "custom") &&
    isOptionalNonNegativeInteger(record.plannedViewportCount) &&
    isOptionalNonNegativeInteger(record.capturedSnapshotCount) &&
    isOptionalNonNegativeInteger(record.stableNodeEvidenceCount) &&
    isOptionalNonNegativeInteger(record.diagnosticCount) &&
    Array.isArray(record.viewportWidths) &&
    record.viewportWidths.every(
      (width) => typeof width === "number" && Number.isSafeInteger(width) && width > 0,
    ) &&
    typeof record.inferenceStorageKey === "string" &&
    record.inferenceStorageKey.length > 0 &&
    isOptionalNonNegativeInteger(record.responsiveRuleCount) &&
    isOptionalNonNegativeInteger(record.breakpointCandidateCount) &&
    isOptionalNonNegativeInteger(record.responsiveSizingDecisionCount) &&
    isOptionalNonNegativeInteger(record.responsiveInferenceDiagnosticCount)
  );
}

export function createCaptureJob(
  mode: CaptureJobMode,
  jobId: string,
  now: string | Date = new Date(),
): CaptureJobState {
  if (!jobId.trim()) throw new TypeError("jobId must be non-empty");
  const timestamp = canonicalTimestamp(now);
  return {
    jobId,
    mode,
    status: "queued",
    phase: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isTerminalJobStatus(status: CaptureJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function transitionCaptureJob(
  current: CaptureJobState,
  next: CaptureJobStatus,
  phase: string,
  now: string | Date = new Date(),
  patch: Pick<
    CaptureJobState,
    "tabId" | "source" | "page" | "region" | "capture" | "responsivePlan" | "responsive" | "error"
  > = {},
): CaptureJobState {
  if (isTerminalJobStatus(current.status)) {
    throw new TypeError(`cannot transition terminal job ${current.jobId} from ${current.status}`);
  }
  if (!phase.trim()) throw new TypeError("job phase must be non-empty");

  return {
    ...current,
    status: next,
    phase,
    updatedAt: canonicalTimestamp(now),
    ...(patch.tabId === undefined ? {} : { tabId: patch.tabId }),
    ...(patch.source === undefined ? {} : { source: patch.source }),
    ...(patch.page === undefined ? {} : { page: patch.page }),
    ...(patch.region === undefined ? {} : { region: patch.region }),
    ...(patch.capture === undefined ? {} : { capture: patch.capture }),
    ...(patch.responsivePlan === undefined
      ? {}
      : { responsivePlan: patch.responsivePlan.map((item) => ({ ...item })) }),
    ...(patch.responsive === undefined ? {} : { responsive: patch.responsive }),
    ...(patch.error === undefined ? {} : { error: patch.error }),
  };
}

export function isCaptureJobState(value: unknown): value is CaptureJobState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.jobId === "string" &&
    (record.mode === "full-page" || record.mode === "region" || record.mode === "responsive") &&
    typeof record.status === "string" &&
    ["idle", "queued", "running", "completed", "failed", "cancelled"].includes(record.status) &&
    typeof record.phase === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.source === undefined || isSourceDescriptor(record.source)) &&
    (record.region === undefined || isRegionSelectionResult(record.region)) &&
    (record.capture === undefined || isCaptureSnapshotReceipt(record.capture)) &&
    (record.responsivePlan === undefined ||
      (Array.isArray(record.responsivePlan) &&
        record.responsivePlan.every(isResponsiveViewportPlan))) &&
    (record.responsive === undefined || isResponsiveCaptureReceipt(record.responsive))
  );
}
