import {
  createCaptureJob,
  isCaptureJobState,
  transitionCaptureJob,
  type CaptureJobMode,
  type CaptureJobState,
} from "./job-state.js";
import {
  W2F_EXTENSION_SHELL_VERSION,
  W2F_JOB_STORAGE_KEY,
  isW2fContentResponse,
  isW2fShellRequest,
  shellFailure,
  shellSuccess,
  type W2fShellInfo,
  type W2fShellRequest,
  type W2fShellResponse,
} from "./protocol.js";
import { resolveActiveTabSource } from "./source-runtime.js";

const SHELL_INFO: W2fShellInfo = {
  shellVersion: W2F_EXTENSION_SHELL_VERSION,
  manifestVersion: 3,
  captureImplemented: false,
  regionSelectionImplemented: true,
};

async function readJobState(): Promise<CaptureJobState | null> {
  const stored = await chrome.storage.local.get(W2F_JOB_STORAGE_KEY);
  const value = stored[W2F_JOB_STORAGE_KEY];
  return isCaptureJobState(value) ? value : null;
}

async function writeJobState(job: CaptureJobState): Promise<void> {
  await chrome.storage.local.set({ [W2F_JOB_STORAGE_KEY]: job });
}

async function startShellJob(mode: CaptureJobMode): Promise<CaptureJobState> {
  const jobId = crypto.randomUUID();
  let job = createCaptureJob(mode, jobId);
  await writeJobState(job);

  try {
    const sourceResolution = await resolveActiveTabSource();
    const { capability, descriptor, tabId } = sourceResolution;
    if (!capability.available || !descriptor) {
      const action = capability.requiredUserAction
        ? `; action required: ${capability.requiredUserAction}`
        : "";
      throw new Error(`${capability.reason}${action}`);
    }

    job = transitionCaptureJob(
      job,
      "running",
      mode === "region" ? "selecting-region" : "injecting-content-shell",
      new Date(),
      {
        tabId,
        source: descriptor,
      },
    );
    await writeJobState(job);

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["runtime/content-script.js"],
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: mode === "region" ? "W2F_SELECT_REGION" : "W2F_PROBE_PAGE",
      jobId,
    });
    if (!isW2fContentResponse(response) || response.jobId !== jobId) {
      throw new Error("Content runtime returned an invalid response");
    }

    if (response.type === "W2F_CONTENT_SELECTION_CANCELLED") {
      job = transitionCaptureJob(job, "cancelled", "selection-cancelled", new Date(), {
        tabId,
        source: descriptor,
      });
      await writeJobState(job);
      return job;
    }

    if (mode === "region") {
      if (response.type !== "W2F_CONTENT_REGION_RESULT") {
        throw new Error("Region mode returned a non-region content response");
      }
      job = transitionCaptureJob(job, "completed", "region-selection-complete", new Date(), {
        tabId,
        source: descriptor,
        page: response.page,
        region: response.region,
      });
    } else {
      if (response.type !== "W2F_CONTENT_PROBE_RESULT") {
        throw new Error("Full-page mode returned a non-probe content response");
      }
      job = transitionCaptureJob(job, "completed", "shell-probe-complete", new Date(), {
        tabId,
        source: descriptor,
        page: response.page,
      });
    }

    await writeJobState(job);
    return job;
  } catch (error) {
    job = transitionCaptureJob(
      job,
      "failed",
      mode === "region" ? "region-selection-failed" : "shell-probe-failed",
      new Date(),
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    await writeJobState(job);
    return job;
  }
}

async function cancelShellJob(jobId: string): Promise<CaptureJobState | null> {
  const current = await readJobState();
  if (!current || current.jobId !== jobId) return current;
  if (["completed", "failed", "cancelled"].includes(current.status)) return current;

  if (current.mode === "region" && typeof current.tabId === "number") {
    await chrome.tabs
      .sendMessage(current.tabId, {
        type: "W2F_CANCEL_REGION_SELECTION",
        jobId,
      })
      .catch(() => undefined);
  }

  const cancelled = transitionCaptureJob(current, "cancelled", "cancelled-by-user");
  await writeJobState(cancelled);
  return cancelled;
}

async function handleShellRequest(request: W2fShellRequest): Promise<W2fShellResponse> {
  switch (request.type) {
    case "W2F_GET_SHELL_INFO":
      return shellSuccess(request.type, SHELL_INFO);
    case "W2F_GET_SOURCE_CAPABILITY":
      return shellSuccess(request.type, (await resolveActiveTabSource()).capability);
    case "W2F_GET_JOB_STATE":
      return shellSuccess(request.type, await readJobState());
    case "W2F_START_JOB":
      return shellSuccess(request.type, await startShellJob(request.mode));
    case "W2F_CANCEL_JOB":
      return shellSuccess(request.type, await cancelShellJob(request.jobId));
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void readJobState().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isW2fShellRequest(message)) return false;
  void handleShellRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse(shellFailure(message.type, error)));
  return true;
});
