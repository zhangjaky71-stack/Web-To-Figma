import type {
  WtfCssLength,
  WtfGridItemModel,
  WtfGridTrack,
  WtfRenderNode,
  WtfSizingDecision,
} from "@w2f/w2f-ir";
import type {
  W2fAutoLayoutChildPlan,
  W2fAutoLayoutContainerPlan,
  W2fAutoLayoutPlan,
  W2fAutoLayoutPlannerInput,
  W2fFigmaCounterAlign,
  W2fFigmaPrimaryAlign,
  W2fFigmaSizingMode,
  W2fGridChildPlan,
  W2fGridLayoutPlan,
  W2fGridLayoutPlannerInput,
  W2fGridTrackPlan,
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
  const absolutePositioned =
    child.layout.position === "absolute" || child.layout.position === "fixed";
  let horizontalSizing = sizingMode(child.layout.sizing.width, true);
  let verticalSizing = sizingMode(child.layout.sizing.height, true);
  const grow = finiteNonNegative(item?.grow) > 0 ? 1 : 0;

  if (!absolutePositioned && grow === 1) {
    if (parentHorizontal) horizontalSizing = "FILL";
    else verticalSizing = "FILL";
  }

  const alignSelf = item?.alignSelf?.trim().toLowerCase();
  const counterAxisStretch =
    !absolutePositioned && (alignSelf === "stretch" || (!alignSelf && parentStretch));
  if (counterAxisStretch) {
    if (parentHorizontal) verticalSizing = "FILL";
    else horizontalSizing = "FILL";
  }

  const minWidth = resolvedPx(child.layout.sizing.width.min);
  const maxWidth = resolvedPx(child.layout.sizing.width.max);
  const minHeight = resolvedPx(child.layout.sizing.height.min);
  const maxHeight = resolvedPx(child.layout.sizing.height.max);

  return {
    renderNodeId: child.id,
    horizontalSizing,
    verticalSizing,
    layoutGrow: grow,
    counterAxisStretch,
    absolutePositioned,
    order: typeof item?.order === "number" && Number.isFinite(item.order) ? item.order : 0,
    ...(minWidth !== undefined ? { minWidth } : {}),
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
}

export function createAutoLayoutPlan(input: W2fAutoLayoutPlannerInput): W2fAutoLayoutPlan | null {
  const { container } = input;
  if (container.layout.mode !== "flex" || !container.layout.flexContainer) return null;

  const flex = container.layout.flexContainer;
  const horizontal = flex.direction === "row" || flex.direction === "row-reverse";
  const reverseChildren = flex.direction === "row-reverse" || flex.direction === "column-reverse";
  const reasons: string[] = [];
  if (flex.wrap === "wrap-reverse") {
    reasons.push("flex-wrap:wrap-reverse has no exact Figma equivalent");
  }
  if (!horizontal && flex.wrap !== "nowrap") {
    reasons.push("vertical flex wrapping has no exact Figma Auto Layout equivalent");
  }

  const counter = counterAlign(flex.alignItems, horizontal, reasons);
  const padding = container.layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const rowGap = finiteNonNegative(flex.rowGap ?? container.layout.effectiveGap?.row);
  const columnGap = finiteNonNegative(flex.columnGap ?? container.layout.effectiveGap?.column);
  const itemSpacing = horizontal ? columnGap : rowGap;
  const counterAxisSpacing = horizontal ? rowGap : columnGap;

  const containerPlan: W2fAutoLayoutContainerPlan = {
    renderNodeId: container.id,
    mode: horizontal ? "HORIZONTAL" : "VERTICAL",
    wrap: horizontal && flex.wrap !== "nowrap" ? "WRAP" : "NO_WRAP",
    reverseChildren,
    primaryAlign: primaryAlign(flex.justifyContent, reasons),
    counterAlign: counter.value,
    counterAlignStretch: counter.stretch,
    itemSpacing,
    ...(horizontal && flex.wrap !== "nowrap" ? { counterAxisSpacing } : {}),
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

function gridTrack(
  track: WtfGridTrack,
  axis: "row" | "column",
  index: number,
  reasons: string[],
): W2fGridTrackPlan {
  const authored = track.authored.trim();
  const normalized = authored.toLowerCase();
  const fr = normalized.match(/^([0-9]*\.?[0-9]+)?fr$/);
  if (fr) {
    const parsed = fr[1] ? Number.parseFloat(fr[1]) : 1;
    return {
      type: "FLEX",
      value: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
      authored,
    };
  }

  const minmaxFr = normalized.match(/^minmax\(\s*0(?:px)?\s*,\s*([0-9]*\.?[0-9]+)?fr\s*\)$/);
  if (minmaxFr) {
    const parsed = minmaxFr[1] ? Number.parseFloat(minmaxFr[1]) : 1;
    return {
      type: "FLEX",
      value: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
      authored,
    };
  }

  const exactPixels = normalized.match(/^([0-9]*\.?[0-9]+)px$/);
  if (exactPixels) {
    return {
      type: "FIXED",
      value: Math.max(0, Number.parseFloat(exactPixels[1] ?? "0")),
      authored,
    };
  }

  reasons.push(
    `${axis} track ${index + 1} (${authored || "<empty>"}) has no exact Figma Grid track equivalent`,
  );
  return {
    type: "FIXED",
    value: finiteNonNegative(track.resolvedPx),
    authored,
  };
}

function positiveGridLine(
  value: number | string | undefined,
  label: string,
  reasons: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value - 1;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^[1-9]\d*$/.test(normalized)) return Number.parseInt(normalized, 10) - 1;
  }
  reasons.push(
    `${label}:${String(value)} cannot be represented as a positive numeric Figma grid line`,
  );
  return undefined;
}

function gridSpan(
  start: number | string | undefined,
  end: number | string | undefined,
  label: string,
  reasons: string[],
): number {
  if (end === undefined) return 1;
  if (typeof end === "string") {
    const span = end.trim().match(/^span\s+([1-9]\d*)$/i);
    if (span) return Number.parseInt(span[1] ?? "1", 10);
  }
  const startIndex = positiveGridLine(start, `${label}Start`, reasons);
  const endIndex = positiveGridLine(end, `${label}End`, reasons);
  if (startIndex !== undefined && endIndex !== undefined && endIndex > startIndex) {
    return endIndex - startIndex;
  }
  reasons.push(`${label} end:${String(end)} has no exact Figma span equivalent`);
  return 1;
}

function gridChild(
  item: WtfGridItemModel | undefined,
  childId: string,
  reasons: string[],
): W2fGridChildPlan {
  if (!item) {
    return { renderNodeId: childId, rowSpan: 1, columnSpan: 1 };
  }
  const rowIndex = positiveGridLine(item.rowStart, `${childId}.rowStart`, reasons);
  const columnIndex = positiveGridLine(item.columnStart, `${childId}.columnStart`, reasons);
  const rowSpan = gridSpan(item.rowStart, item.rowEnd, `${childId}.row`, reasons);
  const columnSpan = gridSpan(item.columnStart, item.columnEnd, `${childId}.column`, reasons);
  const hasExplicitRow = item.rowStart !== undefined || item.rowEnd !== undefined;
  const hasExplicitColumn = item.columnStart !== undefined || item.columnEnd !== undefined;
  if (
    (hasExplicitRow || hasExplicitColumn) &&
    (rowIndex === undefined || columnIndex === undefined)
  ) {
    reasons.push(
      `${childId} has partial explicit grid placement that Figma cannot position exactly`,
    );
  }
  return {
    renderNodeId: childId,
    ...(rowIndex !== undefined ? { rowIndex } : {}),
    ...(columnIndex !== undefined ? { columnIndex } : {}),
    rowSpan,
    columnSpan,
  };
}

export function createGridLayoutPlan(input: W2fGridLayoutPlannerInput): W2fGridLayoutPlan | null {
  const { container } = input;
  if (container.layout.mode !== "grid" || !container.layout.gridContainer) return null;

  const grid = container.layout.gridContainer;
  const reasons: string[] = [];
  if (grid.columns.length === 0 || grid.rows.length === 0) {
    reasons.push(
      "implicit-only CSS Grid tracks do not have enough evidence for exact native Figma Grid",
    );
  }

  const autoFlow = (grid.autoFlow ?? "row").trim().toLowerCase();
  const itemsPositioning = autoFlow === "row" ? "ROW_AUTO_FLOW" : "MANUAL";
  if (!["row", ""].includes(autoFlow)) {
    reasons.push(`grid-auto-flow:${grid.autoFlow} has no exact Figma Grid equivalent`);
  }

  const columns = grid.columns.map((track, index) => gridTrack(track, "column", index, reasons));
  const rows = grid.rows.map((track, index) => gridTrack(track, "row", index, reasons));
  const children = input.children.map((child) =>
    gridChild(child.layout.gridItem, child.id, reasons),
  );
  const hasExplicitPlacement = children.some(
    (child) =>
      child.rowIndex !== undefined ||
      child.columnIndex !== undefined ||
      child.rowSpan > 1 ||
      child.columnSpan > 1,
  );

  return {
    container: {
      renderNodeId: container.id,
      rows,
      columns,
      rowGap: finiteNonNegative(grid.rowGap ?? container.layout.effectiveGap?.row),
      columnGap: finiteNonNegative(grid.columnGap ?? container.layout.effectiveGap?.column),
      itemsPositioning: hasExplicitPlacement ? "MANUAL" : itemsPositioning,
      nativeCompatible: reasons.length === 0,
      reasons,
    },
    children,
  };
}
