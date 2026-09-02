import {
  evaluateStructureAndEditabilityQa,
  renderBasicFigmaScene,
  W2fBasicRendererError,
  type W2fVisualQaReport,
} from "@w2f/figma-renderer";
import type { WtfRenderNode } from "@w2f/w2f-ir";
import { createFigmaBasicAdapter } from "./figma-basic-adapter.js";
import {
  applyFigmaHybridRasterFallbacks,
  effectiveSelectedRootIds,
  renderTreeForNativePass,
  W2fHybridRasterError,
} from "./figma-hybrid-renderer.js";
import { applyFigmaLayouts } from "./figma-layout-renderer.js";
import { inspectFigmaSceneForQa } from "./figma-qa.js";
import { applyFigmaVisuals, type W2fVisualAssetBundle } from "./figma-visual-renderer.js";
import { createFileIntakeDescriptor } from "./intake-state.js";
import type { W2fQaPixelReferenceEvidence } from "./qa-payload.js";
import {
  figmaMessage,
  isW2fUiToMainMessage,
  W2F_FIGMA_PROTOCOL,
  W2F_FIGMA_PROTOCOL_VERSION,
  type W2fBasicRenderRequest,
  type W2fFigmaShellInfo,
  type W2fImportSelection,
} from "./protocol.js";

declare const __html__: string;

type W2fNode29RenderRequest = W2fBasicRenderRequest & {
  qaPixelReference?: W2fQaPixelReferenceEvidence;
};

interface W2fNode29VisualExportTile {
  tileId: string;
  pngBytes: Uint8Array;
}

interface W2fNode29VisualExport {
  referenceId: string;
  tiles: W2fNode29VisualExportTile[];
}

interface W2fNode29VisualResultPayload {
  type: "W2F_QA_VISUAL_RESULT";
  intakeId: string;
  referenceId: string;
  report: W2fVisualQaReport;
  detail: string;
}

