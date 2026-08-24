import type { WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";

export const W2F_FIGMA_PROTOCOL = "w2f-figma-plugin" as const;
export const W2F_FIGMA_PROTOCOL_VERSION = 1 as const;
export const W2F_FIGMA_SHELL_VERSION = "1.0.0" as const;

export const W2F_IMPORT_PROFILES = ["high-fidelity", "balanced", "design-friendly"] as const;
export type W2fImportProfile = (typeof W2F_IMPORT_PROFILES)[number];

export const W2F_IMPORT_SCOPES = ["whole-page", "selected-sections"] as const;
export type W2fImportScope = (typeof W2F_IMPORT_SCOPES)[number];

export const W2F_TOKEN_POLICIES = ["literal"] as const;
export type W2fTokenPolicy = (typeof W2F_TOKEN_POLICIES)[number];

export const W2F_INTAKE_SOURCES = ["choose", "ui-drop", "canvas-drop"] as const;
export type W2fIntakeSource = (typeof W2F_INTAKE_SOURCES)[number];

export const W2F_IMPORT_PROGRESS_STAGES = [
  "idle",
  "reading",
  "awaiting-secure-parser",
  "validating",
  "migrating",
  "preview-ready",
  "importing",
  "finalizing",
  "done",
  "failed",
  "cancelled",
] as const;
export type W2fImportProgressStage = (typeof W2F_IMPORT_PROGRESS_STAGES)[number];

export interface W2fCanvasPoint {
  x: number;
  y: number;
}

export interface W2fFileIntakeDescriptor {
  intakeId: string;
  source: W2fIntakeSource;
  fileName: string;
  mimeType: string;
  byteLength: number;
  canvasPoint?: W2fCanvasPoint;
}

export interface W2fSectionOutlineItem {
  id: string;
  name: string;
  depth: number;
  parentId?: string;
  renderNodeIds: string[];
  sourceStableIds: string[];
  defaultSelected: boolean;
}

export interface W2fRevisionPreview {
  documentId: string;
  captureId: string;
  revisionId?: string;
  parentRevisionId?: string;
}

export interface W2fParserPreview {
  intakeId: string;
  sourceUrl?: string;
  title?: string;
  renderNodeCount: number;
  assetCount: number;
  referenceCount: number;
  sectionOutline: W2fSectionOutlineItem[];
  revision: W2fRevisionPreview;
  stableSourceMappingCount: number;
  tokenUsageCount: number;
  tokenPolicy: W2fTokenPolicy;
}

export interface W2fImportSelection {
  profile: W2fImportProfile;
  scope: W2fImportScope;
  selectedSectionIds: string[];
  tokenPolicy: W2fTokenPolicy;
}

export interface W2fBasicRenderRequest {
  intakeId: string;
  renderTree: WtfRenderTree;
  sourceGraph: WtfSourceGraph;
  profile: W2fImportProfile;
  mode: "whole-page" | "selected-roots";
  selectedRootIds: string[];
  tokenPolicy: "literal";
  destination?: W2fCanvasPoint;
  importName?: string;
}

export interface W2fBasicRenderResult {
  intakeId: string;
  rootNodeId: string;
  createdNodeCount: number;
  mappedRenderNodeCount: number;
}

export interface W2fImportProgress {
  stage: W2fImportProgressStage;
  completed: number;
  total: number;
  label: string;
  detail?: string;
}

export interface W2fFigmaShellInfo {
  version: typeof W2F_FIGMA_SHELL_VERSION;
  protocolVersion: typeof W2F_FIGMA_PROTOCOL_VERSION;
  fileExtension: ".wtf";
  mimeType: "application/x-wtf";
  mainUiSplit: true;
  chooseFileImplemented: true;
  uiDropImplemented: true;
  canvasDropImplemented: true;
  partialImportContractImplemented: true;
  secureParserImplemented: true;
  rendererImplemented: true;
  defaultImportProfile: "balanced";
  defaultTokenPolicy: "literal";
}

export type W2fMainToUiPayload =
  | { type: "W2F_SHELL_INFO"; info: W2fFigmaShellInfo }
  | { type: "W2F_FILE_BYTES"; descriptor: W2fFileIntakeDescriptor; bytes: Uint8Array }
  | { type: "W2F_PARSER_PREVIEW"; preview: W2fParserPreview }
  | { type: "W2F_RENDER_RESULT"; result: W2fBasicRenderResult }
  | { type: "W2F_PROGRESS"; progress: W2fImportProgress }
  | { type: "W2F_ERROR"; code: string; message: string };

export type W2fUiToMainPayload =
  | { type: "W2F_UI_READY" }
  | { type: "W2F_INTAKE_METADATA"; descriptor: W2fFileIntakeDescriptor }
  | { type: "W2F_IMPORT_SELECTION"; selection: W2fImportSelection }
  | { type: "W2F_RENDER_BASIC_REQUEST"; request: W2fBasicRenderRequest }
  | { type: "W2F_CANCEL_IMPORT" }
  | { type: "W2F_CLOSE_PLUGIN" };

export interface W2fFigmaMessage<TPayload> {
  protocol: typeof W2F_FIGMA_PROTOCOL;
  version: typeof W2F_FIGMA_PROTOCOL_VERSION;
  payload: TPayload;
}

export function figmaMessage<TPayload>(payload: TPayload): W2fFigmaMessage<TPayload> {
  return {
    protocol: W2F_FIGMA_PROTOCOL,
    version: W2F_FIGMA_PROTOCOL_VERSION,
    payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFinitePoint(value: unknown): value is W2fCanvasPoint {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

export function isW2fImportProfile(value: unknown): value is W2fImportProfile {
  return typeof value === "string" && (W2F_IMPORT_PROFILES as readonly string[]).includes(value);
}

export function isW2fImportScope(value: unknown): value is W2fImportScope {
  return typeof value === "string" && (W2F_IMPORT_SCOPES as readonly string[]).includes(value);
}

export function isW2fFileIntakeDescriptor(value: unknown): value is W2fFileIntakeDescriptor {
  if (!isRecord(value)) return false;
  return (
    typeof value.intakeId === "string" &&
    value.intakeId.length > 0 &&
    typeof value.source === "string" &&
    (W2F_INTAKE_SOURCES as readonly string[]).includes(value.source) &&
    typeof value.fileName === "string" &&
    value.fileName.length > 0 &&
    typeof value.mimeType === "string" &&
    typeof value.byteLength === "number" &&
    Number.isSafeInteger(value.byteLength) &&
    value.byteLength >= 0 &&
    (value.canvasPoint === undefined || isFinitePoint(value.canvasPoint))
  );
}

export function isW2fImportSelection(value: unknown): value is W2fImportSelection {
  if (!isRecord(value)) return false;
  return (
    isW2fImportProfile(value.profile) &&
    isW2fImportScope(value.scope) &&
    isStringArray(value.selectedSectionIds) &&
    value.tokenPolicy === "literal"
  );
}

export function isW2fBasicRenderRequest(value: unknown): value is W2fBasicRenderRequest {
  if (!isRecord(value)) return false;
  if (
    typeof value.intakeId !== "string" ||
    value.intakeId.length === 0 ||
    !isW2fImportProfile(value.profile) ||
    (value.mode !== "whole-page" && value.mode !== "selected-roots") ||
    !isStringArray(value.selectedRootIds) ||
    value.tokenPolicy !== "literal" ||
    !isRecord(value.renderTree) ||
    typeof value.renderTree.rootId !== "string" ||
    !Array.isArray(value.renderTree.nodes) ||
    !isRecord(value.sourceGraph) ||
    typeof value.sourceGraph.rootCaptureNodeId !== "string" ||
    !Array.isArray(value.sourceGraph.nodes) ||
    !isRecord(value.sourceGraph.revision)
  ) {
    return false;
  }
  if (value.destination !== undefined && !isFinitePoint(value.destination)) return false;
  if (value.importName !== undefined && typeof value.importName !== "string") return false;
  return true;
}

export function isW2fUiToMainMessage(value: unknown): value is W2fFigmaMessage<W2fUiToMainPayload> {
  if (
    !isRecord(value) ||
    value.protocol !== W2F_FIGMA_PROTOCOL ||
    value.version !== W2F_FIGMA_PROTOCOL_VERSION
  ) {
    return false;
  }
  if (!isRecord(value.payload) || typeof value.payload.type !== "string") return false;
  switch (value.payload.type) {
    case "W2F_UI_READY":
    case "W2F_CANCEL_IMPORT":
    case "W2F_CLOSE_PLUGIN":
      return true;
    case "W2F_INTAKE_METADATA":
      return isW2fFileIntakeDescriptor(value.payload.descriptor);
    case "W2F_IMPORT_SELECTION":
      return isW2fImportSelection(value.payload.selection);
    case "W2F_RENDER_BASIC_REQUEST":
      return isW2fBasicRenderRequest(value.payload.request);
    default:
      return false;
  }
}
