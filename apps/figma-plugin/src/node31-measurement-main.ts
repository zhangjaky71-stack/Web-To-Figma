import {
  evaluateStructureAndEditabilityQa,
  W2F_PLUGIN_DATA_KEYS,
} from "@w2f/figma-renderer";
import type { WtfRenderNode } from "@w2f/w2f-ir";
import { inspectFigmaSceneForQa } from "./figma-qa.js";
import {
  isNode31UiToMainMessage,
  node31MeasurementMessage,
  type W2fNode31ExpectedDocumentIdentity,
  type W2fNode31MeasureRequest,
  type W2fNode31SelectedRootInfo,
} from "./node31-measurement-protocol.js";

declare const __html__: string;

function post(payload: Parameters<typeof node31MeasurementMessage>[0]): void {
  figma.ui.postMessage(node31MeasurementMessage(payload));
}

function error(code: string, cause: unknown): void {
  post({
    type: "NODE31_ERROR",
    code,
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

function selectedRoot(): SceneNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (!node || node.type !== "FRAME") return null;
  return node;
}

function selectedRootInfo(): W2fNode31SelectedRootInfo {
  const root = selectedRoot();
  if (!root) {
    return {
      ok: false,
      reason: "Select exactly one imported W2F root Frame before measuring.",
    };
  }
  const documentId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.documentId);
  const captureId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.captureId);
  const revisionId = root.getPluginData(W2F_PLUGIN_DATA_KEYS.revisionId);
  const sourceFingerprint = root.getPluginData(W2F_PLUGIN_DATA_KEYS.sourceFingerprint);
  if (!documentId || !captureId || !revisionId || !sourceFingerprint) {
    return {
      ok: false,
      reason: "Selected Frame is not a committed W2F import root with complete source identity.",
      nodeId: root.id,
      nodeName: root.name,
    };
  }
  return {
    ok: true,
    nodeId: root.id,
    nodeName: root.name,
    documentId,
    captureId,
    revisionId,
    sourceFingerprint,
  };
}

function assertIdentity(root: SceneNode, expected: W2fNode31ExpectedDocumentIdentity): void {
  const actual = {
    documentId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.documentId),
    captureId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.captureId),
    revisionId: root.getPluginData(W2F_PLUGIN_DATA_KEYS.revisionId),
    sourceFingerprint: root.getPluginData(W2F_PLUGIN_DATA_KEYS.sourceFingerprint),
  };
  for (const key of ["documentId", "captureId", "revisionId", "sourceFingerprint"] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Selected Figma root does not match the parsed WTF ${key}: expected ${expected[key]}, got ${actual[key] || "<missing>"}`,
      );
    }
  }
}

function countSceneNodes(root: SceneNode): number {
  let count = 0;
  const stack: SceneNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    count += 1;
    if ("children" in node) {
      for (const child of (node as SceneNode & ChildrenMixin).children) stack.push(child);
    }
  }
  return count;
}

async function exportTiles(
  root: FrameNode,
  rootBounds: WtfRenderNode["geometry"]["bounds"],
  request: W2fNode31MeasureRequest,
) {
  let qaPage: PageNode | null = null;
  try {
    qaPage = figma.createPage();
    qaPage.name = "__W2F_NODE31_DESKTOP_MEASUREMENT__";
    await qaPage.loadAsync();
    const clone = root.clone();
    qaPage.appendChild(clone);
    clone.x = rootBounds.x - request.reference.bounds.x;
    clone.y = rootBounds.y - request.reference.bounds.y;

    const tiles = [];
    for (const tile of request.reference.tiles) {
      const slice = figma.createSlice();
      qaPage.appendChild(slice);
      slice.x = tile.bounds.x - request.reference.bounds.x;
      slice.y = tile.bounds.y - request.reference.bounds.y;
      slice.resize(Math.max(0.01, tile.bounds.width), Math.max(0.01, tile.bounds.height));
      try {
        const pngBytes = await slice.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: request.reference.dpr },
        });
        tiles.push({ tileId: tile.id, pngBytes });
      } finally {
        slice.remove();
      }
    }
    return tiles;
  } finally {
    if (qaPage) {
      try {
        qaPage.remove();
      } catch {
        // Cleanup must never mutate or invalidate the selected committed import.
      }
    }
  }
}

async function measure(request: W2fNode31MeasureRequest): Promise<void> {
  const measurementStartedAt = new Date().toISOString();
  const root = selectedRoot();
  if (!root) throw new Error("Select exactly one imported W2F root Frame before measuring.");
  assertIdentity(root, request.expectedIdentity);

  const rootRenderNode = request.renderTree.nodes.find(
    (node) => node.id === request.expectedIdentity.rootRenderNodeId,
  );
  if (!rootRenderNode || request.renderTree.rootId !== rootRenderNode.id) {
    throw new Error("Measurement request root does not match the secure parsed render tree root.");
  }

  const sceneNodes = inspectFigmaSceneForQa(root);
  const structureQa = evaluateStructureAndEditabilityQa({
    renderTree: request.renderTree,
    sceneNodes,
  });
  if (structureQa.status === "FAIL") {
    throw new Error(`Structure/editability QA failed: ${structureQa.failures.join("; ")}`);
  }

  const tiles = await exportTiles(root, rootRenderNode.geometry.bounds, request);
  if (tiles.length !== request.reference.tiles.length) {
    throw new Error(
      `Figma Desktop exported ${tiles.length} tiles; expected ${request.reference.tiles.length}`,
    );
  }

  post({
    type: "NODE31_MEASUREMENT_RESULT",
    result: {
      sampleId: request.sampleId,
      rootNodeId: root.id,
      createdNodeCount: countSceneNodes(root),
      mappedRenderNodeCount: structureQa.metrics.mappedNodeCount,
      measurementStartedAt,
      measurementCompletedAt: new Date().toISOString(),
      host: {
        apiVersion: figma.apiVersion,
        editorType: figma.editorType,
      },
      structureQa,
      tiles,
    },
  });
}

figma.showUI(__html__, {
  width: 480,
  height: 640,
  title: "W2F NODE-31 Desktop Measurement",
  themeColors: true,
});

figma.ui.onmessage = (message: unknown) => {
  if (!isNode31UiToMainMessage(message)) {
    error("NODE31_E_PROTOCOL", "Rejected invalid Desktop measurement message");
    return;
  }
  switch (message.payload.type) {
    case "NODE31_UI_READY":
    case "NODE31_REFRESH_SELECTION":
      post({ type: "NODE31_SELECTION", selection: selectedRootInfo() });
      return;
    case "NODE31_MEASURE":
      void measure(message.payload.request).catch((cause) => error("NODE31_E_MEASURE", cause));
      return;
    case "NODE31_CLOSE":
      figma.closePlugin();
      return;
  }
};