interface PendingVisualQa {
  intakeId: string;
  referenceId: string;
  resolve: (result: W2fNode29VisualResultPayload | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const SHELL_INFO: W2fFigmaShellInfo = {
  version: "1.0.0",
  protocolVersion: 1,
  fileExtension: ".wtf",
  mimeType: "application/x-wtf",
  mainUiSplit: true,
  chooseFileImplemented: true,
  uiDropImplemented: true,
  canvasDropImplemented: true,
  partialImportContractImplemented: true,
  secureParserImplemented: true,
  rendererImplemented: true,
  defaultImportProfile: "balanced",
  defaultTokenPolicy: "literal",
};

let importSelection: W2fImportSelection = {
  profile: "balanced",
  scope: "whole-page",
  selectedSectionIds: [],
  tokenPolicy: "literal",
};
let cancelled = false;
let pendingVisualQa: PendingVisualQa | null = null;

function postToUi(payload: Parameters<typeof figmaMessage>[0]): void {
  figma.ui.postMessage(figmaMessage(payload));
}

function postError(code: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  postToUi({ type: "W2F_ERROR", code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNode29VisualResultMessage(value: unknown): value is {
  protocol: typeof W2F_FIGMA_PROTOCOL;
  version: typeof W2F_FIGMA_PROTOCOL_VERSION;
  payload: W2fNode29VisualResultPayload;
} {
  if (!isRecord(value)) return false;
  if (value.protocol !== W2F_FIGMA_PROTOCOL || value.version !== W2F_FIGMA_PROTOCOL_VERSION) {
    return false;
  }
  const payload = value.payload;
  if (!isRecord(payload) || payload.type !== "W2F_QA_VISUAL_RESULT") return false;
  if (
    typeof payload.intakeId !== "string" ||
    typeof payload.referenceId !== "string" ||
    typeof payload.detail !== "string" ||
    !isRecord(payload.report) ||
    !isRecord(payload.report.metrics)
  ) {
    return false;
  }
  const metrics = payload.report.metrics;
  return (
    ["PASS", "WARNING", "FAIL", "UNAVAILABLE"].includes(String(payload.report.status)) &&
    typeof metrics.normalizedSimilarity === "number" &&
    Number.isFinite(metrics.normalizedSimilarity) &&
    metrics.normalizedSimilarity >= 0 &&
    metrics.normalizedSimilarity <= 1
  );
}

function settleVisualQa(payload: W2fNode29VisualResultPayload): void {
  const pending = pendingVisualQa;
  if (
    !pending ||
    pending.intakeId !== payload.intakeId ||
    pending.referenceId !== payload.referenceId
  ) {
    return;
  }
  clearTimeout(pending.timeoutId);
  pendingVisualQa = null;
  pending.resolve(payload);
}

async function handleCanvasDrop(file: DropFile, point: { x: number; y: number }): Promise<void> {
  cancelled = false;
  postToUi({
    type: "W2F_PROGRESS",
    progress: { stage: "reading", completed: 0, total: 1, label: `Reading ${file.name}` },
  });
  try {
    const bytes = await file.getBytesAsync();
    if (cancelled) return;
    const descriptor = createFileIntakeDescriptor({
      source: "canvas-drop",
      fileName: file.name,
      mimeType: file.type,
      byteLength: bytes.byteLength,
      canvasPoint: point,
    });
    postToUi({ type: "W2F_FILE_BYTES", descriptor, bytes: Uint8Array.from(bytes) });
  } catch (error) {
    postError("W2F_E_INTAKE_CANVAS_DROP", error);
  }
}

function visualBundle(request: W2fBasicRenderRequest): W2fVisualAssetBundle {
  return {
    assets: request.assets ?? [],
    assetPayloadsById: request.assetPayloadsById ?? {},
    sanitizedSvgById: request.sanitizedSvgById ?? {},
  };
}

function persistStructureQa(
  root: FrameNode,
  qa: ReturnType<typeof evaluateStructureAndEditabilityQa>,
): void {
  root.setPluginData("w2f.qa.version", qa.version);
  root.setPluginData("w2f.qa.structureStatus", qa.status);
  root.setPluginData("w2f.qa.structureScore", qa.metrics.structureScore.toFixed(6));
  root.setPluginData("w2f.qa.editableAreaRatio", qa.metrics.editableAreaRatio.toFixed(6));
  root.setPluginData("w2f.qa.rasterAreaRatio", qa.metrics.rasterAreaRatio.toFixed(6));
  root.setPluginData("w2f.qa.failureCount", String(qa.failures.length));
}

function persistVisualQa(root: FrameNode, result: W2fNode29VisualResultPayload | null): void {
  if (!result) {
    root.setPluginData("w2f.qa.visualStatus", "UNAVAILABLE");
    return;
  }
  root.setPluginData("w2f.qa.visualStatus", result.report.status);
  root.setPluginData(
    "w2f.qa.visualSimilarity",
    result.report.metrics.normalizedSimilarity.toFixed(6),
  );
  root.setPluginData(
    "w2f.qa.changedPixelRatio",
    result.report.metrics.changedPixelRatio.toFixed(6),
  );
  root.setPluginData("w2f.qa.visualTarget", result.report.target);
  root.setPluginData("w2f.qa.visualReferenceId", result.referenceId);
}

async function exportVisualQaTiles(
  root: FrameNode,
  rootBounds: WtfRenderNode["geometry"]["bounds"],
  reference: W2fQaPixelReferenceEvidence | undefined,
): Promise<W2fNode29VisualExport | undefined> {
  if (!reference) return undefined;
  let qaPage: PageNode | null = null;
  try {
    qaPage = figma.createPage();
    qaPage.name = "__W2F_QA_EXPORT__";
    await qaPage.loadAsync();
    const clone = root.clone();
    qaPage.appendChild(clone);
    clone.x = rootBounds.x - reference.bounds.x;
    clone.y = rootBounds.y - reference.bounds.y;

    const tiles: W2fNode29VisualExportTile[] = [];
    for (const tile of reference.tiles) {
      const slice = figma.createSlice();
      qaPage.appendChild(slice);
      slice.x = tile.bounds.x - reference.bounds.x;
      slice.y = tile.bounds.y - reference.bounds.y;
      slice.resize(Math.max(0.01, tile.bounds.width), Math.max(0.01, tile.bounds.height));
      try {
        const pngBytes = await slice.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: reference.dpr },
        });
        tiles.push({ tileId: tile.id, pngBytes });
      } finally {
        slice.remove();
      }
    }
    return { referenceId: reference.id, tiles };
  } catch (error) {
    root.setPluginData("w2f.qa.visualStatus", "UNAVAILABLE");
    root.setPluginData(
      "w2f.qa.visualUnavailableReason",
      (error instanceof Error ? error.message : String(error)).slice(0, 1024),
    );
    return undefined;
  } finally {
    if (qaPage) {
      try {
        qaPage.remove();
      } catch {
        // QA cleanup must not invalidate a committed import.
      }
    }
  }
}

function requestVisualQa(
  intakeId: string,
  visualExport: W2fNode29VisualExport,
): Promise<W2fNode29VisualResultPayload | null> {
  if (pendingVisualQa) {
    clearTimeout(pendingVisualQa.timeoutId);
    pendingVisualQa.resolve(null);
    pendingVisualQa = null;
  }
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (
        pendingVisualQa?.intakeId === intakeId &&
        pendingVisualQa.referenceId === visualExport.referenceId
      ) {
        pendingVisualQa = null;
        resolve(null);
      }
    }, 15000);
    pendingVisualQa = {
      intakeId,
      referenceId: visualExport.referenceId,
      resolve,
      timeoutId,
    };
    postToUi({
      type: "W2F_QA_VISUAL_EXPORT",
      intakeId,
      referenceId: visualExport.referenceId,
      tiles: visualExport.tiles,
    });
  });
}

