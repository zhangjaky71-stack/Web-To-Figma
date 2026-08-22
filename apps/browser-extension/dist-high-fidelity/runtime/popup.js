import { isW2fShellResponse } from "./protocol.js";
function element(id) {
    const value = document.getElementById(id);
    if (!value)
        throw new Error(`Missing popup element: ${id}`);
    return value;
}
const statusElement = element("job-status");
const detailsElement = element("job-details");
const fullPageButton = element("capture-full-page");
const regionButton = element("capture-region");
const cancelButton = element("cancel-job");
const optionsButton = element("open-options");
async function sendRequest(request) {
    const response = await chrome.runtime.sendMessage(request);
    if (!isW2fShellResponse(response))
        throw new Error("Invalid extension shell response");
    return response;
}
function isCaptureJob(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return typeof record.jobId === "string" && typeof record.status === "string";
}
function renderJob(job) {
    if (!job) {
        statusElement.textContent = "Ready";
        statusElement.dataset.status = "idle";
        detailsElement.textContent = "Choose Full page or Select area for the current tab.";
        cancelButton.disabled = true;
        return;
    }
    statusElement.textContent = job.status;
    statusElement.dataset.status = job.status;
    const page = job.page;
    const region = job.region;
    const capture = job.capture;
    if (capture) {
        const captureSummary = `${capture.adapter.toUpperCase()} · ${capture.nodeCount} nodes · ${capture.frameCount} frames · ${capture.scrollContainerCount} scroll roots · ${capture.diagnosticCount} diagnostics`;
        detailsElement.textContent = region
            ? `${region.mode === "smart-element" ? "Smart element" : "Selected area"} · ${Math.round(region.bounds.width)}×${Math.round(region.bounds.height)} CSS px · ${region.exclusions.length} mask${region.exclusions.length === 1 ? "" : "s"} · ${captureSummary}`
            : `${page?.title || "Untitled page"} · ${captureSummary}`;
    }
    else {
        detailsElement.textContent = region
            ? `${region.mode === "smart-element" ? "Smart element" : "Selected area"} · ${Math.round(region.bounds.width)}×${Math.round(region.bounds.height)} CSS px · ${region.exclusions.length} mask${region.exclusions.length === 1 ? "" : "s"}`
            : page
                ? `${page.title || "Untitled page"} · ${page.documentWidth}×${page.documentHeight}`
                : job.error || `${job.mode} · ${job.phase}`;
    }
    cancelButton.disabled = ["completed", "failed", "cancelled"].includes(job.status);
    cancelButton.dataset.jobId = job.jobId;
}
async function refreshJob() {
    const response = await sendRequest({ type: "W2F_GET_JOB_STATE" });
    if (!response.ok)
        throw new Error(response.error);
    renderJob(isCaptureJob(response.data) ? response.data : null);
}
async function startJob(mode) {
    fullPageButton.disabled = true;
    regionButton.disabled = true;
    detailsElement.textContent =
        mode === "region"
            ? "Select a region directly on the current page…"
            : "Capturing the current rendered page…";
    try {
        const response = await sendRequest({ type: "W2F_START_JOB", mode });
        if (!response.ok)
            throw new Error(response.error);
        renderJob(isCaptureJob(response.data) ? response.data : null);
    }
    catch (error) {
        statusElement.textContent = "failed";
        statusElement.dataset.status = "failed";
        detailsElement.textContent = error instanceof Error ? error.message : String(error);
    }
    finally {
        fullPageButton.disabled = false;
        regionButton.disabled = false;
    }
}
fullPageButton.addEventListener("click", () => void startJob("full-page"));
regionButton.addEventListener("click", () => void startJob("region"));
cancelButton.addEventListener("click", () => {
    const jobId = cancelButton.dataset.jobId;
    if (!jobId)
        return;
    void sendRequest({ type: "W2F_CANCEL_JOB", jobId }).then((response) => {
        if (response.ok)
            renderJob(isCaptureJob(response.data) ? response.data : null);
    });
});
optionsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());
void refreshJob().catch((error) => {
    statusElement.textContent = "unavailable";
    detailsElement.textContent = error instanceof Error ? error.message : String(error);
});
//# sourceMappingURL=popup.js.map