import type { WtfRenderNode, WtfRenderNodeKind, WtfRenderStrategy } from "@w2f/w2f-ir";

export const W2F_RENDER_PROFILES = ["fidelity", "balanced", "design-friendly"] as const;
export type W2fRenderProfile = (typeof W2F_RENDER_PROFILES)[number];
export type W2fRenderProfileInput = W2fRenderProfile | "high-fidelity";

export const FIGMA_CAPABILITY_KEYS = [
  "autoLayout",
  "fillSizing",
  "hugSizing",
  "grid",
  "gridSpan",
  "minMaxSizing",
  "svgImport",
  "textMixedStyles",
  "absoluteInAutoLayout",
  "imageTransform",
] as const;

export type FigmaCapabilityKey = (typeof FIGMA_CAPABILITY_KEYS)[number];
export type FigmaCapabilityState = "native" | "emulated" | "partial" | "unsupported";

export const W2F_RESOLUTION_STRATEGIES = [
  "NATIVE",
  "EMULATED",
  "WRAPPER",
  "ABSOLUTE",
  "RASTER",
  "UNSUPPORTED",
] as const;
export type W2fResolutionStrategy = (typeof W2F_RESOLUTION_STRATEGIES)[number];

export type FigmaNativeContextRequirement =
  | "always"
  | "frame-like-target"
  | "auto-layout-parent"
  | "grid-parent"
  | "auto-layout-target-or-parent"
  | "text-target"
  | "crop-image-transform";

export interface FigmaCapabilityRecord {
  key: FigmaCapabilityKey;
  state: FigmaCapabilityState;
  nativeContext: FigmaNativeContextRequirement;
  emulationAvailable: boolean;
  wrapperEligible: boolean;
  absoluteEligible: boolean;
  rasterEligible: boolean;
  evidence: readonly string[];
  note: string;
}

export interface FigmaCapabilityRegistry {
  snapshotId: string;
  pluginTypingsVersion: string;
  records: Readonly<Record<FigmaCapabilityKey, FigmaCapabilityRecord>>;
}

export type W2fFigmaLayoutContext = "none" | "auto-layout" | "grid";
export type W2fFigmaTargetLayout = "none" | "auto-layout" | "grid";

export interface W2fCapabilityContext {
  parentLayout: W2fFigmaLayoutContext;
  targetLayout: W2fFigmaTargetLayout;
  canInsertWrapper: boolean;
  canUseAbsolutePositioning: boolean;
  rasterEvidenceAvailable: boolean;
  featureVariant?: string;
}

export interface W2fCapabilityRequest {
  capability: FigmaCapabilityKey;
  nodeKind: WtfRenderNodeKind;
  profile: W2fRenderProfileInput;
  context: W2fCapabilityContext;
  preferredStrategy?: WtfRenderStrategy;
  sourceStableIds?: readonly string[];
  revisionHashes?: WtfRenderNode["revisionHashes"];
  tokenPolicy?: "literal";
}

export interface W2fCapabilityPlan {
  capability: FigmaCapabilityKey;
  capabilityState: FigmaCapabilityState;
  profile: W2fRenderProfile;
  strategy: W2fResolutionStrategy;
  renderStrategy: WtfRenderStrategy;
  requiresWrapper: boolean;
  reasons: readonly string[];
  registrySnapshotId: string;
  sourceStableIds: readonly string[];
  revisionHashes?: WtfRenderNode["revisionHashes"];
  tokenPolicy: "literal";
  preservesRevisionMetadata: true;
  preservesStableSourceMapping: true;
}

export interface W2fRenderNodeCapabilityRequest {
  node: WtfRenderNode;
  capability: FigmaCapabilityKey;
  profile: W2fRenderProfileInput;
  context: W2fCapabilityContext;
}
