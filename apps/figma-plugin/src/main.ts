import { renderBasicFigmaScene, W2fBasicRendererError } from "@w2f/figma-renderer";
import { createFigmaBasicAdapter } from "./figma-basic-adapter.js";
import {
  applyFigmaHybridRasterFallbacks,
  effectiveSelectedRootIds,
  renderTreeForNativePass,
  W2fHybridRasterError,
} from "./figma-hybrid-renderer.js";
import { applyFigmaLayouts } from "./figma-layout-renderer.js";
import { applyFigmaVisuals, type W2fVisualAssetBundle } from "./figma-visual-renderer.js";
import { createFileIntakeDescriptor } from "./intake-state.js";
import {
  figmaMessage,
  isW2fUiToMainMessage,
  type W2fBasicRenderRequest,
  type W2fFigmaShellInfo,
  type W2fImportSelection,
} from "./protocol.js";

declare const __html__: string;

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

function postToUi(payload: Parameters<typeof figmaMessage>[0]): void {
  figma.ui.postMessage(figmaMessage(payload));
}

function postError(code: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  postToUi({ type: "W2F_ERROR", code, message });
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

async function handleBasicRender(request: W2fBasicRenderRequest): Promise<void> {
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
      total: 4,
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
        total: 4,
        label: "Restoring editable text, assets and paint",
        detail:
          "Native-compatible layers stay editable; raster boundaries are excluded from SVG/text replacement.",
      },
    });

    const visual = await applyFigmaVisuals(
      result.nodesByRenderNodeId,
      renderTreeForNativePass(request.renderTree),
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
        total: 4,
        label: "Applying minimal raster fallbacks",
        detail:
          "Only source-bound node fallback, canvas, WebGL or video evidence may become raster tiles.",
      },
    });

    const raster = applyFigmaHybridRasterFallbacks(visual.nodesByRenderNodeId, request.renderTree, {
      references: request.rasterReferences ?? [],
      tilePayloadsByPath: request.rasterTilePayloadsByPath ?? {},
    });
    if (cancelled) {
      renderedRoot.remove();
      return;
    }

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "finalizing",
        completed: 3,
        total: 4,
        label: "Finalizing hybrid editable import",
        detail: `${visual.stats.textNodeCount.toLocaleString()} text · ${visual.stats.imageFillCount.toLocaleString()} image fills · ${layout.autoLayoutFrameCount.toLocaleString()} Auto Layout · ${layout.gridFrameCount.toLocaleString()} Grid · ${raster.rasterNodeCount.toLocaleString()} local raster fallback(s)`,
      },
    });
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
        completed: 4,
        total: 4,
        label: "Hybrid Figma import complete",
        detail:
          raster.rasterNodeCount > 0
            ? `Kept native layers editable and materialized ${raster.rasterTileNodeCount} PNG tile(s) inside ${raster.rasterNodeCount} minimal fallback boundary frame(s); ${raster.suppressedNativeDescendantCount} unsafe descendant layer(s) stayed suppressed.`
            : `Restored native-compatible content without raster fallback. Auto Layout ${layout.autoLayoutFrameCount}, Grid ${layout.gridFrameCount}, font fallbacks ${visual.stats.fontFallbackCount}.`,
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
