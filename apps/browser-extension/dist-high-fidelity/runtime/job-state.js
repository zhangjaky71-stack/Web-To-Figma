import { isRegionSelectionResult } from "./region-selection.js";
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
function canonicalTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new TypeError("invalid job timestamp");
    return date.toISOString();
}
function isSourceDescriptor(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (["http-page", "file-tab", "local-folder"].includes(String(record.provider)) &&
        ["http", "file", "local-folder"].includes(String(record.sourceType)) &&
        typeof record.baseLocator === "string" &&
        typeof record.displayName === "string" &&
        typeof record.offline === "boolean");
}
function isCaptureSnapshotReceipt(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (record.version === "1.0.0" &&
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
        (record.fallbackFromCdp === undefined || typeof record.fallbackFromCdp === "boolean"));
}
export function createCaptureJob(mode, jobId, now = new Date()) {
    if (!jobId.trim())
        throw new TypeError("jobId must be non-empty");
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
export function isTerminalJobStatus(status) {
    return TERMINAL_STATUSES.has(status);
}
export function transitionCaptureJob(current, next, phase, now = new Date(), patch = {}) {
    if (isTerminalJobStatus(current.status)) {
        throw new TypeError(`cannot transition terminal job ${current.jobId} from ${current.status}`);
    }
    if (!phase.trim())
        throw new TypeError("job phase must be non-empty");
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
export function isCaptureJobState(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (typeof record.jobId === "string" &&
        (record.mode === "full-page" || record.mode === "region") &&
        typeof record.status === "string" &&
        ["idle", "queued", "running", "completed", "failed", "cancelled"].includes(record.status) &&
        typeof record.phase === "string" &&
        typeof record.createdAt === "string" &&
        typeof record.updatedAt === "string" &&
        (record.source === undefined || isSourceDescriptor(record.source)) &&
        (record.region === undefined || isRegionSelectionResult(record.region)) &&
        (record.capture === undefined || isCaptureSnapshotReceipt(record.capture)));
}
//# sourceMappingURL=job-state.js.map