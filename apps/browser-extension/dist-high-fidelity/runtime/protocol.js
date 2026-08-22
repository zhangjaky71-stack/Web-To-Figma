import { isRegionSelectionResult } from "./region-selection.js";
export const W2F_EXTENSION_SHELL_VERSION = "1.3.0";
export const W2F_JOB_STORAGE_KEY = "w2f.captureJob.v1";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPageProbe(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.url === "string" &&
        typeof value.title === "string" &&
        [
            value.documentWidth,
            value.documentHeight,
            value.viewportWidth,
            value.viewportHeight,
            value.devicePixelRatio,
        ].every((item) => typeof item === "number" && Number.isFinite(item)));
}
export function isW2fShellRequest(value) {
    if (!isRecord(value) || typeof value.type !== "string")
        return false;
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
export function isW2fContentResponse(value) {
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
export function isW2fShellResponse(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.requestType !== "string") {
        return false;
    }
    return value.ok ? "data" in value : typeof value.error === "string";
}
export function shellSuccess(requestType, data) {
    return { ok: true, requestType, data };
}
export function shellFailure(requestType, error) {
    return {
        ok: false,
        requestType,
        error: error instanceof Error ? error.message : String(error),
    };
}
//# sourceMappingURL=protocol.js.map