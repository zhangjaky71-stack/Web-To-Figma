import { summarizeAssetCapture } from "@w2f/asset-resolver";
import {
  isRawSnapshot,
  summarizeRawSnapshot,
  type RawCaptureTarget,
  type RawSnapshot,
} from "@w2f/capture-core";
import { summarizeEnvironmentCapture } from "@w2f/environment-capture";
import { summarizePixelGroundTruth } from "@w2f/pixel-ground-truth";
import {
  captureStandardSnapshotInPage,
  type StandardCaptureInput,
  type StandardCaptureResult,
} from "@w2f/standard-capture-adapter";
import { captureAssetsForSnapshot } from "./asset-runtime.js";
import { deleteAssetCapture, writeAssetCapture } from "./asset-store.js";
import { captureHighFidelityWithCdp, getCdpRuntimeCapability } from "./cdp-runtime.js";
import { captureCssCascadeForSnapshot } from "./css-cascade-runtime.js";
import { deleteCssCascadeCapture, writeCssCascadeCapture } from "./css-cascade-store.js";
import { captureEnvironmentForSnapshot } from "./environment-runtime.js";
import { deleteEnvironmentCapture, writeEnvironmentCapture } from "./environment-store.js";
import {
  createCaptureJob,
  isCaptureJobState,
  transitionCaptureJob,
  type CaptureJobMode,
  type CaptureJobState,
  type CaptureSnapshotReceipt,
  type PageProbe,
} from "./job-state.js";
import { capturePixelGroundTruthForSnapshot } from "./pixel-ground-truth-runtime.js";
import {
  deletePixelGroundTruth,
  writePixelGroundTruth,
} from "./pixel-ground-truth-store.js";
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
import {
  deleteCaptureArtifacts,
  writeRawSnapshot,
  writeReferenceScreenshot,
} from "./snapshot-store.js";
import { resolveActiveTabSource } from "./source-runtime.js";

function shellInfo(): W2fShellInfo {
  const cdp = getCdpRuntimeCapability();
  return {
    shellVersion: W2F_EXTENSION_SHELL_VERSION,
    manifestVersion: 3,
    captureImplemented: true,
    standardCaptureImplemented: true,
    cdpCaptureImplemented: true,
    regionSelectionImplemented: true,
    captureProfile: cdp.buildProfile,
    cdpAvailable: cdp.available,
  };
}

async function readJobState(): Promise<CaptureJobState | null> {
  const stored = await chrome.storage.local.get(W2F_JOB_STORAGE_KEY);
  const value = stored[W2F_JOB_STORAGE_KEY];
  return isCaptureJobState(value) ? value : null;
}

async function writeJobState(job: CaptureJobState): Promise<void> {
  await chrome.storage.local.set({ [W2F_JOB_STORAGE_KEY]: job });
}

async function deleteAllCaptureArtifacts(jobId: string): Promise<void> {
  await Promise.allSettled([
    deleteCaptureArtifacts(jobId),
    deleteCssCascadeCapture(jobId),
    deleteEnvironmentCapture(jobId),
    deleteAssetCapture(jobId),
    deletePixelGroundTruth(jobId),
  ]);
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
  const contentSize = snapshot.environment.layoutMetrics?.contentSize;
  return {
    url: snapshot.url,
    title: snapshot.title,
    documentWidth:
      contentSize?.width ?? root?.geometry?.bounds.width ?? snapshot.environment.viewportWidth,
    documentHeight:
      contentSize?.height ?? root?.geometry?.bounds.height ?? snapshot.environment.viewportHeight,
    viewportWidth: snapshot.environment.viewportWidth,
    viewportHeight: snapshot.environment.viewportHeight,
    devicePixelRatio: snapshot.environment.scale.context.devicePixelRatio,
  };
}

