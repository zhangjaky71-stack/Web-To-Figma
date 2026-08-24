import { renderBasicFigmaScene, W2fBasicRendererError } from "@w2f/figma-renderer";
import type { WtfAssetRecord } from "@w2f/w2f-ir";
import { createFigmaBasicAdapter } from "./figma-basic-adapter.js";
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

type W2fNode26RenderRequest = W2fBasicRenderRequest & {
  assets?: readonly WtfAssetRecord[];
  assetPayloadsById?: Readonly<Record<string, Uint8Array>>;
  sanitizedSvgById?: Readonly<Record<string, string>>;
};

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

function visualBundle(request: W2fNode26RenderRequest): W2fVisualAssetBundle {
  return {
    assets: request.assets ?? [],
    assetPayloadsById: request.assetPayloadsById ?? {},
    sanitizedSvgById: request.sanitizedSvgById ?? {},
  };
}

async function handleBasicRender(baseRequest: W2fBasicRenderRequest): Promise<void> {
  const request = baseRequest as W2fNode26RenderRequest;
  if (cancelled) return;
  if (
    request.profile !== importSelection.profile ||
    request.tokenPolicy !== importSelection.tokenPolicy
  ) {
    postError("W2F_E_RENDER_SELECTION_STALE", "Import selection changed before renderer handoff");
    return;
  }

  postToUi({
    type: "W2F_PROGRESS",
    progress: {
      stage: "importing",
      completed: 0,
      total: 3,
      label: "Creating editable Figma scene",
      detail: "Rebuilding hierarchy and geometry before text, assets and paint are applied.",
    },
  });

  let renderedRoot: FrameNode | null = null;
  try {
    const result = renderBasicFigmaScene(createFigmaBasicAdapter(), {
      renderTree: request.renderTree,
      sourceGraph: request.sourceGraph,
      profile: request.profile,
      mode: request.mode,
      selectedRootIds: request.selectedRootIds,
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
        total: 3,
        label: "Restoring text, assets and paint",
        detail: "Loading local fonts and embedded .wtf assets; SVG stays editable when available.",
      },
    });

    const visual = await applyFigmaVisuals(
      result.nodesByRenderNodeId,
      request.renderTree,
      visualBundle(request),
    );
    if (cancelled) {
      renderedRoot.remove();
      return;
    }

    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "finalizing",
        completed: 2,
        total: 3,
        label: "Finalizing editable import",
        detail: `${visual.stats.textNodeCount.toLocaleString()} text · ${visual.stats.imageFillCount.toLocaleString()} image fills · ${visual.stats.editableSvgCount.toLocaleString()} editable SVGs`,
      },
    });
    postToUi({
      type: "W2F_RENDER_RESULT",
      result: {
        intakeId: request.intakeId,
        rootNodeId: result.root.id,
        createdNodeCount: result.createdNodeCount,
        mappedRenderNodeCount: visual.nodesByRenderNodeId.size,
      },
    });
    postToUi({
      type: "W2F_PROGRESS",
      progress: {
        stage: "done",
        completed: 3,
        total: 3,
        label: "Editable Figma import complete",
        detail:
          visual.stats.missingAssetCount > 0
            ? `${visual.stats.missingAssetCount} embedded asset(s) were unavailable; all other supported visuals were restored.`
            : `Text, embedded images, SVG vectors, fills, borders, radii, shadows and opacity were restored. Font fallbacks: ${visual.stats.fontFallbackCount}.`,
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
    if (error instanceof W2fBasicRendererError) {
      postError(error.code, error);
      return;
    }
    postError("W2F_E_VISUAL_RENDERER", error);
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
