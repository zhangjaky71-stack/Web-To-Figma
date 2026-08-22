import type { CaptureJobMode, CaptureJobState } from "./job-state.js";
import {
  isW2fShellResponse,
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

function renderJob(job: CaptureJobState | null): void {
  if (!job) {
    statusElement.textContent = "Ready";
    statusElement.dataset.status = "idle";
    detailsElement.textContent = "Choose a capture mode to verify the extension shell on this tab.";
    cancelButton.disabled = true;
    return;
  }

  statusElement.textContent = job.status;
  statusElement.dataset.status = job.status;
  const page = job.page;
  detailsElement.textContent = page
    ? `${page.title || "Untitled page"} · ${page.documentWidth}×${page.documentHeight}`
    : job.error || `${job.mode} · ${job.phase}`;
  cancelButton.disabled = ["completed", "failed", "cancelled"].includes(job.status);
  cancelButton.dataset.jobId = job.jobId;
}

async function refreshJob(): Promise<void> {
  const response = await sendRequest({ type: "W2F_GET_JOB_STATE" });
  if (!response.ok) throw new Error(response.error);
  renderJob(isCaptureJob(response.data) ? response.data : null);
}

async function startJob(mode: CaptureJobMode): Promise<void> {
  fullPageButton.disabled = true;
  regionButton.disabled = true;
  detailsElement.textContent = "Preparing the current tab…";
  try {
    const response = await sendRequest({ type: "W2F_START_JOB", mode });
    if (!response.ok) throw new Error(response.error);
    renderJob(isCaptureJob(response.data) ? response.data : null);
  } catch (error) {
    statusElement.textContent = "failed";
    statusElement.dataset.status = "failed";
    detailsElement.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    fullPageButton.disabled = false;
    regionButton.disabled = false;
  }
}

fullPageButton.addEventListener("click", () => void startJob("full-page"));
regionButton.addEventListener("click", () => void startJob("region"));
cancelButton.addEventListener("click", () => {
  const jobId = cancelButton.dataset.jobId;
  if (!jobId) return;
  void sendRequest({ type: "W2F_CANCEL_JOB", jobId }).then((response) => {
    if (response.ok) renderJob(isCaptureJob(response.data) ? response.data : null);
  });
});
optionsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());

void refreshJob().catch((error: unknown) => {
  statusElement.textContent = "unavailable";
  detailsElement.textContent = error instanceof Error ? error.message : String(error);
});
