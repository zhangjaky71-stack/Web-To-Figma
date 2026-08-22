export const W2F_REGION_SELECTION_VERSION = "1.0.0" as const;

export type RegionSelectionMode = "free-rect" | "smart-element";
export type RegionExclusionKind = "redact" | "exclude";

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionSelectionRoot {
  kind: "document" | "element";
  bounds: RegionRect;
  clip: RegionRect;
  tagName?: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
}

export interface RegionExclusion {
  id: string;
  kind: RegionExclusionKind;
  bounds: RegionRect;
}

export interface RegionSelectionResult {
  version: typeof W2F_REGION_SELECTION_VERSION;
  coordinateSpace: "document-css-px";
  mode: RegionSelectionMode;
  bounds: RegionRect;
  viewportBounds: RegionRect;
  selectionRoot: RegionSelectionRoot;
  exclusions: RegionExclusion[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRegionRect(value: unknown): value is RegionRect {
  if (!isRecord(value)) return false;
  const { x, y, width, height } = value;
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    typeof width === "number" &&
    Number.isFinite(width) &&
    width >= 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height >= 0
  );
}

export function rectFromPoints(
  a: Pick<RegionRect, "x" | "y">,
  b: Pick<RegionRect, "x" | "y">,
): RegionRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x, b.x) - x,
    height: Math.max(a.y, b.y) - y,
  };
}

export function intersectRegionRects(a: RegionRect, b: RegionRect): RegionRect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function moveRegionRect(rect: RegionRect, dx: number, dy: number): RegionRect {
  if (![dx, dy].every((value) => Number.isFinite(value))) {
    throw new TypeError("region movement must use finite values");
  }
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

function isRegionSelectionRoot(value: unknown): value is RegionSelectionRoot {
  if (!isRecord(value) || (value.kind !== "document" && value.kind !== "element")) return false;
  if (!isRegionRect(value.bounds) || !isRegionRect(value.clip)) return false;
  for (const key of ["tagName", "id", "role", "ariaLabel"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }
  return true;
}

function isRegionExclusion(value: unknown): value is RegionExclusion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.kind === "redact" || value.kind === "exclude") &&
    isRegionRect(value.bounds)
  );
}

export function isRegionSelectionResult(value: unknown): value is RegionSelectionResult {
  if (!isRecord(value)) return false;
  return (
    value.version === W2F_REGION_SELECTION_VERSION &&
    value.coordinateSpace === "document-css-px" &&
    (value.mode === "free-rect" || value.mode === "smart-element") &&
    isRegionRect(value.bounds) &&
    value.bounds.width > 0 &&
    value.bounds.height > 0 &&
    isRegionRect(value.viewportBounds) &&
    isRegionSelectionRoot(value.selectionRoot) &&
    Array.isArray(value.exclusions) &&
    value.exclusions.every(isRegionExclusion)
  );
}
