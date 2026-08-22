import type { SourceCapability } from "@w2f/source-providers";
import type { CaptureJobMode, CaptureJobState, PageProbe } from "./job-state.js";
import {
  isRegionSelectionResult,
  type RegionSelectionResult,
} from "./region-selection.js";

export const W2F_EXTENSION_SHELL_VERSION = "1.1.0" as const;
export const W2F_JOB_STORAGE_KEY = "w2f.captureJob.v1" as const;

export type W2fShellRequest =
  | { type: "W2F_GET_SHELL_INFO" }
  | { type: "W2F_GET_SOURCE_CAPABILITY" }
  | { type: "W2F_GET_JOB_STATE" }
  | { type: "W2F_START_JOB"; mode: CaptureJobMode }
  | { type: "W2F_CANCEL_JOB"; jobId: string };

export type W2fContentRequest =
  | { type: "W2F_PROBE_PAGE"; jobId: string }
  | { type: "W2F_SELECT_REGION"; jobId: string }
  | { type: "W2F_CANCEL_REGION_SELECTION"; jobId: string };

export type W2fContentResponse =
  | {
      type: "W2F_CONTENT_PROBE_RESULT";
      jobId: string;
      page: PageProbe;
    }
  | {
      type: "W2F_CONTENT_REGION_RESULT";
      jobId: string;
      page: PageProbe;
      region: RegionSelectionResult;
    }
  | {
      type: "W2F_CONTENT_SELECTION_CANCELLED";
      jobId: string;
    };

export interface W2fShellInfo {
  shellVersion: typeof W2F_EXTENSION_SHELL_VERSION;
  manifestVersion: 3;
  captureImplemented: false;
  regionSelectionImplemented: true;
}

export type W2fShellResponseData = W2fShellInfo | SourceCapability | CaptureJobState | null;

export type W2fShellResponse =
  | { ok: true; requestType: W2fShellRequest["type"]; data: W2fShellResponseData }
  | { ok: false; requestType: string; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageProbe(value: unknown): value is PageProbe {
  if (!isRecord(value)) return false;
  return (
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    [
      value.documentWidth,
      value.documentHeight,
      value.viewportWidth,
      value.viewportHeight,
      value.devicePixelRatio,
    ].every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function isW2fShellRequest(value: unknown): value is W2fShellRequest {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "W2F_GET_SHELL_INFO":
    case "W2F_GET_SOURCE_CAPABILITY":
    case "W2F_GET_JOB_STATE":
      return true;
    case "W2F_START_JOB":
      return value.mode === "full-page" || value.mode === "region";
    case "W2F_CANCEL_JOB":
      return typeof value.jobId === "string" && value.jobId.length > 0;
    default:
      return false;
  }
}

export function isW2fContentResponse(value: unknown): value is W2fContentResponse {
  if (!isRecord(value) || typeof value.jobId !== "string" || value.jobId.length === 0) {
    return false;
  }
  switch (value.type) {
    case "W2F_CONTENT_PROBE_RESULT":
      return isPageProbe(value.page);
    case "W2F_CONTENT_REGION_RESULT":
      return isPageProbe(value.page) && isRegionSelectionResult(value.region);
    case "W2F_CONTENT_SELECTION_CANCELLED":
      return true;
    default:
      return false;
  }
}

export function isW2fShellResponse(value: unknown): value is W2fShellResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.requestType !== "string") {
    return false;
  }
  return value.ok ? "data" in value : typeof value.error === "string";
}

export function shellSuccess(
  requestType: W2fShellRequest["type"],
  data: W2fShellResponseData,
): W2fShellResponse {
  return { ok: true, requestType, data };
}

export function shellFailure(requestType: string, error: unknown): W2fShellResponse {
  return {
    ok: false,
    requestType,
    error: error instanceof Error ? error.message : String(error),
  };
}
