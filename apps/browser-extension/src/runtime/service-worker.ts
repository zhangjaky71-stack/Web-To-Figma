import {
  isRawSnapshot,
  summarizeRawSnapshot,
  type RawCaptureTarget,
  type RawSnapshot,
} from "@w2f/capture-core";
import {
  captureStandardSnapshotInPage,
  type StandardCaptureInput,
  type StandardCaptureResult,
} from "@w2f/standard-capture-adapter";
import {
  createCaptureJob,
  isCaptureJobState,
  transitionCaptureJob,
  type CaptureJobMode,
  type CaptureJobState,
  type CaptureSnapshotReceipt,
  type PageProbe,
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
import { type RegionSelectionResult } from "./region-selection.js";
import { deleteRawSnapshot, writeRawSnapshot } from "./snapshot-store.js";
import { resolveActiveTabSource } from "./source-runtime.js";

const SHELL_INFO: W2fShellInfo = {
  shellVersion: W2F_EXTENSION_SHELL_VERSION,
  manifestVersion: 3,
  captureImplemented: true,
  standardCaptureImplemented: true,
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

function regionCaptureTarget(region: RegionSelectionResult): RawCaptureTarget {
  return {
    type: "region",
    bounds: region.bounds,
    exclusions: region.exclusions.map((item) => ({
      kind: item.kind,
      bounds: item.bounds,
    })),
  };
}

function pageProbeFromSnapshot(snapshot: RawSnapshot): PageProbe {
  const root = snapshot.nodes.find((node) => node.captureNodeId === snapshot.rootCaptureNodeId);
  return {
    url: snapshot.url,
    title: snapshot.title,
    documentWidth: root?.geometry?.bounds.width ?? snapshot.environment.viewportWidth,
    documentHeight: root?.geometry?.bounds.height ?? snapshot.environment.viewportHeight,
    viewportWidth: snapshot.environment.viewportWidth,
    viewportHeight: snapshot.environment.viewportHeight,
    devicePixelRatio: snapshot.environment.devicePixelRatio,
  };
}

async function captureStandardDom(
  tabId: number,
  jobId: string,
  captureTarget: RawCaptureTarget,
): Promise<{ snapshot: RawSnapshot; receipt: CaptureSnapshotReceipt }> {
  const input: StandardCaptureInput = {
    captureTarget,
    maxNodes: 100_000,
    includeComments: false,
  };
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureStandardSnapshotInPage,
    args: [input],
  });
  const result = injectionResults[0]?.result as StandardCaptureResult | undefined;
  const snapshot = result?.snapshot;
  if (!snapshot || !isRawSnapshot(snapshot) || snapshot.adapter !== "standard") {
    throw new Error("Standard capture returned an invalid RawSnapshot");
  }

  const storageKey = await writeRawSnapshot(jobId, snapshot);
  return {
    snapshot,
    receipt: {
      ...summarizeRawSnapshot(snapshot),
      storageKey,
      capturedAt: snapshot.capturedAt,
    },
  };
}

async function selectRegion(tabId: number, jobId: string): Promise<{
  page: PageProbe;
  region: RegionSelectionResult;
} | null> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["runtime/content-script.js"],
  });
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "W2F_SELECT_REGION",
    jobId,
  });
  if (!isW2fContentResponse(response) || response.jobId !== jobId) {
    throw new Error("Content runtime returned an invalid region response");
  }
  if (response.type === "W2F_CONTENT_SELECTION_CANCELLED") return null;
  if (response.type !== "W2F_CONTENT_REGION_RESULT") {
    throw new Error("Region mode returned a non-region content response");
  }
  return { page: response.page, region: response.region };
}

async function wasJobCancelled(jobId: string): Promise<CaptureJobState | null> {
  const current = await readJobState();
  return current?.jobId === jobId && current.status === "cancelled" ? current : null;
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
      mode === "region" ? "selecting-region" : "capturing-standard-dom",
      new Date(),
      { tabId, source: descriptor },
    );
    await writeJobState(job);

    let region: RegionSelectionResult | undefined;
    let regionPage: PageProbe | undefined;
    if (mode === "region") {
      const selection = await selectRegion(tabId, jobId);
      if (!selection) {
        job = transitionCaptureJob(job, "cancelled", "selection-cancelled", new Date(), {
          tabId,
          source: descriptor,
        });
        await writeJobState(job);
        return job;
      }
      region = selection.region;
      regionPage = selection.page;
      job = transitionCaptureJob(job, "running", "capturing-standard-dom", new Date(), {
        tabId,
        source: descriptor,
        page: regionPage,
        region,
      });
      await writeJobState(job);
    }

    const captureTarget: RawCaptureTarget = region
      ? regionCaptureTarget(region)
      : { type: "document" };
    const { snapshot, receipt } = await captureStandardDom(tabId, jobId, captureTarget);

    const cancelled = await wasJobCancelled(jobId);
    if (cancelled) {
      await deleteRawSnapshot(jobId).catch(() => undefined);
      return cancelled;
    }

    job = transitionCaptureJob(job, "completed", "standard-capture-complete", new Date(), {
      tabId,
      source: descriptor,
      page: regionPage ?? pageProbeFromSnapshot(snapshot),
      ...(region === undefined ? {} : { region }),
      capture: receipt,
    });
    await writeJobState(job);
    return job;
  } catch (error) {
    await deleteRawSnapshot(jobId).catch(() => undefined);
    const current = await readJobState();
    if (current?.jobId === jobId && current.status === "cancelled") return current;
    job = transitionCaptureJob(job, "failed", "standard-capture-failed", new Date(), {
      error: error instanceof Error ? error.message : String(error),
    });
    await writeJobState(job);
    return job;
  }
}

async function cancelShellJob(jobId: string): Promise<CaptureJobState | null> {
  const current = await readJobState();
  if (!current || current.jobId !== jobId) return current;
  if (["completed", "failed", "cancelled"].includes(current.status)) return current;

  if (current.mode === "region" && current.phase === "selecting-region" && typeof current.tabId === "number") {
    await chrome.tabs
      .sendMessage(current.tabId, {
        type: "W2F_CANCEL_REGION_SELECTION",
        jobId,
      })
      .catch(() => undefined);
  }

  const cancelled = transitionCaptureJob(current, "cancelled", "cancelled-by-user");
  await writeJobState(cancelled);
  await deleteRawSnapshot(jobId).catch(() => undefined);
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