async function handleBasicRender(baseRequest: W2fBasicRenderRequest): Promise<void> {
  const request = baseRequest as W2fNode29RenderRequest;
  if (cancelled) return;
  if (
    request.profile !== importSelection.profile ||
    request.tokenPolicy !== importSelection.tokenPolicy
  ) {
    postError("W2F_E_RENDER_SELECTION_STALE", "Import selection changed before renderer handoff");
    return;
  }

  const selectedRootIds = effectiveSelectedRootIds(
    request.renderTree,
    request.mode,
    request.selectedRootIds,
  );

  postToUi({
    type: "W2F_PROGRESS",
    progress: {
      stage: "importing",
      completed: 0,
      total: 6,
      label: "Creating editable Figma scene",
      detail:
        "Rebuilding native hierarchy and geometry while reserving only explicit minimal raster boundaries.",
    },
  });

  let renderedRoot: FrameNode | null = null;
  try {
    const result = renderBasicFigmaScene(createFigmaBasicAdapter(), {
      renderTree: request.renderTree,
      sourceGraph: request.sourceGraph,
      profile: request.profile,
      mode: request.mode,
      selectedRootIds,
      tokenPolicy: request.tokenPolicy,
      ...(request.destination ? { destination: request.destination } : {}),
      ...(request.importName ? { importName: request.importName } : {}),
    });
    renderedRoot = result.root as FrameNode;
    if (cancelled) {
      renderedRoot.remove();
      return;
    }

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "importing",
        completed: 1,
        total: 6,
        label: "Restoring editable text, assets and paint",
        detail:
          "Native-compatible layers stay editable; raster boundaries are excluded from SVG/text replacement.",
      },
    });

    const visual = await applyFigmaVisuals(
      result.nodesByRenderNodeId,
      renderTreeForNativePass(request.renderTree, request.profile),
      visualBundle(request),
    );
    const layout = applyFigmaLayouts(visual.nodesByRenderNodeId, request.renderTree);
    if (cancelled) {
      renderedRoot.remove();
      return;
    }

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "importing",
        completed: 2,
        total: 6,
        label: "Applying minimal raster fallbacks",
        detail:
          "Only source-bound node fallback, canvas, WebGL or video evidence may become raster tiles.",
      },
    });

    const raster = applyFigmaHybridRasterFallbacks(
      visual.nodesByRenderNodeId,
      request.renderTree,
      {
        references: request.rasterReferences ?? [],
        tilePayloadsByPath: request.rasterTilePayloadsByPath ?? {},
      },
      request.profile,
    );
    if (cancelled) {
      renderedRoot.remove();
      return;
    }

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "finalizing",
        completed: 3,
        total: 6,
        label: "Running structure and editability QA",
        detail:
          "Checking source mapping, parent/sibling structure, editable text/vector surfaces and raster anti-cheating gates.",
      },
    });

    const structureQa = evaluateStructureAndEditabilityQa({
      renderTree: request.renderTree,
      sceneNodes: inspectFigmaSceneForQa(renderedRoot),
      ...(request.mode === "selected-roots" ? { includedRenderNodeIds: selectedRootIds } : {}),
    });
    persistStructureQa(renderedRoot, structureQa);

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "finalizing",
        completed: 4,
        total: 6,
        label: `NODE-29 structure QA ${structureQa.status}`,
        detail: `Structure ${(structureQa.metrics.structureScore * 100).toFixed(2)}% · editable ${(structureQa.metrics.editableAreaRatio * 100).toFixed(2)}% · raster ${(structureQa.metrics.rasterAreaRatio * 100).toFixed(2)}% · failures ${structureQa.failures.length}`,
      },
    });

    const rootRenderNode = request.renderTree.nodes.find(
      (node) => node.id === request.renderTree.rootId,
    );
    let visualQa: W2fNode29VisualResultPayload | null = null;
    const visualExport =
      request.mode === "whole-page" && rootRenderNode
        ? await exportVisualQaTiles(
            renderedRoot,
            rootRenderNode.geometry.bounds,
            request.qaPixelReference,
          )
        : undefined;
    if (visualExport) {
      postToUi({
        type: "W2F_PROGRESS",
        progress: {
          stage: "finalizing",
          completed: 5,
          total: 6,
          label: "Comparing Pixel Ground Truth",
          detail: `${visualExport.tiles.length} browser/Figma tile pair(s) are compared locally; no network access is used.`,
        },
      });
      visualQa = await requestVisualQa(request.intakeId, visualExport);
    }
    persistVisualQa(renderedRoot, visualQa);

    postToUi({
      type: "W2F_RENDER_RESULT",
      result: {
        intakeId: request.intakeId,
        rootNodeId: result.root.id,
        createdNodeCount: result.createdNodeCount + raster.rasterTileNodeCount,
        mappedRenderNodeCount: visual.nodesByRenderNodeId.size,
      },
    });
    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "done",
        completed: 6,
        total: 6,
        label: `Hybrid Figma import complete · QA ${structureQa.status}${visualQa ? `/${visualQa.report.status}` : "/UNAVAILABLE"}`,
        detail: `${visual.stats.textNodeCount.toLocaleString()} text · ${visual.stats.imageFillCount.toLocaleString()} image fills · ${layout.autoLayoutFrameCount.toLocaleString()} Auto Layout · ${layout.gridFrameCount.toLocaleString()} Grid · ${raster.rasterNodeCount.toLocaleString()} local raster fallback(s) · structure ${(structureQa.metrics.structureScore * 100).toFixed(2)}% · editable ${(structureQa.metrics.editableAreaRatio * 100).toFixed(2)}% · raster ${(structureQa.metrics.rasterAreaRatio * 100).toFixed(2)}%${visualQa ? ` · ${visualQa.detail}` : " · visual QA unavailable"}`,
      },
    });
  } catch (error) {
    if (renderedRoot) {
      try {
        renderedRoot.remove();
      } catch {
        // Preserve the original rendering failure.
      }
    }
    if (error instanceof W2fBasicRendererError || error instanceof W2fHybridRasterError) {
      postError(error.code, error);
      return;
    }
    postError("W2F_E_HYBRID_RENDERER", error);
  }
}

