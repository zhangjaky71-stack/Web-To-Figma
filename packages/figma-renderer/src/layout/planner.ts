import type { WtfCssLength, WtfRenderNode, WtfSizingDecision } from "@w2f/w2f-ir";
import type {
  W2fAutoLayoutChildPlan,
  W2fAutoLayoutContainerPlan,
  W2fAutoLayoutPlan,
  W2fAutoLayoutPlannerInput,
  W2fFigmaCounterAlign,
  W2fFigmaPrimaryAlign,
  W2fFigmaSizingMode,
} from "./types.js";

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolvedPx(value: WtfCssLength | undefined): number | undefined {
  if (!value) return undefined;
  if (typeof value.resolvedPx === "number" && Number.isFinite(value.resolvedPx)) {
    return Math.max(0, value.resolvedPx);
  }
  if (value.semantic.type === "px" && Number.isFinite(value.semantic.value)) {
    return Math.max(0, value.semantic.value);
  }
  return undefined;
}

function sizingMode(decision: WtfSizingDecision, allowFill: boolean): W2fFigmaSizingMode {
  switch (decision.mode) {
    case "fill":
      return allowFill ? "FILL" : "FIXED";
    case "hug":
    case "intrinsic":
    case "content":
      return "HUG";
    default:
      return "FIXED";
  }
}

function primaryAlign(value: string, reasons: string[]): W2fFigmaPrimaryAlign {
  switch (value.trim().toLowerCase()) {
    case "flex-end":
    case "end":
    case "right":
      return "MAX";
    case "center":
      return "CENTER";
    case "space-between":
      return "SPACE_BETWEEN";
    case "space-around":
    case "space-evenly":
      reasons.push(`justify-content:${value} has no exact Figma Auto Layout equivalent`);
      return "MIN";
    default:
      return "MIN";
  }
}

function counterAlign(
  value: string,
  horizontal: boolean,
  reasons: string[],
): { value: W2fFigmaCounterAlign; stretch: boolean } {
  switch (value.trim().toLowerCase()) {
    case "flex-end":
    case "end":
      return { value: "MAX", stretch: false };
    case "center":
      return { value: "CENTER", stretch: false };
    case "baseline":
      if (horizontal) return { value: "BASELINE", stretch: false };
      reasons.push("baseline alignment is only native on horizontal Figma Auto Layout");
      return { value: "MIN", stretch: false };
    case "stretch":
      return { value: "MIN", stretch: true };
    default:
      return { value: "MIN", stretch: false };
  }
}

function childSizing(
  child: WtfRenderNode,
  parentHorizontal: boolean,
  parentStretch: boolean,
): W2fAutoLayoutChildPlan {
  const item = child.layout.flexItem;
  const absolutePositioned = child.layout.position === "absolute" || child.layout.position === "fixed";
  let horizontalSizing = sizingMode(child.layout.sizing.width, true);
  let verticalSizing = sizingMode(child.layout.sizing.height, true);
  const grow = finiteNonNegative(item?.grow) > 0 ? 1 : 0;

  if (!absolutePositioned && grow === 1) {
    if (parentHorizontal) horizontalSizing = "FILL";
    else verticalSizing = "FILL";
  }

  const alignSelf = item?.alignSelf?.trim().toLowerCase();
  const counterAxisStretch = !absolutePositioned && (alignSelf === "stretch" || (!alignSelf && parentStretch));
  if (counterAxisStretch) {
    if (parentHorizontal) verticalSizing = "FILL";
    else horizontalSizing = "FILL";
  }

  return {
    renderNodeId: child.id,
    horizontalSizing,
    verticalSizing,
    layoutGrow: grow,
    counterAxisStretch,
    absolutePositioned,
    order: typeof item?.order === "number" && Number.isFinite(item.order) ? item.order : 0,
    ...(resolvedPx(child.layout.sizing.width.min) !== undefined
      ? { minWidth: resolvedPx(child.layout.sizing.width.min) }
      : {}),
    ...(resolvedPx(child.layout.sizing.width.max) !== undefined
      ? { maxWidth: resolvedPx(child.layout.sizing.width.max) }
      : {}),
    ...(resolvedPx(child.layout.sizing.height.min) !== undefined
      ? { minHeight: resolvedPx(child.layout.sizing.height.min) }
      : {}),
    ...(resolvedPx(child.layout.sizing.height.max) !== undefined
      ? { maxHeight: resolvedPx(child.layout.sizing.height.max) }
      : {}),
  };
}

export function createAutoLayoutPlan(input: W2fAutoLayoutPlannerInput): W2fAutoLayoutPlan | null {
  const { container } = input;
  if (container.layout.mode !== "flex" || !container.layout.flexContainer) return null;

  const flex = container.layout.flexContainer;
  const horizontal = flex.direction === "row" || flex.direction === "row-reverse";
  const reverseChildren = flex.direction === "row-reverse" || flex.direction === "column-reverse";
  const reasons: string[] = [];
  if (flex.wrap === "wrap-reverse") reasons.push("flex-wrap:wrap-reverse has no exact Figma equivalent");

  const counter = counterAlign(flex.alignItems, horizontal, reasons);
  const padding = container.layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const rowGap = finiteNonNegative(flex.rowGap ?? container.layout.effectiveGap?.row);
  const columnGap = finiteNonNegative(flex.columnGap ?? container.layout.effectiveGap?.column);
  const itemSpacing = horizontal ? columnGap : rowGap;
  const counterAxisSpacing = horizontal ? rowGap : columnGap;

  const containerPlan: W2fAutoLayoutContainerPlan = {
    renderNodeId: container.id,
    mode: horizontal ? "HORIZONTAL" : "VERTICAL",
    wrap: flex.wrap === "nowrap" ? "NO_WRAP" : "WRAP",
    reverseChildren,
    primaryAlign: primaryAlign(flex.justifyContent, reasons),
    counterAlign: counter.value,
    counterAlignStretch: counter.stretch,
    itemSpacing,
    ...(flex.wrap !== "nowrap" ? { counterAxisSpacing } : {}),
    padding: {
      top: finiteNonNegative(padding.top),
      right: finiteNonNegative(padding.right),
      bottom: finiteNonNegative(padding.bottom),
      left: finiteNonNegative(padding.left),
    },
    horizontalSizing: sizingMode(container.layout.sizing.width, false) === "HUG" ? "HUG" : "FIXED",
    verticalSizing: sizingMode(container.layout.sizing.height, false) === "HUG" ? "HUG" : "FIXED",
    strokesIncludedInLayout: true,
    nativeCompatible: reasons.length === 0,
    reasons,
  };

  const children = input.children
    .map((child) => childSizing(child, horizontal, counter.stretch))
    .sort((left, right) => left.order - right.order);

  return { container: containerPlan, children };
}
