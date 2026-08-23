import type { RawSnapshotSummary } from "@w2f/capture-core";
import type { SourceDescriptor } from "@w2f/source-providers";
import { isRegionSelectionResult, type RegionSelectionResult } from "./region-selection.js";

export type CaptureJobMode = "full-page" | "region";

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
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
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
      (typeof record.cssCascadeStorageKey === "string" && record.cssCascadeStorageKey.length > 0)) &&
    (record.cssCascadeAdapter === undefined ||
      record.cssCascadeAdapter === "standard" ||
      record.cssCascadeAdapter === "cdp") &&
    isOptionalNonNegativeInteger(record.cssStyleCount) &&
    isOptionalNonNegativeInteger(record.cssTokenCount) &&
    isOptionalNonNegativeInteger(record.cssCascadeDiagnosticCount)
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
  patch: Pick<CaptureJobState, "tabId" | "source" | "page" | "region" | "capture" | "error"> = {},
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
    ...(patch.error === undefined ? {} : { error: patch.error }),
  };
}

export function isCaptureJobState(value: unknown): value is CaptureJobState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.jobId === "string" &&
    (record.mode === "full-page" || record.mode === "region") &&
    typeof record.status === "string" &&
    ["idle", "queued", "running", "completed", "failed", "cancelled"].includes(record.status) &&
    typeof record.phase === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.source === undefined || isSourceDescriptor(record.source)) &&
    (record.region === undefined || isRegionSelectionResult(record.region)) &&
    (record.capture === undefined || isCaptureSnapshotReceipt(record.capture))
  );
}
