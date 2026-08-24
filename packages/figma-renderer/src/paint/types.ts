import type { WtfRenderNode } from "@w2f/w2f-ir";
import type { W2fColorPlan } from "../color.js";

export const W2F_PAINT_RENDER_PLAN_VERSION = "1.0.0" as const;

export interface W2fSolidFillPlan {
  kind: "SOLID";
  color: W2fColorPlan;
}

export interface W2fGradientStopPlan {
  offset: number;
  color: W2fColorPlan;
  withinFigmaRange: boolean;
}

export interface W2fGradientFillPlan {
  kind: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR";
  stops: readonly W2fGradientStopPlan[];
  angleDeg?: number;
  authoredValue?: string;
  nativeCompatible: boolean;
}

export type W2fImageScaleModePlan = "FILL" | "FIT" | "CROP" | "TILE";

export interface W2fImageFillPlan {
  kind: "IMAGE";
  assetId: string;
  fit?: string;
  preferredScaleMode?: W2fImageScaleModePlan;
  authoredValue?: string;
}

export type W2fFillPlan = W2fSolidFillPlan | W2fGradientFillPlan | W2fImageFillPlan;

export interface W2fBorderSidePlan {
  side: "top" | "right" | "bottom" | "left";
  width: number;
  style: string;
  color: W2fColorPlan;
}

export interface W2fCornerRadiusPlan {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface W2fBorderPlan {
  mode: "NONE" | "UNIFORM" | "PER_SIDE";
  sides: readonly W2fBorderSidePlan[];
  radius?: W2fCornerRadiusPlan;
  nativeSingleStrokeCompatible: boolean;
}

export interface W2fShadowPlan {
  kind: "DROP_SHADOW" | "INNER_SHADOW";
  offsetX: number;
  offsetY: number;
  cssBlur: number;
  cssSpread: number;
  color: W2fColorPlan;
  nativeCompatible: boolean;
}

export interface W2fClipPlan {
  clipsContent: boolean;
  complexClip: boolean;
  clipPath?: string;
  maskImage?: string;
}

export interface W2fPaintRenderPlan {
  version: typeof W2F_PAINT_RENDER_PLAN_VERSION;
  renderNodeId: string;
  fills: readonly W2fFillPlan[];
  border: W2fBorderPlan;
  shadows: readonly W2fShadowPlan[];
  opacity: number;
  blendMode?: string;
  clip: W2fClipPlan;
  sourceStableIds: readonly string[];
  revisionHashes?: WtfRenderNode["revisionHashes"];
}
