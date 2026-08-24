import type { WtfBorderSide, WtfPaintFill, WtfRenderNode } from "@w2f/w2f-ir";
import { createColorPlan, sameColor } from "../color.js";
import {
  W2F_PAINT_RENDER_PLAN_VERSION,
  type W2fBorderPlan,
  type W2fBorderSidePlan,
  type W2fFillPlan,
  type W2fGradientFillPlan,
  type W2fImageScaleModePlan,
  type W2fPaintRenderPlan,
  type W2fShadowPlan,
} from "./types.js";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`W2F_RENDERER_PAINT: ${label} must be finite`);
  return value;
}

function nonNegative(value: number, label: string): number {
  const checked = finite(value, label);
  if (checked < 0) throw new TypeError(`W2F_RENDERER_PAINT: ${label} must be non-negative`);
  return checked;
}

function unitOpacity(value: number): number {
  const checked = finite(value, "opacity");
  if (checked < 0 || checked > 1) {
    throw new TypeError("W2F_RENDERER_PAINT: opacity must be between 0 and 1");
  }
  return checked;
}

function imageScaleMode(fit: string | undefined): W2fImageScaleModePlan | undefined {
  switch (fit?.trim().toLowerCase()) {
    case "cover":
      return "CROP";
    case "contain":
    case "scale-down":
      return "FIT";
    case "fill":
      return "FILL";
    case "tile":
    case "repeat":
      return "TILE";
    default:
      return undefined;
  }
}

function gradientPlan(fill: Extract<WtfPaintFill, { type: "linear-gradient" | "radial-gradient" | "conic-gradient" }>): W2fGradientFillPlan {
  let lastOffset = Number.NEGATIVE_INFINITY;
  let monotonic = true;
  const stops = fill.stops.map((stop) => {
    const offset = finite(stop.offset, "gradient stop offset");
    if (offset < lastOffset) monotonic = false;
    lastOffset = offset;
    return {
      offset,
      color: createColorPlan(stop.color),
      withinFigmaRange: offset >= 0 && offset <= 1,
    };
  });
  const kind =
    fill.type === "linear-gradient"
      ? "GRADIENT_LINEAR"
      : fill.type === "radial-gradient"
        ? "GRADIENT_RADIAL"
        : "GRADIENT_ANGULAR";
  const defaultAngle = fill.type === "linear-gradient" ? 180 : fill.type === "conic-gradient" ? 0 : undefined;
  const angleDeg = fill.angleDeg ?? defaultAngle;
  if (angleDeg !== undefined) finite(angleDeg, "gradient angle");
  return {
    kind,
    stops,
    ...(angleDeg !== undefined ? { angleDeg } : {}),
    ...(fill.authoredValue ? { authoredValue: fill.authoredValue } : {}),
    nativeCompatible: stops.length >= 2 && monotonic && stops.every((stop) => stop.withinFigmaRange),
  };
}

function fillPlan(fill: WtfPaintFill): W2fFillPlan {
  if (fill.type === "solid") {
    return { kind: "SOLID", color: createColorPlan(fill.color) };
  }
  if (fill.type === "image") {
    const assetId = fill.assetId.trim();
    if (!assetId) throw new TypeError("W2F_RENDERER_PAINT: image fill assetId must not be empty");
    const preferredScaleMode = imageScaleMode(fill.fit);
    return {
      kind: "IMAGE",
      assetId,
      ...(fill.fit ? { fit: fill.fit } : {}),
      ...(preferredScaleMode ? { preferredScaleMode } : {}),
      ...(fill.authoredValue ? { authoredValue: fill.authoredValue } : {}),
    };
  }
  return gradientPlan(fill);
}

function borderSide(side: WtfBorderSide, name: W2fBorderSidePlan["side"]): W2fBorderSidePlan {
  return {
    side: name,
    width: nonNegative(side.width, `${name} border width`),
    style: side.style,
    color: createColorPlan(side.color),
  };
}

function sameBorderSide(left: W2fBorderSidePlan, right: W2fBorderSidePlan): boolean {
  return left.width === right.width && left.style === right.style && sameColor(left.color, right.color);
}

function createBorderPlan(node: WtfRenderNode): W2fBorderPlan {
  const border = node.paint.border;
  if (!border) {
    return { mode: "NONE", sides: [], nativeSingleStrokeCompatible: true };
  }
  const sides: W2fBorderSidePlan[] = [];
  if (border.top) sides.push(borderSide(border.top, "top"));
  if (border.right) sides.push(borderSide(border.right, "right"));
  if (border.bottom) sides.push(borderSide(border.bottom, "bottom"));
  if (border.left) sides.push(borderSide(border.left, "left"));

  const uniform = sides.length === 4 && sides.slice(1).every((side) => sameBorderSide(sides[0]!, side));
  const radius = border.radius
    ? {
        topLeft: nonNegative(border.radius.topLeft, "top-left radius"),
        topRight: nonNegative(border.radius.topRight, "top-right radius"),
        bottomRight: nonNegative(border.radius.bottomRight, "bottom-right radius"),
        bottomLeft: nonNegative(border.radius.bottomLeft, "bottom-left radius"),
      }
    : undefined;
  return {
    mode: sides.length === 0 ? "NONE" : uniform ? "UNIFORM" : "PER_SIDE",
    sides,
    ...(radius ? { radius } : {}),
    nativeSingleStrokeCompatible: sides.length === 0 || uniform,
  };
}

function shadowPlans(node: WtfRenderNode): W2fShadowPlan[] {
  return (node.paint.shadows ?? []).map((shadow) => ({
    kind: shadow.inset ? "INNER_SHADOW" : "DROP_SHADOW",
    offsetX: finite(shadow.offsetX, "shadow offsetX"),
    offsetY: finite(shadow.offsetY, "shadow offsetY"),
    cssBlur: nonNegative(shadow.blur, "shadow blur"),
    cssSpread: finite(shadow.spread, "shadow spread"),
    color: createColorPlan(shadow.color),
    nativeCompatible: shadow.blur >= 0,
  }));
}

function activeCssValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return undefined;
  return trimmed;
}

export function createPaintRenderPlan(node: WtfRenderNode): W2fPaintRenderPlan {
  const clipPath = activeCssValue(node.paint.clipPath);
  const maskImage = activeCssValue(node.paint.maskImage);
  const overflowX = node.layout.overflowX?.trim().toLowerCase();
  const overflowY = node.layout.overflowY?.trim().toLowerCase();
  const clipsContent = [overflowX, overflowY].some((value) => value === "hidden" || value === "clip");
  return {
    version: W2F_PAINT_RENDER_PLAN_VERSION,
    renderNodeId: node.id,
    fills: node.paint.fills.map(fillPlan),
    border: createBorderPlan(node),
    shadows: shadowPlans(node),
    opacity: unitOpacity(node.paint.opacity),
    ...(node.paint.blendMode ? { blendMode: node.paint.blendMode } : {}),
    clip: {
      clipsContent,
      complexClip: Boolean(clipPath || maskImage),
      ...(clipPath ? { clipPath } : {}),
      ...(maskImage ? { maskImage } : {}),
    },
    sourceStableIds: [...(node.sourceStableIds ?? [])],
    ...(node.revisionHashes ? { revisionHashes: { ...node.revisionHashes } } : {}),
  };
}
