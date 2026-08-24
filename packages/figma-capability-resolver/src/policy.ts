import type { WtfRenderStrategy } from "@w2f/w2f-ir";
import type {
  FigmaCapabilityRecord,
  W2fCapabilityRequest,
  W2fRenderProfile,
  W2fRenderProfileInput,
  W2fResolutionStrategy,
} from "./types.js";

export const PROFILE_ORDER: Readonly<Record<W2fRenderProfile, readonly W2fResolutionStrategy[]>> = {
  fidelity: ["NATIVE", "WRAPPER", "ABSOLUTE", "RASTER", "EMULATED", "UNSUPPORTED"],
  balanced: ["NATIVE", "WRAPPER", "EMULATED", "ABSOLUTE", "RASTER", "UNSUPPORTED"],
  "design-friendly": ["NATIVE", "WRAPPER", "EMULATED", "ABSOLUTE", "RASTER", "UNSUPPORTED"],
};

export const STRATEGY_TO_RENDER: Readonly<Record<W2fResolutionStrategy, WtfRenderStrategy>> = {
  NATIVE: "native",
  EMULATED: "emulated",
  WRAPPER: "wrapper",
  ABSOLUTE: "absolute",
  RASTER: "raster",
  UNSUPPORTED: "unsupported",
};

const FRAME_LIKE_KINDS = new Set([
  "document",
  "section",
  "container",
  "table",
  "row",
  "cell",
  "control",
]);

export function normalizeRenderProfile(profile: W2fRenderProfileInput): W2fRenderProfile {
  return profile === "high-fidelity" ? "fidelity" : profile;
}

export function nativeContextSatisfied(
  record: FigmaCapabilityRecord,
  request: W2fCapabilityRequest,
): boolean {
  const { context, nodeKind } = request;
  switch (record.nativeContext) {
    case "always":
      return true;
    case "frame-like-target":
      return FRAME_LIKE_KINDS.has(nodeKind);
    case "auto-layout-parent":
      return context.parentLayout === "auto-layout" || context.parentLayout === "grid";
    case "grid-parent":
      return context.parentLayout === "grid";
    case "auto-layout-target-or-parent":
      return (
        context.targetLayout === "auto-layout" ||
        context.targetLayout === "grid" ||
        context.parentLayout === "auto-layout" ||
        context.parentLayout === "grid" ||
        nodeKind === "text"
      );
    case "text-target":
      return nodeKind === "text";
    case "crop-image-transform":
      return context.featureVariant === "crop";
  }
}
