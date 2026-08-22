import { isRawSnapshot, summarizeRawSnapshot, } from "./capture-core/index.js";
import { captureStandardSnapshotInPage, } from "./standard-capture-adapter/index.js";
import { captureHighFidelityWithCdp, getCdpRuntimeCapability } from "./cdp-runtime.js";
import { createCaptureJob, isCaptureJobState, transitionCaptureJob, } from "./job-state.js";
import { W2F_EXTENSION_SHELL_VERSION, W2F_JOB_STORAGE_KEY, isW2fContentResponse, isW2fShellRequest, shellFailure, shellSuccess, } from "./protocol.js";
import {} from "./region-selection.js";
import { deleteCaptureArtifacts, writeRawSnapshot, writeReferenceScreenshot, } from "./snapshot-store.js";
import { resolveActiveTabSource } from "./source-runtime.js";
function shellInfo() {
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
async function readJobState() {
    const stored = await chrome.storage.local.get(W2F_JOB_STORAGE_KEY);
    const value = stored[W2F_JOB_STORAGE_KEY];
    return isCaptureJobState(value) ? value : null;
}
async function writeJobState(job) {
    await chrome.storage.local.set({ [W2F_JOB_STORAGE_KEY]: job });
}
function regionCaptureTarget(region) {
    return {
        type: "region",
        bounds: region.bounds,
        exclusions: region.exclusions.map((item) => ({
            kind: item.kind,
            bounds: item.bounds,
        })),
    };
}
function pageProbeFromSnapshot(snapshot) {
    const root = snapshot.nodes.find((node) => node.captureNodeId === snapshot.rootCaptureNodeId);
    const contentSize = snapshot.environment.layoutMetrics?.contentSize;
    return {
        url: snapshot.url,
        title: snapshot.title,
        documentWidth: contentSize?.width ?? root?.geometry?.bounds.width ?? snapshot.environment.viewportWidth,
        documentHeight: contentSize?.height ?? root?.geometry?.bounds.height ?? snapshot.environment.viewportHeight,
        viewportWidth: snapshot.environment.viewportWidth,
        viewportHeight: snapshot.environment.viewportHeight,
        devicePixelRatio: snapshot.environment.scale.context.devicePixelRatio,
    };
}
async function captureStandardDom(tabId, jobId, captureTarget, fallbackReason) {
    const input = {
        captureTarget,
        maxNodes: 100_000,
        includeComments: false,
    };
    const injectionResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: captureStandardSnapshotInPage,
        args: [input],
    });
    const result = injectionResults[0]?.result;
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
    if (!isRawSnapshot(snapshot))
        throw new Error("Standard fallback diagnostics invalidated RawSnapshot");
    const storageKey = await writeRawSnapshot(jobId, snapshot);
    return {
        snapshot,
        receipt: {
            ...summarizeRawSnapshot(snapshot),
            storageKey,
            capturedAt: snapshot.capturedAt,
            ...(fallbackReason ? { fallbackFromCdp: true } : {}),
        },
    };
}
async function captureCdpDom(tabId, jobId, captureTarget, fallbackUrl, fallbackTitle) {
    const result = await captureHighFidelityWithCdp(tabId, captureTarget, fallbackUrl, fallbackTitle);
    if (!isRawSnapshot(result.snapshot) || result.snapshot.adapter !== "cdp") {
        throw new Error("CDP capture returned an invalid RawSnapshot");
    }
    try {
        const storageKey = await writeRawSnapshot(jobId, result.snapshot);
        const referenceScreenshotKey = await writeReferenceScreenshot(jobId, result.screenshot);
        return {
            snapshot: result.snapshot,
            receipt: {
                ...summarizeRawSnapshot(result.snapshot),
                storageKey,
                referenceScreenshotKey,
                capturedAt: result.snapshot.capturedAt,
            },
        };
    }
    catch (error) {
        await deleteCaptureArtifacts(jobId).catch(() => undefined);
        throw error;
    }
}
async function capturePreferredDom(tabId, jobId, captureTarget, fallbackUrl, fallbackTitle) {
    const cdp = getCdpRuntimeCapability();
    if (!cdp.available)
        return captureStandardDom(tabId, jobId, captureTarget);
    try {
        return await captureCdpDom(tabId, jobId, captureTarget, fallbackUrl, fallbackTitle);
    }
    catch (error) {
        await deleteCaptureArtifacts(jobId).catch(() => undefined);
        const reason = error instanceof Error ? error.message : String(error);
        return captureStandardDom(tabId, jobId, captureTarget, reason);
    }
}
async function selectRegion(tabId, jobId) {
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
    if (response.type === "W2F_CONTENT_SELECTION_CANCELLED")
        return null;
    if (response.type !== "W2F_CONTENT_REGION_RESULT") {
        throw new Error("Region mode returned a non-region content response");
    }
    return { page: response.page, region: response.region };
}
async function wasJobCancelled(jobId) {
    const current = await readJobState();
    return current?.jobId === jobId && current.status === "cancelled" ? current : null;
}
async function startShellJob(mode) {
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
        job = transitionCaptureJob(job, "running", mode === "region" ? "selecting-region" : initialCapturePhase, new Date(), { tabId, source: descriptor });
        await writeJobState(job);
        let region;
        let regionPage;
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
        const captureTarget = region
            ? regionCaptureTarget(region)
            : { type: "document" };
        const { snapshot, receipt } = await capturePreferredDom(tabId, jobId, captureTarget, tab.url, tab.title);
        const cancelled = await wasJobCancelled(jobId);
        if (cancelled) {
            await deleteCaptureArtifacts(jobId).catch(() => undefined);
            return cancelled;
        }
        const phase = receipt.adapter === "cdp"
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
    }
    catch (error) {
        await deleteCaptureArtifacts(jobId).catch(() => undefined);
        const current = await readJobState();
        if (current?.jobId === jobId && current.status === "cancelled")
            return current;
        job = transitionCaptureJob(job, "failed", "capture-failed", new Date(), {
            error: error instanceof Error ? error.message : String(error),
        });
        await writeJobState(job);
        return job;
    }
}
async function cancelShellJob(jobId) {
    const current = await readJobState();
    if (!current || current.jobId !== jobId)
        return current;
    if (["completed", "failed", "cancelled"].includes(current.status))
        return current;
    if (current.mode === "region" &&
        current.phase === "selecting-region" &&
        typeof current.tabId === "number") {
        await chrome.tabs
            .sendMessage(current.tabId, {
            type: "W2F_CANCEL_REGION_SELECTION",
            jobId,
        })
            .catch(() => undefined);
    }
    const cancelled = transitionCaptureJob(current, "cancelled", "cancelled-by-user");
    await writeJobState(cancelled);
    await deleteCaptureArtifacts(jobId).catch(() => undefined);
    return cancelled;
}
async function handleShellRequest(request) {
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
    if (!isW2fShellRequest(message))
        return false;
    void handleShellRequest(message)
        .then(sendResponse)
        .catch((error) => sendResponse(shellFailure(message.type, error)));
    return true;
});
//# sourceMappingURL=service-worker.js.map