import type { W2fFontResolutionReason } from "./font-resolution.js";

export const W2F_FONT_GEOMETRY_CORRECTION_VERSION = "1.0.0" as const;

export interface W2fFontSubstitutionDiagnostic {
  renderNodeId: string;
  start: number;
  end: number;
  requestedFamily: string | null;
  requestedStyle: string;
  chosenFamily: string;
  chosenStyle: string;
  reason: Exclude<W2fFontResolutionReason, "exact">;
}

export type W2fFontGeometryCorrectionStatus =
  | "within-tolerance"
  | "corrected"
  | "attempted-unvalidated"
  | "skipped-invalid-geometry";

export interface W2fFontGeometryCorrectionDiagnostic {
  version: typeof W2F_FONT_GEOMETRY_CORRECTION_VERSION;
  status: W2fFontGeometryCorrectionStatus;
  targetWidth: number;
  targetHeight: number;
  measuredHeightBefore: number;
  measuredHeightAfter: number;
  errorRatioBefore: number;
  errorRatioAfter: number;
  attempted: boolean;
  scale: number;
  adjustedRangeCount: number;
  toleranceRatio: number;
}

interface PluginDataWriter {
  setPluginData(key: string, value: string): void;
}

interface FontGeometryTextNode extends PluginDataWriter {
  width: number;
  height: number;
  textAutoResize: TextNode["textAutoResize"];
  resize(width: number, height: number): void;
  getRangeFontSize(start: number, end: number): number | typeof figma.mixed;
  setRangeFontSize(start: number, end: number, value: number): void;
}

const MAX_PERSISTED_FONT_SUBSTITUTIONS = 64;
const FONT_GEOMETRY_TOLERANCE_RATIO = 0.02;
const MIN_FONT_GEOMETRY_SCALE = 0.85;
const MAX_FONT_GEOMETRY_SCALE = 1.15;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function fontGeometryErrorRatio(targetHeight: number, measuredHeight: number): number {
  if (!finitePositive(targetHeight) || !Number.isFinite(measuredHeight)) return Number.POSITIVE_INFINITY;
  return Math.abs(measuredHeight - targetHeight) / targetHeight;
}

export function fontGeometryCorrectionScale(
  targetHeight: number,
  measuredHeight: number,
): number {
  if (!finitePositive(targetHeight) || !finitePositive(measuredHeight)) return 1;
  return clamp(
    targetHeight / measuredHeight,
    MIN_FONT_GEOMETRY_SCALE,
    MAX_FONT_GEOMETRY_SCALE,
  );
}

function isFontGeometryTextNode(root: PluginDataWriter): root is FontGeometryTextNode {
  const candidate = root as Partial<FontGeometryTextNode>;
  return (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.resize === "function" &&
    typeof candidate.getRangeFontSize === "function" &&
    typeof candidate.setRangeFontSize === "function" &&
    "textAutoResize" in candidate
  );
}

function correctedRanges(
  node: FontGeometryTextNode,
  diagnostics: readonly W2fFontSubstitutionDiagnostic[],
  scale: number,
): number {
  const seen = new Set<string>();
  let adjusted = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.end <= diagnostic.start) continue;
    const key = `${diagnostic.start}:${diagnostic.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fontSize = node.getRangeFontSize(diagnostic.start, diagnostic.end);
    if (typeof fontSize !== "number" || !finitePositive(fontSize)) continue;
    node.setRangeFontSize(diagnostic.start, diagnostic.end, Math.max(0.01, fontSize * scale));
    adjusted += 1;
  }
  return adjusted;
}

export function applyFontGeometryCorrection(
  node: FontGeometryTextNode,
  diagnostics: readonly W2fFontSubstitutionDiagnostic[],
): W2fFontGeometryCorrectionDiagnostic {
  const targetWidth = node.width;
  const targetHeight = node.height;
  if (!finitePositive(targetWidth) || !finitePositive(targetHeight)) {
    return {
      version: W2F_FONT_GEOMETRY_CORRECTION_VERSION,
      status: "skipped-invalid-geometry",
      targetWidth,
      targetHeight,
      measuredHeightBefore: targetHeight,
      measuredHeightAfter: targetHeight,
      errorRatioBefore: Number.POSITIVE_INFINITY,
      errorRatioAfter: Number.POSITIVE_INFINITY,
      attempted: false,
      scale: 1,
      adjustedRangeCount: 0,
      toleranceRatio: FONT_GEOMETRY_TOLERANCE_RATIO,
    };
  }

  let measuredHeightBefore = targetHeight;
  let measuredHeightAfter = targetHeight;
  let scale = 1;
  let adjustedRangeCount = 0;
  let attempted = false;

  try {
    node.textAutoResize = "NONE";
    node.resize(targetWidth, targetHeight);
    node.textAutoResize = "HEIGHT";
    measuredHeightBefore = node.height;
    const errorRatioBefore = fontGeometryErrorRatio(targetHeight, measuredHeightBefore);
    if (errorRatioBefore <= FONT_GEOMETRY_TOLERANCE_RATIO) {
      return {
        version: W2F_FONT_GEOMETRY_CORRECTION_VERSION,
        status: "within-tolerance",
        targetWidth,
        targetHeight,
        measuredHeightBefore,
        measuredHeightAfter: measuredHeightBefore,
        errorRatioBefore,
        errorRatioAfter: errorRatioBefore,
        attempted: false,
        scale: 1,
        adjustedRangeCount: 0,
        toleranceRatio: FONT_GEOMETRY_TOLERANCE_RATIO,
      };
    }

    attempted = true;
    scale = fontGeometryCorrectionScale(targetHeight, measuredHeightBefore);
    adjustedRangeCount = correctedRanges(node, diagnostics, scale);
    measuredHeightAfter = node.height;
    const errorRatioAfter = fontGeometryErrorRatio(targetHeight, measuredHeightAfter);
    return {
      version: W2F_FONT_GEOMETRY_CORRECTION_VERSION,
      status:
        adjustedRangeCount > 0 && errorRatioAfter <= FONT_GEOMETRY_TOLERANCE_RATIO
          ? "corrected"
          : "attempted-unvalidated",
      targetWidth,
      targetHeight,
      measuredHeightBefore,
      measuredHeightAfter,
      errorRatioBefore,
      errorRatioAfter,
      attempted,
      scale,
      adjustedRangeCount,
      toleranceRatio: FONT_GEOMETRY_TOLERANCE_RATIO,
    };
  } finally {
    node.textAutoResize = "NONE";
    node.resize(Math.max(0.01, targetWidth), Math.max(0.01, targetHeight));
  }
}

export function persistFontSubstitutionDiagnostics(
  root: PluginDataWriter,
  diagnostics: readonly W2fFontSubstitutionDiagnostic[],
): void {
  const persisted = diagnostics.slice(0, MAX_PERSISTED_FONT_SUBSTITUTIONS);
  root.setPluginData("w2f.font.substitutionCount", String(diagnostics.length));
  root.setPluginData("w2f.font.substitutions", JSON.stringify(persisted));
  root.setPluginData(
    "w2f.font.substitutionsTruncated",
    String(diagnostics.length > MAX_PERSISTED_FONT_SUBSTITUTIONS),
  );

  if (diagnostics.length > 0 && isFontGeometryTextNode(root)) {
    const correction = applyFontGeometryCorrection(root, diagnostics);
    root.setPluginData("w2f.font.geometryCorrectionVersion", correction.version);
    root.setPluginData("w2f.font.geometryCorrectionStatus", correction.status);
    root.setPluginData("w2f.font.geometryCorrection", JSON.stringify(correction));
  }
}
