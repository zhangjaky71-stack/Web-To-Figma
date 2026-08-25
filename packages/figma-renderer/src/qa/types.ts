import type { WtfRenderTree } from "@w2f/w2f-ir";

export const W2F_NODE29_QA_VERSION = "1.0.0" as const;

export const W2F_NODE29_THRESHOLDS = {
  deterministicVisualSimilarity: 0.99,
  realisticVisualSimilarity: 0.95,
  deterministicStructureScore: 0.95,
  supportedEditableAreaRatio: 0.9,
  supportedRasterAreaRatio: 0.15,
} as const;

export type W2fQaStatus = "PASS" | "WARNING" | "FAIL" | "UNAVAILABLE";

export type W2fEditableClass =
  | "text"
  | "vector"
  | "image"
  | "container"
  | "raster"
  | "other";

export interface W2fFigmaQaNodeSnapshot {
  figmaNodeId: string;
  renderNodeId?: string;
  parentRenderNodeId?: string;
  siblingIndex: number;
  name: string;
  nodeType: string;
  editableClass: W2fEditableClass;
  visible: boolean;
  width: number;
  height: number;
  pluginData: Readonly<Record<string, string>>;
}

export interface W2fStructureQaInput {
  renderTree: WtfRenderTree;
  sceneNodes: readonly W2fFigmaQaNodeSnapshot[];
  includedRenderNodeIds?: readonly string[];
}

export interface W2fStructureQaMetrics {
  expectedNodeCount: number;
  mappedNodeCount: number;
  suppressedRasterDescendantCount: number;
  mappingCompleteness: number;
  parentCorrectness: number;
  siblingOrderCorrectness: number;
  metadataCorrectness: number;
  structureScore: number;
  editableAreaRatio: number;
  rasterAreaRatio: number;
}

export interface W2fStructureQaReport {
  version: typeof W2F_NODE29_QA_VERSION;
  status: W2fQaStatus;
  metrics: W2fStructureQaMetrics;
  failures: readonly string[];
  warnings: readonly string[];
}

export interface W2fVisualPixelMetrics {
  pixelCount: number;
  meanAbsoluteChannelError: number;
  rootMeanSquaredChannelError: number;
  maxChannelError: number;
  changedPixelRatio: number;
  normalizedSimilarity: number;
}

export interface W2fVisualQaReport {
  version: typeof W2F_NODE29_QA_VERSION;
  status: W2fQaStatus;
  target: "deterministic" | "realistic";
  metrics: W2fVisualPixelMetrics;
  threshold: number;
}
