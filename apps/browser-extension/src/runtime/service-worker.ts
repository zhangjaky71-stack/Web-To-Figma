import { summarizeAssetCapture } from "@w2f/asset-resolver";
import {
  summarizeCompositingAnalysis,
  type CompositingAnalysisResult,
} from "@w2f/compositing-engine";
import {
  isRawSnapshot,
  summarizeRawSnapshot,
  type RawCaptureTarget,
  type RawSnapshot,
} from "@w2f/capture-core";
import { summarizeEnvironmentCapture } from "@w2f/environment-capture";
import { summarizeBaseLayoutAnalysis } from "@w2f/layout-analyzer";
import { summarizeTableLayout } from "@w2f/table-layout-engine";
import { summarizeRenderTreeOptimization } from "@w2f/render-tree-optimizer";
import { summarizePixelGroundTruth } from "@w2f/pixel-ground-truth";
import {
  buildResponsiveCapture,
  planResponsiveViewports,
  responsiveArtifactId,
  summarizeResponsiveCapture,
  type ResponsiveCaptureRequest,
  type ResponsiveSnapshotInput,
  type ResponsiveViewportPlan,
} from "@w2f/responsive-capture";
import { summarizeResponsiveInference } from "@w2f/responsive-inference";
import {
  captureStandardSnapshotInPage,
  type StandardCaptureInput,
  type StandardCaptureResult,
} from "@w2f/standard-capture-adapter";
import { captureAssetsForSnapshot } from "./asset-runtime.js";
import { analyzePersistedCompositing } from "./compositing-runtime.js";
import {
  deleteCompositingAnalysis,
  readCompositingAnalysis,
  writeCompositingAnalysis,
} from "./compositing-store.js";
import { deleteAssetCapture, readAssetCapture, writeAssetCapture } from "./asset-store.js";
import {
  captureHighFidelityWithCdp,
  getCdpRuntimeCapability,
  withHighFidelityViewportOverride,
} from "./cdp-runtime.js";
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
  type ResponsiveCaptureReceipt,
} from "./job-state.js";
import { analyzePersistedBaseLayout } from "./layout-analysis-runtime.js";
import { deleteBaseLayoutAnalysis, writeBaseLayoutAnalysis } from "./layout-analysis-store.js";
import { analyzePersistedTables } from "./table-layout-runtime.js";
import { deleteTableLayoutResult, writeTableLayoutResult } from "./table-layout-store.js";
import { optimizePersistedRenderTree } from "./render-tree-runtime.js";
import { deleteRenderTreeOptimization, writeRenderTreeOptimization } from "./render-tree-store.js";
import { capturePixelGroundTruthForSnapshot } from "./pixel-ground-truth-runtime.js";
import { deletePixelGroundTruth, writePixelGroundTruth } from "./pixel-ground-truth-store.js";
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
  assertSnapshotMatchesResponsivePlan,
  buildResponsiveStableNodeEvidence,
  probeCurrentViewport,
} from "./responsive-capture-runtime.js";
import { deleteResponsiveCapture, writeResponsiveCapture } from "./responsive-capture-store.js";
import {
  inferResponsiveCaptureEvidence,
  loadResponsiveInferenceEvidence,
} from "./responsive-inference-runtime.js";
import {
  deleteResponsiveInference,
  writeResponsiveInference,
} from "./responsive-inference-store.js";
import {
  deleteCaptureArtifacts,
  writeRawSnapshot,
  writeReferenceScreenshot,
} from "./snapshot-store.js";
import { resolveActiveTabSource } from "./source-runtime.js";
import { withFrozenVisualState } from "./visual-state-runtime.js";
import { persistWtfExport } from "./wtf-export-runtime.js";
import { deleteWtfPackage } from "./wtf-package-store.js";

const ASSET_RASTER_FALLBACK_CODES = new Set([
  "ASSET_FETCH_FAILED",
  "ASSET_EMPTY_RESOURCE",
  "ASSET_TOO_LARGE",
  "ASSET_TOTAL_BUDGET_EXCEEDED",
  "ASSET_COUNT_BUDGET_EXCEEDED",
  "ASSET_UNSUPPORTED_MEDIA_TYPE",
  "ASSET_HASH_FAILED",
  "ASSET_REFERENCE_INVALID",
  "ASSET_REFERENCE_UNSUPPORTED",
]);

