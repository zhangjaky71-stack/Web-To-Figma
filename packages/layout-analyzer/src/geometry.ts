import type { WtfBoxEdges, WtfBoxModel, WtfLayoutMode } from "@w2f/w2f-ir";
import type {
  LayoutNodeObservation,
  LayoutPropertyEvidence,
  LayoutStyleEvidence,
} from "./types.js";

function effectiveValue(evidence: LayoutPropertyEvidence | undefined): string | undefined {
  return evidence?.computed?.trim() || evidence?.authored?.trim() || undefined;
}

function numericPx(evidence: LayoutPropertyEvidence | undefined): number | undefined {
  const raw = effectiveValue(evidence);
  if (!raw) return undefined;
  if (/^[+-]?0(?:\.0+)?$/.test(raw)) return 0;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i.exec(raw);
  if (!match) return undefined;
  const parsed = Number(match[1] ?? "NaN");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function edge(style: LayoutStyleEvidence, field: keyof LayoutStyleEvidence): number {
  return numericPx(style[field]) ?? 0;
}

function boxEdges(
  style: LayoutStyleEvidence,
  fields: readonly [
    keyof LayoutStyleEvidence,
    keyof LayoutStyleEvidence,
    keyof LayoutStyleEvidence,
    keyof LayoutStyleEvidence,
  ],
): WtfBoxEdges {
  return {
    top: edge(style, fields[0]),
    right: edge(style, fields[1]),
    bottom: edge(style, fields[2]),
    left: edge(style, fields[3]),
  };
}

function addEdges(left: WtfBoxEdges, right: WtfBoxEdges): WtfBoxEdges {
  return {
    top: left.top + right.top,
    right: left.right + right.right,
    bottom: left.bottom + right.bottom,
    left: left.left + right.left,
  };
}

function inset(rect: { x: number; y: number; width: number; height: number }, edges: WtfBoxEdges) {
  return {
    x: rect.x + edges.left,
    y: rect.y + edges.top,
    width: Math.max(0, rect.width - edges.left - edges.right),
    height: Math.max(0, rect.height - edges.top - edges.bottom),
  };
}

export function deriveBoxModel(observation: LayoutNodeObservation): WtfBoxModel | undefined {
  if (!observation.bounds) return undefined;
  const border = boxEdges(observation.style, [
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ]);
  const padding = boxEdges(observation.style, [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ]);
  const margin = boxEdges(observation.style, [
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ]);
  return {
    borderBox: observation.bounds,
    paddingBox: inset(observation.bounds, border),
    contentBox: inset(observation.bounds, addEdges(border, padding)),
    margin,
  };
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) return undefined;
  if (sorted.length % 2 === 1) return current;
  const previous = sorted[middle - 1];
  return previous === undefined ? current : (previous + current) / 2;
}

function axisGap(
  children: readonly LayoutNodeObservation[],
  axis: "row" | "column",
): number | undefined {
  const bounds = children.flatMap((child) => (child.bounds ? [child.bounds] : []));
  if (bounds.length < 2) return undefined;
  const sorted = [...bounds].sort((left, right) =>
    axis === "row" ? left.y - right.y || left.x - right.x : left.x - right.x || left.y - right.y,
  );
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const gap =
      axis === "row"
        ? current.y - (previous.y + previous.height)
        : current.x - (previous.x + previous.width);
    if (Number.isFinite(gap)) gaps.push(gap);
  }
  return median(gaps);
}

function positionOf(observation: LayoutNodeObservation): string {
  return (effectiveValue(observation.style.position) ?? "static").toLowerCase();
}

export function deriveEffectiveGap(
  observation: LayoutNodeObservation,
  observationsById: ReadonlyMap<string, LayoutNodeObservation>,
  mode: WtfLayoutMode,
): { row: number; column: number } {
  const cssRow = numericPx(observation.style.rowGap) ?? 0;
  const cssColumn = numericPx(observation.style.columnGap) ?? 0;
  const children = observation.childSourceNodeIds.flatMap((sourceNodeId) => {
    const child = observationsById.get(sourceNodeId);
    return child ? [child] : [];
  });

  if (mode === "flow") {
    const inFlow = children.filter((child) => !["absolute", "fixed"].includes(positionOf(child)));
    return { row: axisGap(inFlow, "row") ?? cssRow, column: cssColumn };
  }

  if (mode === "flex") {
    const wrap = (effectiveValue(observation.style.flexWrap) ?? "nowrap").toLowerCase();
    if (wrap !== "nowrap") return { row: cssRow, column: cssColumn };
    const direction = (effectiveValue(observation.style.flexDirection) ?? "row").toLowerCase();
    if (direction.startsWith("column")) {
      return { row: axisGap(children, "row") ?? cssRow, column: cssColumn };
    }
    return { row: cssRow, column: axisGap(children, "column") ?? cssColumn };
  }

  return { row: cssRow, column: cssColumn };
}
