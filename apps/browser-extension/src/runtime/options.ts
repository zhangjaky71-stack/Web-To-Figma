import type { CaptureJobState } from "./job-state.js";
import {
  isW2fShellResponse,
  type W2fShellInfo,
  type W2fShellRequest,
  type W2fShellResponse,
} from "./protocol.js";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing options element: ${id}`);
  return value as T;
}

const shellVersion = element<HTMLElement>("shell-version");
const permissionSummary = element<HTMLElement>("permission-summary");
const jobSummary = element<HTMLElement>("job-summary");
const refreshButton = element<HTMLButtonElement>("refresh-status");

async function sendRequest(request: W2fShellRequest): Promise<W2fShellResponse> {
  const response = await chrome.runtime.sendMessage(request);
  if (!isW2fShellResponse(response)) throw new Error("Invalid extension shell response");
  return response;
}

function isShellInfo(value: unknown): value is W2fShellInfo {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.shellVersion === "string" &&
    record.manifestVersion === 3 &&
    record.captureImplemented === false
  );
}

function isJob(value: unknown): value is CaptureJobState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.jobId === "string" && typeof record.status === "string";
}

async function refresh(): Promise<void> {
  const [infoResponse, jobResponse] = await Promise.all([
    sendRequest({ type: "W2F_GET_SHELL_INFO" }),
    sendRequest({ type: "W2F_GET_JOB_STATE" }),
  ]);

  if (!infoResponse.ok) throw new Error(infoResponse.error);
  if (!jobResponse.ok) throw new Error(jobResponse.error);

  const info = isShellInfo(infoResponse.data) ? infoResponse.data : null;
  const job = isJob(jobResponse.data) ? jobResponse.data : null;

  shellVersion.textContent = info
    ? `Shell ${info.shellVersion} · Manifest V${info.manifestVersion}`
    : "Unknown";
  permissionSummary.textContent =
    "Install-time permissions: activeTab, scripting, storage. Broad host access is intentionally deferred to source-provider capability requests.";
  jobSummary.textContent = job
    ? `${job.status} · ${job.mode} · ${job.phase}`
    : "No capture shell job yet.";
}

refreshButton.addEventListener("click", () => void refresh());
void refresh().catch((error: unknown) => {
  jobSummary.textContent = error instanceof Error ? error.message : String(error);
});