async function persistCssCascade(
  tabId: number,
  jobId: string,
  snapshot: RawSnapshot,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "cssCascadeStorageKey"
    | "cssCascadeAdapter"
    | "cssStyleCount"
    | "cssTokenCount"
    | "cssCascadeDiagnosticCount"
  >
> {
  const cascade = await captureCssCascadeForSnapshot(tabId, snapshot);
  const cssCascadeStorageKey = await writeCssCascadeCapture(jobId, cascade);
  return {
    cssCascadeStorageKey,
    cssCascadeAdapter: cascade.adapter,
    cssStyleCount: cascade.styles.length,
    cssTokenCount: cascade.tokens.tokens.length,
    cssCascadeDiagnosticCount: cascade.diagnostics.length,
  };
}

async function persistEnvironment(
  tabId: number,
  jobId: string,
  snapshot: RawSnapshot,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "environmentStorageKey"
    | "environmentAdapter"
    | "mediaRuleCount"
    | "activeMediaRuleCount"
    | "containerCount"
    | "containerQueryCount"
    | "environmentDiagnosticCount"
  >
> {
  const capture = await captureEnvironmentForSnapshot(tabId, snapshot);
  const environmentStorageKey = await writeEnvironmentCapture(jobId, capture);
  const summary = summarizeEnvironmentCapture(capture);
  return {
    environmentStorageKey,
    environmentAdapter: capture.adapter,
    mediaRuleCount: summary.mediaRuleCount,
    activeMediaRuleCount: summary.activeMediaRuleCount,
    containerCount: summary.containerCount,
    containerQueryCount: summary.containerQueryCount,
    environmentDiagnosticCount: summary.diagnosticCount,
  };
}

async function persistAssets(
  tabId: number,
  jobId: string,
  snapshot: RawSnapshot,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "assetStorageKey"
    | "assetAdapter"
    | "assetCount"
    | "assetReferenceCount"
    | "assetDeduplicatedReferenceCount"
    | "assetUniqueByteCount"
    | "assetDiagnosticCount"
  >
> {
  const capture = await captureAssetsForSnapshot(tabId, snapshot);
  const assetStorageKey = await writeAssetCapture(jobId, capture);
  const summary = summarizeAssetCapture(capture);
  return {
    assetStorageKey,
    assetAdapter: capture.adapter,
    assetCount: summary.assetCount,
    assetReferenceCount: summary.referenceCount,
    assetDeduplicatedReferenceCount: summary.deduplicatedReferenceCount,
    assetUniqueByteCount: summary.uniqueByteCount,
    assetDiagnosticCount: summary.diagnosticCount,
  };
}

async function persistPixelGroundTruth(
  tabId: number,
  jobId: string,
  snapshot: RawSnapshot,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "pixelGroundTruthStorageKey"
    | "pixelGroundTruthAdapter"
    | "rasterReferenceCount"
    | "rasterTileReferenceCount"
    | "rasterUniqueTileCount"
    | "rasterUniqueByteCount"
    | "rasterDiagnosticCount"
  >
> {
  const capture = await capturePixelGroundTruthForSnapshot(tabId, snapshot);
  const pixelGroundTruthStorageKey = await writePixelGroundTruth(jobId, capture);
  const summary = summarizePixelGroundTruth(capture);
  return {
    pixelGroundTruthStorageKey,
    pixelGroundTruthAdapter: capture.adapter,
    rasterReferenceCount: summary.referenceCount,
    rasterTileReferenceCount: summary.tileReferenceCount,
    rasterUniqueTileCount: summary.uniqueTileCount,
    rasterUniqueByteCount: summary.uniqueByteCount,
    rasterDiagnosticCount: summary.diagnosticCount,
  };
}

async function captureStandardDom(
  tabId: number,
  jobId: string,
  captureTarget: RawCaptureTarget,
  fallbackReason?: string,
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

  if (fallbackReason) {
    snapshot.diagnostics.push({
      code: "CDP_CAPTURE_FALLBACK_STANDARD",
      message: `High Fidelity capture failed and Standard capture was used: ${fallbackReason}`,
    });
  }
  if (!isRawSnapshot(snapshot)) {
    throw new Error("Standard fallback diagnostics invalidated RawSnapshot");
  }

  try {
    const storageKey = await writeRawSnapshot(jobId, snapshot);
    const cascadeReceipt = await persistCssCascade(tabId, jobId, snapshot);
    const environmentReceipt = await persistEnvironment(tabId, jobId, snapshot);
    const assetReceipt = await persistAssets(tabId, jobId, snapshot);
    const pixelGroundTruthReceipt = await persistPixelGroundTruth(tabId, jobId, snapshot);
    return {
      snapshot,
      receipt: {
        ...summarizeRawSnapshot(snapshot),
        storageKey,
        capturedAt: snapshot.capturedAt,
        ...cascadeReceipt,
        ...environmentReceipt,
        ...assetReceipt,
        ...pixelGroundTruthReceipt,
        ...(fallbackReason ? { fallbackFromCdp: true } : {}),
      },
    };
  } catch (error) {
    await deleteAllCaptureArtifacts(jobId);
    throw error;
  }
}

async function captureCdpDom(
  tabId: number,
  jobId: string,
  captureTarget: RawCaptureTarget,
  fallbackUrl?: string,
  fallbackTitle?: string,
): Promise<{ snapshot: RawSnapshot; receipt: CaptureSnapshotReceipt }> {
  const result = await captureHighFidelityWithCdp(tabId, captureTarget, fallbackUrl, fallbackTitle);
  if (!isRawSnapshot(result.snapshot) || result.snapshot.adapter !== "cdp") {
    throw new Error("CDP capture returned an invalid RawSnapshot");
  }

  try {
    const storageKey = await writeRawSnapshot(jobId, result.snapshot);
    const referenceScreenshotKey = await writeReferenceScreenshot(jobId, result.screenshot);
    const cascadeReceipt = await persistCssCascade(tabId, jobId, result.snapshot);
    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);
    const assetReceipt = await persistAssets(tabId, jobId, result.snapshot);
    const pixelGroundTruthReceipt = await persistPixelGroundTruth(tabId, jobId, result.snapshot);
    return {
      snapshot: result.snapshot,
      receipt: {
        ...summarizeRawSnapshot(result.snapshot),
        storageKey,
        referenceScreenshotKey,
        capturedAt: result.snapshot.capturedAt,
        ...cascadeReceipt,
        ...environmentReceipt,
        ...assetReceipt,
        ...pixelGroundTruthReceipt,
      },
    };
  } catch (error) {
    await deleteAllCaptureArtifacts(jobId);
    throw error;
  }
}

async function capturePreferredDom(
  tabId: number,
  jobId: string,
  captureTarget: RawCaptureTarget,
  fallbackUrl?: string,
  fallbackTitle?: string,
): Promise<{ snapshot: RawSnapshot; receipt: CaptureSnapshotReceipt }> {
  const cdp = getCdpRuntimeCapability();
  if (!cdp.available) return captureStandardDom(tabId, jobId, captureTarget);

  try {
    return await captureCdpDom(tabId, jobId, captureTarget, fallbackUrl, fallbackTitle);
  } catch (error) {
    await deleteAllCaptureArtifacts(jobId);
    const reason = error instanceof Error ? error.message : String(error);
    return captureStandardDom(tabId, jobId, captureTarget, reason);
  }
}

async function selectRegion(
  tabId: number,
  jobId: string,
): Promise<{
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
    const { capability, descriptor, tabId, tab } = sourceResolution;
    if (!capability.available || !descriptor) {
      const action = capability.requiredUserAction
        ? `; action required: ${capability.requiredUserAction}`
        : "";
      throw new Error(`${capability.reason}${action}`);
    }

    const initialCapturePhase = getCdpRuntimeCapability().available
      ? "capturing-high-fidelity"
      : "capturing-standard-dom";
    job = transitionCaptureJob(
      job,
      "running",
      mode === "region" ? "selecting-region" : initialCapturePhase,
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
      job = transitionCaptureJob(job, "running", initialCapturePhase, new Date(), {
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
    const { snapshot, receipt } = await capturePreferredDom(
      tabId,
      jobId,
      captureTarget,
      tab.url,
      tab.title,
    );

    const cancelled = await wasJobCancelled(jobId);
    if (cancelled) {
      await deleteAllCaptureArtifacts(jobId);
      return cancelled;
    }

    const phase =
      receipt.adapter === "cdp"
        ? "high-fidelity-capture-complete"
        : receipt.fallbackFromCdp
          ? "standard-fallback-complete"
          : "standard-capture-complete";
    job = transitionCaptureJob(job, "completed", phase, new Date(), {
      tabId,
      source: descriptor,
      page: regionPage ?? pageProbeFromSnapshot(snapshot),
      ...(region === undefined ? {} : { region }),
      capture: receipt,
    });
    await writeJobState(job);
    return job;
  } catch (error) {
    await deleteAllCaptureArtifacts(jobId);
    const current = await readJobState();
    if (current?.jobId === jobId && current.status === "cancelled") return current;
    job = transitionCaptureJob(job, "failed", "capture-failed", new Date(), {
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

  if (
    current.mode === "region" &&
    current.phase === "selecting-region" &&
    typeof current.tabId === "number"
  ) {
    await chrome.tabs
      .sendMessage(current.tabId, {
        type: "W2F_CANCEL_REGION_SELECTION",
        jobId,
      })
      .catch(() => undefined);
  }

  const cancelled = transitionCaptureJob(current, "cancelled", "cancelled-by-user");
  await writeJobState(cancelled);
  await deleteAllCaptureArtifacts(jobId);
  return cancelled;
}

async function handleShellRequest(request: W2fShellRequest): Promise<W2fShellResponse> {
  switch (request.type) {
    case "W2F_GET_SHELL_INFO":
      return shellSuccess(request.type, shellInfo());
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
