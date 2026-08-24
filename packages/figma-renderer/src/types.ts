import type { W2fCapabilityPlan, W2fRenderProfileInput } from "@w2f/figma-capability-resolver";
import type {
  WtfRenderNode,
  WtfRenderNodeKind,
  WtfRenderStrategy,
  WtfRenderTree,
  WtfSourceGraph,
} from "@w2f/w2f-ir";

export const W2F_BASIC_RENDERER_VERSION = "1.0.0" as const;
export const W2F_IMPORTING_ROOT_NAME = "__W2F_IMPORTING__" as const;

export const W2F_PLUGIN_DATA_KEYS = {
  nodeId: "w2f.nodeId",
  sourceNodeIds: "w2f.sourceNodeIds",
  sourceStableIds: "w2f.sourceStableIds",
  sourceKind: "w2f.sourceKind",
  sourceTag: "w2f.sourceTag",
  sourceSelector: "w2f.sourceSelector",
  renderStrategy: "w2f.renderStrategy",
  revisionHashes: "w2f.revisionHashes",
  importVersion: "w2f.importVersion",
  tokenPolicy: "w2f.tokenPolicy",
  renderProfile: "w2f.renderProfile",
  documentId: "w2f.documentId",
  captureId: "w2f.captureId",
  revisionId: "w2f.revisionId",
  sourceFingerprint: "w2f.sourceFingerprint",
  importScope: "w2f.importScope",
  transactionState: "w2f.transactionState",
} as const;

export type W2fBasicFigmaNodeType = "FRAME" | "RECTANGLE";
export type W2fBasicImportMode = "whole-page" | "selected-roots";
export type W2fBasicTransactionState = "importing" | "committed";

export interface W2fPoint {
  x: number;
  y: number;
}

export interface W2fBasicGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface W2fBasicRendererInput {
  renderTree: WtfRenderTree;
  sourceGraph?: WtfSourceGraph;
  mode?: W2fBasicImportMode;
  selectedRootIds?: readonly string[];
  destination?: W2fPoint;
  importName?: string;
  profile: W2fRenderProfileInput;
  tokenPolicy?: "literal";
  capabilityPlansByNodeId?: Readonly<Record<string, readonly W2fCapabilityPlan[]>>;
}

export interface W2fBasicNodePlan {
  renderNodeId: string;
  parentRenderNodeId?: string;
  nodeType: W2fBasicFigmaNodeType;
  sourceKind: WtfRenderNodeKind;
  name: string;
  absoluteGeometry: W2fBasicGeometry;
  localGeometry: W2fBasicGeometry;
  sourceNodeIds: readonly string[];
  sourceStableIds: readonly string[];
  revisionHashes?: WtfRenderNode["revisionHashes"];
  renderStrategy: WtfRenderStrategy;
  pluginData: Readonly<Record<string, string>>;
}

export interface W2fBasicRootPlan {
  sourceRenderNodeId?: string;
  name: string;
  sourceOrigin: W2fPoint;
  geometry: W2fBasicGeometry;
  pluginData: Readonly<Record<string, string>>;
}

export interface W2fBasicRenderPlan {
  version: typeof W2F_BASIC_RENDERER_VERSION;
  mode: W2fBasicImportMode;
  root: W2fBasicRootPlan;
  nodes: readonly W2fBasicNodePlan[];
  selectedRootIds: readonly string[];
  profile: W2fRenderProfileInput;
  tokenPolicy: "literal";
}

export interface W2fBasicFigmaAdapter<TNode> {
  createFrame(): TNode;
  createRectangle(): TNode;
  appendChild(parent: TNode, child: TNode): void;
  setName(node: TNode, name: string): void;
  setGeometry(node: TNode, geometry: W2fBasicGeometry): void;
  setPluginData(node: TNode, key: string, value: string): void;
  remove(node: TNode): void;
  validateRoot?(root: TNode): void;
  setSelection?(nodes: readonly TNode[]): void;
  focusNodes?(nodes: readonly TNode[]): void;
}

export interface W2fBasicRenderResult<TNode> {
  root: TNode;
  createdNodeCount: number;
  mappedRenderNodeIds: readonly string[];
  nodesByRenderNodeId: ReadonlyMap<string, TNode>;
  committed: true;
}

export type W2fBasicRendererErrorCode =
  | "W2F_RENDERER_INPUT"
  | "W2F_RENDERER_TREE"
  | "W2F_RENDERER_GEOMETRY"
  | "W2F_RENDERER_ADAPTER";

export class W2fBasicRendererError extends Error {
  readonly code: W2fBasicRendererErrorCode;

  constructor(code: W2fBasicRendererErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "W2fBasicRendererError";
    this.code = code;
  }
}