function shellInfo(): W2fShellInfo {
  const cdp = getCdpRuntimeCapability();
  return {
    shellVersion: W2F_EXTENSION_SHELL_VERSION,
    manifestVersion: 3,
    captureImplemented: true,
    standardCaptureImplemented: true,
    cdpCaptureImplemented: true,
    regionSelectionImplemented: true,
    responsiveCaptureImplemented: true,
    captureProfile: cdp.buildProfile,
    cdpAvailable: cdp.available,
    syntheticResponsiveAvailable: cdp.available,
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
    deleteBaseLayoutAnalysis(jobId),
    deleteTableLayoutResult(jobId),
    deleteRenderTreeOptimization(jobId),
    deleteCompositingAnalysis(jobId),
    deleteWtfPackage(jobId),
  ]);
}

async function deleteResponsiveArtifacts(
  jobId: string,
  plans: readonly ResponsiveViewportPlan[],
): Promise<void> {
  await Promise.allSettled([
    deleteResponsiveCapture(jobId),
    deleteResponsiveInference(jobId),
    deleteWtfPackage(jobId),
    ...plans.map((plan) => deleteAllCaptureArtifacts(responsiveArtifactId(jobId, plan.id))),
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

async function persistBaseLayoutAnalysis(
  jobId: string,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "layoutAnalysisStorageKey"
    | "layoutNodeCount"
    | "layoutDiagnosticCount"
    | "layoutFlexNodeCount"
    | "layoutGridNodeCount"
    | "layoutAbsoluteNodeCount"
  >
> {
  const analysis = await analyzePersistedBaseLayout(jobId);
  const layoutAnalysisStorageKey = await writeBaseLayoutAnalysis(jobId, analysis);
  const summary = summarizeBaseLayoutAnalysis(analysis);
  return {
    layoutAnalysisStorageKey,
    layoutNodeCount: summary.nodeCount,
    layoutDiagnosticCount: summary.diagnosticCount,
    layoutFlexNodeCount: summary.flexNodeCount,
    layoutGridNodeCount: summary.gridNodeCount,
    layoutAbsoluteNodeCount: summary.absoluteNodeCount,
  };
}

async function persistTableLayout(
  jobId: string,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "tableLayoutStorageKey"
    | "tableCount"
    | "tableRowCount"
    | "tableCellCount"
    | "tableSpannedCellCount"
    | "tableLayoutDiagnosticCount"
  >
> {
  const result = await analyzePersistedTables(jobId);
  const tableLayoutStorageKey = await writeTableLayoutResult(jobId, result);
  const summary = summarizeTableLayout(result);
  return {
    tableLayoutStorageKey,
    tableCount: summary.tableCount,
    tableRowCount: summary.rowCount,
    tableCellCount: summary.cellCount,
    tableSpannedCellCount: summary.spannedCellCount,
    tableLayoutDiagnosticCount: summary.diagnosticCount,
  };
}

async function persistRenderTreeOptimization(
  jobId: string,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "renderTreeStorageKey"
    | "renderNodeCount"
    | "foldedSourceNodeCount"
    | "renderSectionCount"
    | "componentCandidateCount"
    | "componentCandidateGroupCount"
    | "renderTreeDiagnosticCount"
  >
> {
  const result = await optimizePersistedRenderTree(jobId);
  const renderTreeStorageKey = await writeRenderTreeOptimization(jobId, result);
  const summary = summarizeRenderTreeOptimization(result);
  return {
    renderTreeStorageKey,
    renderNodeCount: summary.renderNodeCount,
    foldedSourceNodeCount: summary.foldedSourceNodeCount,
    renderSectionCount: summary.sectionCount,
    componentCandidateCount: summary.componentCandidateCount,
    componentCandidateGroupCount: summary.componentCandidateGroupCount,
    renderTreeDiagnosticCount: summary.diagnosticCount,
  };
}

async function persistCompositingAnalysis(
  jobId: string,
): Promise<
  Pick<
    CaptureSnapshotReceipt,
    | "compositingStorageKey"
    | "fallbackBoundaryCount"
    | "fallbackMemberNodeCount"
    | "fallbackTriggerNodeCount"
    | "promotedFallbackBoundaryCount"
    | "compositingDiagnosticCount"
  >
> {
  const result = await analyzePersistedCompositing(jobId);
  const compositingStorageKey = await writeCompositingAnalysis(jobId, result);
  const summary = summarizeCompositingAnalysis(result);
  return {
    compositingStorageKey,
    fallbackBoundaryCount: summary.fallbackBoundaryCount,
    fallbackMemberNodeCount: summary.fallbackMemberNodeCount,
    fallbackTriggerNodeCount: summary.fallbackTriggerNodeCount,
    promotedFallbackBoundaryCount: summary.promotedBoundaryCount,
    compositingDiagnosticCount: summary.diagnosticCount,
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

function sameBounds(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  const epsilon = 1e-6;
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.width - right.width) <= epsilon &&
    Math.abs(left.height - right.height) <= epsilon
  );
}

function fallbackBoundaryRasterRequests(
  snapshot: RawSnapshot,
  compositing: CompositingAnalysisResult,
): Array<{ sourceNodeId: string; reason: string }> {
  const rawById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const renderById = new Map(compositing.tree.nodes.map((node) => [node.id, node]));
  return compositing.boundaries.flatMap((boundary) => {
    const renderNode = renderById.get(boundary.rootRenderNodeId);
    if (!renderNode) return [];
    const geometryMatched = renderNode.sourceNodeIds.find((sourceNodeId) => {
      const bounds = rawById.get(sourceNodeId)?.geometry?.bounds;
      return bounds ? sameBounds(bounds, boundary.bounds) : false;
    });
    const sourceNodeId =
      geometryMatched ??
      [...renderNode.sourceNodeIds].reverse().find((candidate) => rawById.has(candidate));
    if (!sourceNodeId) return [];
    return [
      {
        sourceNodeId,
        reason: "compositing-boundary:" + boundary.id + ";" + boundary.reasons.join(";"),
      },
    ];
  });
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
  const assetCapture = await readAssetCapture(jobId);
  const compositing = await readCompositingAnalysis(jobId);
  const fallbackRequests = [
    ...(assetCapture?.diagnostics ?? []).flatMap((diagnostic) =>
      diagnostic.sourceNodeId && ASSET_RASTER_FALLBACK_CODES.has(diagnostic.code)
        ? [
            {
              sourceNodeId: diagnostic.sourceNodeId,
              reason: `asset:${diagnostic.code}`,
            },
          ]
        : [],
    ),
    ...(compositing ? fallbackBoundaryRasterRequests(snapshot, compositing) : []),
  ];
  const capture = await capturePixelGroundTruthForSnapshot(tabId, snapshot, fallbackRequests);
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
    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);
    const tableReceipt = await persistTableLayout(jobId);
    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);
    const compositingReceipt = await persistCompositingAnalysis(jobId);
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
        ...layoutReceipt,
        ...tableReceipt,
        ...renderTreeReceipt,
        ...compositingReceipt,
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
  persistLegacyReferenceScreenshot = true,
): Promise<{ snapshot: RawSnapshot; receipt: CaptureSnapshotReceipt }> {
  const result = await captureHighFidelityWithCdp(tabId, captureTarget, fallbackUrl, fallbackTitle);
  if (!isRawSnapshot(result.snapshot) || result.snapshot.adapter !== "cdp") {
    throw new Error("CDP capture returned an invalid RawSnapshot");
  }

  try {
    const storageKey = await writeRawSnapshot(jobId, result.snapshot);
    const referenceScreenshotKey = persistLegacyReferenceScreenshot
      ? await writeReferenceScreenshot(jobId, result.screenshot)
      : undefined;
    const cascadeReceipt = await persistCssCascade(tabId, jobId, result.snapshot);
    const layoutReceipt = await persistBaseLayoutAnalysis(jobId);
    const tableReceipt = await persistTableLayout(jobId);
    const renderTreeReceipt = await persistRenderTreeOptimization(jobId);
    const compositingReceipt = await persistCompositingAnalysis(jobId);
    const environmentReceipt = await persistEnvironment(tabId, jobId, result.snapshot);
    const assetReceipt = await persistAssets(tabId, jobId, result.snapshot);
    const pixelGroundTruthReceipt = await persistPixelGroundTruth(tabId, jobId, result.snapshot);
    return {
      snapshot: result.snapshot,
      receipt: {
        ...summarizeRawSnapshot(result.snapshot),
        storageKey,
        ...(referenceScreenshotKey ? { referenceScreenshotKey } : {}),
        capturedAt: result.snapshot.capturedAt,
        ...cascadeReceipt,
        ...layoutReceipt,
        ...tableReceipt,
        ...renderTreeReceipt,
        ...compositingReceipt,
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

async function startShellJob(
  mode: Exclude<CaptureJobMode, "responsive">,
): Promise<CaptureJobState> {
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
    const { snapshot, receipt } = await withFrozenVisualState(tabId, () =>
      capturePreferredDom(tabId, jobId, captureTarget, tab.url, tab.title),
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

function responsiveSnapshotInput(
  plan: ResponsiveViewportPlan,
  artifactId: string,
  snapshot: RawSnapshot,
  receipt: CaptureSnapshotReceipt,
  stableNodes: Awaited<ReturnType<typeof buildResponsiveStableNodeEvidence>>,
): ResponsiveSnapshotInput {
  if (!receipt.environmentStorageKey) {
    throw new Error(`Responsive snapshot ${plan.id} is missing EnvironmentCapture persistence`);
  }
  return {
    plan,
    ref: {
      id: plan.id,
      viewport: {
        width: snapshot.environment.viewportWidth,
        height: snapshot.environment.viewportHeight,
        dpr: snapshot.environment.scale.context.devicePixelRatio,
      },
      rootNodeId: snapshot.rootCaptureNodeId,
      environmentRef: receipt.environmentStorageKey,
    },
    artifactId,
    artifacts: {
      rawSnapshot: receipt.storageKey,
      ...(receipt.cssCascadeStorageKey ? { cssCascade: receipt.cssCascadeStorageKey } : {}),
      environment: receipt.environmentStorageKey,
      ...(receipt.assetStorageKey ? { assets: receipt.assetStorageKey } : {}),
      ...(receipt.pixelGroundTruthStorageKey
        ? { pixelGroundTruth: receipt.pixelGroundTruthStorageKey }
        : {}),
    },
    stableNodes,
  };
}

function responsiveReceipt(
  storageKey: string,
  capture: ReturnType<typeof buildResponsiveCapture>,
  inferenceStorageKey: string,
  inference: ReturnType<typeof inferResponsiveCaptureEvidence>,
): ResponsiveCaptureReceipt {
  const summary = summarizeResponsiveCapture(capture);
  const inferenceSummary = summarizeResponsiveInference(inference);
  return {
    storageKey,
    mode: capture.mode,
    plannedViewportCount: summary.plannedViewportCount,
    capturedSnapshotCount: summary.capturedSnapshotCount,
    stableNodeEvidenceCount: summary.stableNodeEvidenceCount,
    diagnosticCount: summary.diagnosticCount,
    viewportWidths: capture.plannedViewports.map((viewport) => viewport.width),
    inferenceStorageKey,
    responsiveRuleCount: inferenceSummary.ruleCount,
    breakpointCandidateCount: inferenceSummary.breakpointCandidateCount,
    responsiveSizingDecisionCount: inferenceSummary.sizingDecisionCount,
    responsiveInferenceDiagnosticCount: inferenceSummary.diagnosticCount,
  };
}

async function startResponsiveJob(request: ResponsiveCaptureRequest): Promise<CaptureJobState> {
  const jobId = crypto.randomUUID();
  let job = createCaptureJob("responsive", jobId);
  let plans: ResponsiveViewportPlan[] = [];
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

    const baseViewport = await probeCurrentViewport(tabId);
    plans = planResponsiveViewports(request, baseViewport);
    const cdp = getCdpRuntimeCapability();
    if (plans.some((plan) => plan.source === "synthetic") && !cdp.available) {
      throw new Error(
        "Common and Custom responsive capture require the High Fidelity build; Standard supports Current Viewport only.",
      );
    }

    job = transitionCaptureJob(
      job,
      "running",
      "capturing-responsive-0-of-" + plans.length,
      new Date(),
      {
        tabId,
        source: descriptor,
        responsivePlan: plans,
      },
    );
    await writeJobState(job);

    const snapshots: ResponsiveSnapshotInput[] = [];
    let firstPage: PageProbe | undefined;
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      if (!plan) continue;
      const cancelledBefore = await wasJobCancelled(jobId);
      if (cancelledBefore) {
        await deleteResponsiveArtifacts(jobId, plans);
        return cancelledBefore;
      }

      job = transitionCaptureJob(
        job,
        "running",
        `capturing-responsive-${index + 1}-of-${plans.length}`,
      );
      await writeJobState(job);

      const artifactId = responsiveArtifactId(jobId, plan.id);
      const captureOperation = () =>
        withFrozenVisualState(tabId, () =>
          captureCdpDom(tabId, artifactId, { type: "document" }, tab.url, tab.title, false),
        );
      const result =
        plan.source === "synthetic"
          ? await withHighFidelityViewportOverride(tabId, plan, captureOperation)
          : await withFrozenVisualState(tabId, () =>
              capturePreferredDom(tabId, artifactId, { type: "document" }, tab.url, tab.title),
            );
      assertSnapshotMatchesResponsivePlan(result.snapshot, plan);
      const stableNodes = await buildResponsiveStableNodeEvidence(result.snapshot);
      snapshots.push(
        responsiveSnapshotInput(plan, artifactId, result.snapshot, result.receipt, stableNodes),
      );
      firstPage ??= pageProbeFromSnapshot(result.snapshot);

      const cancelledAfter = await wasJobCancelled(jobId);
      if (cancelledAfter) {
        await deleteResponsiveArtifacts(jobId, plans);
        return cancelledAfter;
      }
    }

    const capture = buildResponsiveCapture({
      request,
      baseViewport,
      snapshots,
    });
    if (capture.snapshots.length !== plans.length) {
      throw new Error(
        `Responsive capture incomplete: ${capture.snapshots.length}/${plans.length} snapshots persisted`,
      );
    }
    const storageKey = await writeResponsiveCapture(jobId, capture);
    const inferenceEvidence = await loadResponsiveInferenceEvidence(jobId);
    const inference = inferResponsiveCaptureEvidence(
      inferenceEvidence.capture,
      inferenceEvidence.children,
    );
    const inferenceStorageKey = await writeResponsiveInference(jobId, inference);
    job = transitionCaptureJob(job, "completed", "responsive-capture-complete", new Date(), {
      tabId,
      source: descriptor,
      ...(firstPage ? { page: firstPage } : {}),
      responsivePlan: plans,
      responsive: responsiveReceipt(storageKey, capture, inferenceStorageKey, inference),
    });
    await writeJobState(job);
    return job;
  } catch (error) {
    await deleteResponsiveArtifacts(jobId, plans);
    const current = await readJobState();
    if (current?.jobId === jobId && current.status === "cancelled") return current;
    job = transitionCaptureJob(job, "failed", "responsive-capture-failed", new Date(), {
      error: error instanceof Error ? error.message : String(error),
      ...(plans.length > 0 ? { responsivePlan: plans } : {}),
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
  if (current.mode === "responsive") {
    await deleteResponsiveArtifacts(jobId, current.responsivePlan ?? []);
  } else {
    await deleteAllCaptureArtifacts(jobId);
  }
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
    case "W2F_START_RESPONSIVE_JOB":
      return shellSuccess(request.type, await startResponsiveJob(request.capture));
    case "W2F_CANCEL_JOB":
      return shellSuccess(request.type, await cancelShellJob(request.jobId));
    case "W2F_EXPORT_WTF": {
      const current = await readJobState();
      if (!current || current.jobId !== request.jobId) {
        throw new Error("capture job is no longer available for export");
      }
      if (current.status !== "completed") {
        throw new Error("only completed capture jobs can be exported");
      }
      return shellSuccess(request.type, await persistWtfExport(request.jobId));
    }
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
