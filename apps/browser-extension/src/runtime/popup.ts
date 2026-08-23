import type { ResponsiveCaptureRequest } from "@w2f/responsive-capture";
import type { CaptureJobMode, CaptureJobState } from "./job-state.js";
import {
  isW2fShellResponse,
  type W2fShellInfo,
  type W2fShellRequest,
  type W2fShellResponse,
} from "./protocol.js";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup element: ${id}`);
  return value as T;
}

const statusElement = element<HTMLElement>("job-status");
const detailsElement = element<HTMLElement>("job-details");
const fullPageButton = element<HTMLButtonElement>("capture-full-page");
const regionButton = element<HTMLButtonElement>("capture-region");
const responsiveButton = element<HTMLButtonElement>("capture-responsive");
const responsiveCurrent = element<HTMLInputElement>("responsive-current");
const responsiveCommon = element<HTMLInputElement>("responsive-common");
const responsiveCustom = element<HTMLInputElement>("responsive-custom");
const responsiveCustomWidths = element<HTMLInputElement>("responsive-custom-widths");
const responsiveCapability = element<HTMLElement>("responsive-capability");
const cancelButton = element<HTMLButtonElement>("cancel-job");
const optionsButton = element<HTMLButtonElement>("open-options");

async function sendRequest(request: W2fShellRequest): Promise<W2fShellResponse> {
  const response = await chrome.runtime.sendMessage(request);
  if (!isW2fShellResponse(response)) throw new Error("Invalid extension shell response");
  return response;
}

function isCaptureJob(value: unknown): value is CaptureJobState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.jobId === "string" && typeof record.status === "string";
}

function isShellInfo(value: unknown): value is W2fShellInfo {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.responsiveCaptureImplemented === true &&
    typeof record.syntheticResponsiveAvailable === "boolean" &&
    (record.captureProfile === "standard" || record.captureProfile === "high-fidelity")
  );
}

function setCaptureControlsDisabled(disabled: boolean): void {
  fullPageButton.disabled = disabled;
  regionButton.disabled = disabled;
  responsiveButton.disabled = disabled;
}

function renderJob(job: CaptureJobState | null): void {
  if (!job) {
    statusElement.textContent = "Ready";
    statusElement.dataset.status = "idle";
    detailsElement.textContent = "Choose a capture mode for the current tab.";
    cancelButton.disabled = true;
    return;
  }

  statusElement.textContent = job.status;
  statusElement.dataset.status = job.status;
  const page = job.page;
  const region = job.region;
  const capture = job.capture;
  const responsive = job.responsive;
  if (responsive) {
    detailsElement.textContent = `${responsive.mode} responsive · ${responsive.capturedSnapshotCount}/${responsive.plannedViewportCount} snapshots · ${responsive.viewportWidths.join(" / ")} px · ${responsive.stableNodeEvidenceCount} stable-node inputs · ${responsive.diagnosticCount} diagnostics`;
  } else if (capture) {
    const captureSummary = `${capture.adapter.toUpperCase()} · ${capture.nodeCount} nodes · ${capture.frameCount} frames · ${capture.scrollContainerCount} scroll roots · ${capture.diagnosticCount} diagnostics`;
    detailsElement.textContent = region
      ? `${region.mode === "smart-element" ? "Smart element" : "Selected area"} · ${Math.round(region.bounds.width)}×${Math.round(region.bounds.height)} CSS px · ${region.exclusions.length} mask${region.exclusions.length === 1 ? "" : "s"} · ${captureSummary}`
      : `${page?.title || "Untitled page"} · ${captureSummary}`;
  } else {
    detailsElement.textContent = region
      ? `${region.mode === "smart-element" ? "Smart element" : "Selected area"} · ${Math.round(region.bounds.width)}×${Math.round(region.bounds.height)} CSS px · ${region.exclusions.length} mask${region.exclusions.length === 1 ? "" : "s"}`
      : page
        ? `${page.title || "Untitled page"} · ${page.documentWidth}×${page.documentHeight}`
        : job.error || `${job.mode} · ${job.phase}`;
  }
  cancelButton.disabled = ["completed", "failed", "cancelled"].includes(job.status);
  cancelButton.dataset.jobId = job.jobId;
}

function selectedResponsiveRequest(): ResponsiveCaptureRequest {
  if (responsiveCommon.checked) return { mode: "common" };
  if (responsiveCustom.checked) {
    const widths = responsiveCustomWidths.value
      .split(/[\s,;/]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
    if (widths.length === 0) throw new Error("Enter at least one custom viewport width.");
    return { mode: "custom", viewports: widths.map((width) => ({ width })) };
  }
  return { mode: "current" };
}

function syncCustomInput(): void {
  responsiveCustomWidths.disabled = !responsiveCustom.checked || responsiveCustom.disabled;
}

async function refreshJob(): Promise<void> {
  const response = await sendRequest({ type: "W2F_GET_JOB_STATE" });
  if (!response.ok) throw new Error(response.error);
  renderJob(isCaptureJob(response.data) ? response.data : null);
}

async function refreshShellInfo(): Promise<void> {
  const response = await sendRequest({ type: "W2F_GET_SHELL_INFO" });
  if (!response.ok || !isShellInfo(response.data)) return;
  const synthetic = response.data.syntheticResponsiveAvailable;
  responsiveCommon.disabled = !synthetic;
  responsiveCustom.disabled = !synthetic;
  responsiveCapability.textContent = synthetic
    ? "High Fidelity · synthetic viewports enabled"
    : "Standard · current viewport only";
  if (!synthetic && (responsiveCommon.checked || responsiveCustom.checked))
    responsiveCurrent.checked = true;
  syncCustomInput();
}

async function startJob(mode: Exclude<CaptureJobMode, "responsive">): Promise<void> {
  setCaptureControlsDisabled(true);
  detailsElement.textContent =
    mode === "region"
      ? "Select a region directly on the current page…"
      : "Capturing the current rendered page…";
  try {
    const response = await sendRequest({ type: "W2F_START_JOB", mode });
    if (!response.ok) throw new Error(response.error);
    renderJob(isCaptureJob(response.data) ? response.data : null);
  } catch (error) {
    statusElement.textContent = "failed";
    statusElement.dataset.status = "failed";
    detailsElement.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setCaptureControlsDisabled(false);
  }
}

async function startResponsiveJob(): Promise<void> {
  setCaptureControlsDisabled(true);
  try {
    const capture = selectedResponsiveRequest();
    detailsElement.textContent =
      capture.mode === "current"
        ? "Capturing current responsive snapshot…"
        : "Capturing responsive viewport sequence…";
    const response = await sendRequest({ type: "W2F_START_RESPONSIVE_JOB", capture });
    if (!response.ok) throw new Error(response.error);
    renderJob(isCaptureJob(response.data) ? response.data : null);
  } catch (error) {
    statusElement.textContent = "failed";
    statusElement.dataset.status = "failed";
    detailsElement.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setCaptureControlsDisabled(false);
  }
}

fullPageButton.addEventListener("click", () => void startJob("full-page"));
regionButton.addEventListener("click", () => void startJob("region"));
responsiveButton.addEventListener("click", () => void startResponsiveJob());
for (const input of [responsiveCurrent, responsiveCommon, responsiveCustom]) {
  input.addEventListener("change", syncCustomInput);
}
cancelButton.addEventListener("click", () => {
  const jobId = cancelButton.dataset.jobId;
  if (!jobId) return;
  void sendRequest({ type: "W2F_CANCEL_JOB", jobId }).then((response) => {
    if (response.ok) renderJob(isCaptureJob(response.data) ? response.data : null);
  });
});
optionsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());

void Promise.all([refreshJob(), refreshShellInfo()]).catch((error: unknown) => {
  statusElement.textContent = "unavailable";
  detailsElement.textContent = error instanceof Error ? error.message : String(error);
});