figma.showUI(__html__, {
  width: 420,
  height: 620,
  title: "W2F Import",
  themeColors: true,
});

figma.ui.onmessage = (message: unknown) => {
  if (isNode29VisualResultMessage(message)) {
    settleVisualQa(message.payload);
    return;
  }
  if (!isW2fUiToMainMessage(message)) {
    postError("W2F_E_PROTOCOL_MESSAGE", "Rejected invalid UI message");
    return;
  }

  switch (message.payload.type) {
    case "W2F_UI_READY":
      postToUi({ type: "W2F_SHELL_INFO", info: SHELL_INFO });
      return;
    case "W2F_INTAKE_METADATA":
      cancelled = false;
      return;
    case "W2F_IMPORT_SELECTION":
      importSelection = { ...message.payload.selection };
      return;
    case "W2F_RENDER_BASIC_REQUEST":
      void handleBasicRender(message.payload.request);
      return;
    case "W2F_CANCEL_IMPORT":
      cancelled = true;
      if (pendingVisualQa) {
        clearTimeout(pendingVisualQa.timeoutId);
        pendingVisualQa.resolve(null);
        pendingVisualQa = null;
      }
      postToUi({
        type: "W2F_PROGRESS",
        progress: { stage: "cancelled", completed: 0, total: 1, label: "Import cancelled" },
      });
      return;
    case "W2F_CLOSE_PLUGIN":
      figma.closePlugin();
      return;
  }
};

figma.on("drop", (event) => {
  const file = event.files.find((candidate) =>
    candidate.name.trim().toLowerCase().endsWith(".wtf"),
  );
  if (!file) return true;
  void handleCanvasDrop(file, { x: event.absoluteX, y: event.absoluteY });
  return false;
});
