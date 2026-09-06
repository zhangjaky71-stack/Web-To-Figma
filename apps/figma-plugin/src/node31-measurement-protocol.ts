import type { WtfAssetRecord, WtfRenderTree } from "@w2f/w2f-ir";
import type { Rect, WtfReferenceTileDescriptor } from "@w2f/w2f-schema";
import type { W2fStructureQaReport } from "@w2f/figma-renderer";
import type {
  W2fNode31ObservedGeometryNode,
  W2fNode31ObservedTextNode,
} from "./node31-desktop-metrics.js";

export const W2F_NODE31_MEASUREMENT_PROTOCOL = "w2f-node31-desktop-measurement" as const;
export const W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION = 1 as const;

export interface W2fNode31ExpectedDocumentIdentity {
  documentId: string;
  captureId: string;
  revisionId: string;
  sourceFingerprint: string;
  rootRenderNodeId: string;
}

export interface W2fNode31PixelReference {
  id: string;
  bounds: Rect;
  dpr: number;
  tiles: WtfReferenceTileDescriptor[];
}

export interface W2fNode31MeasureRequest {
  sampleId: string;
  renderTree: WtfRenderTree;
  assets: readonly WtfAssetRecord[];
  expectedIdentity: W2fNode31ExpectedDocumentIdentity;
  reference: W2fNode31PixelReference;
}

export interface W2fNode31SelectedRootInfo {
  ok: boolean;
  reason?: string;
  nodeId?: string;
  nodeName?: string;
  documentId?: string;
  captureId?: string;
  revisionId?: string;
  sourceFingerprint?: string;
}

export interface W2fNode31ExportTile {
  tileId: string;
  pngBytes: Uint8Array;
}

export interface W2fNode31DesktopMeasurementResult {
  sampleId: string;
  rootNodeId: string;
  createdNodeCount: number;
  mappedRenderNodeCount: number;
  measurementStartedAt: string;
  measurementCompletedAt: string;
  host: {
    apiVersion: string;
    editorType: string;
  };
  structureQa: W2fStructureQaReport;
  observedGeometry: readonly W2fNode31ObservedGeometryNode[];
  observedText: readonly W2fNode31ObservedTextNode[];
  appliedAssetIds: readonly string[];
  tiles: readonly W2fNode31ExportTile[];
}

export type W2fNode31UiToMainPayload =
  | { type: "NODE31_UI_READY" }
  | { type: "NODE31_REFRESH_SELECTION" }
  | { type: "NODE31_MEASURE"; request: W2fNode31MeasureRequest }
  | { type: "NODE31_CLOSE" };

export type W2fNode31MainToUiPayload =
  | { type: "NODE31_SELECTION"; selection: W2fNode31SelectedRootInfo }
  | { type: "NODE31_MEASUREMENT_RESULT"; result: W2fNode31DesktopMeasurementResult }
  | { type: "NODE31_ERROR"; code: string; message: string };

export interface W2fNode31MeasurementMessage<TPayload> {
  protocol: typeof W2F_NODE31_MEASUREMENT_PROTOCOL;
  version: typeof W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION;
  payload: TPayload;
}

export function node31MeasurementMessage<TPayload>(
  payload: TPayload,
): W2fNode31MeasurementMessage<TPayload> {
  return {
    protocol: W2F_NODE31_MEASUREMENT_PROTOCOL,
    version: W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION,
    payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteRect(value: unknown): value is Rect {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
}

function isReferenceTile(value: unknown): value is WtfReferenceTileDescriptor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    typeof value.viewportId === "string" &&
    value.viewportId.length > 0 &&
    isFiniteRect(value.bounds) &&
    typeof value.dpr === "number" &&
    Number.isFinite(value.dpr) &&
    value.dpr > 0 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(value.sha256)
  );
}

function isMeasureRequest(value: unknown): value is W2fNode31MeasureRequest {
  if (!isRecord(value)) return false;
  if (
    typeof value.sampleId !== "string" ||
    value.sampleId.length === 0 ||
    !isRecord(value.renderTree) ||
    typeof value.renderTree.rootId !== "string" ||
    !Array.isArray(value.renderTree.nodes) ||
    !Array.isArray(value.assets) ||
    !isRecord(value.expectedIdentity) ||
    !isRecord(value.reference)
  ) {
    return false;
  }
  const identity = value.expectedIdentity;
  if (
    !["documentId", "captureId", "revisionId", "sourceFingerprint", "rootRenderNodeId"].every(
      (key) => typeof identity[key] === "string" && (identity[key] as string).length > 0,
    )
  ) {
    return false;
  }
  const reference = value.reference;
  return (
    typeof reference.id === "string" &&
    reference.id.length > 0 &&
    isFiniteRect(reference.bounds) &&
    typeof reference.dpr === "number" &&
    Number.isFinite(reference.dpr) &&
    reference.dpr > 0 &&
    Array.isArray(reference.tiles) &&
    reference.tiles.length > 0 &&
    reference.tiles.every(isReferenceTile)
  );
}

export function isNode31UiToMainMessage(
  value: unknown,
): value is W2fNode31MeasurementMessage<W2fNode31UiToMainPayload> {
  if (
    !isRecord(value) ||
    value.protocol !== W2F_NODE31_MEASUREMENT_PROTOCOL ||
    value.version !== W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION ||
    !isRecord(value.payload) ||
    typeof value.payload.type !== "string"
  ) {
    return false;
  }
  switch (value.payload.type) {
    case "NODE31_UI_READY":
    case "NODE31_REFRESH_SELECTION":
    case "NODE31_CLOSE":
      return true;
    case "NODE31_MEASURE":
      return isMeasureRequest(value.payload.request);
    default:
      return false;
  }
}
