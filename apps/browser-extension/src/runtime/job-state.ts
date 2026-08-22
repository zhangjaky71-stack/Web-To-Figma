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

export interface CaptureJobState {
  jobId: string;
  mode: CaptureJobMode;
  status: CaptureJobStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  tabId?: number;
  page?: PageProbe;
  error?: string;
}

const TERMINAL_STATUSES = new Set<CaptureJobStatus>(["completed", "failed", "cancelled"]);

function canonicalTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("invalid job timestamp");
  return date.toISOString();
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
  patch: Pick<CaptureJobState, "tabId" | "page" | "error"> = {},
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
    ...(patch.page === undefined ? {} : { page: patch.page }),
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
    typeof record.updatedAt === "string"
  );
}
