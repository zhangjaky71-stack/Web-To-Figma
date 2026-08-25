import type { Rect } from "@w2f/w2f-schema";

export const NODE_29_QA_VERSION = "1.0.0" as const;

export const NODE_29_ACCEPTANCE_THRESHOLDS = {
  deterministicVisualSimilarity: 0.99,
  realisticVisualSimilarity: 0.95,
  structureScore: 0.95,
  editableAreaRatio: 0.9,
  nativeSupportedRasterAreaRatio: 0.15,
  wholePageRasterCoverage: 0.95,
} as const;

export type QaVisualTarget = "deterministic" | "realistic" | "informational";
export type QaCorpusClass = "native-supported" | "expected-fallback" | "mixed";
export type QaSurfaceClassification = "native-supported" | "expected-fallback" | "blocked";
export type QaRepresentation =
  | "native"
  | "emulated"
  | "wrapper"
  | "absolute"
  | "raster"
  | "unsupported";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface VisualComparisonOptions {
  changedPixelChannelDelta?: number;
}

export interface VisualComparisonSample {
  id: string;
  scope: "page" | "section" | "critical-node" | "tile";
  critical?: boolean;
  pixelCount: number;
  pixelSimilarity: number;
  ssim: number;
  normalizedVisualSimilarity: number;
  changedPixelRatio: number;
  meanAbsoluteChannelError: number;
  maxChannelDelta: number;
}

export interface VisualQaReport {
  version: typeof NODE_29_QA_VERSION;
  target: QaVisualTarget;
  threshold?: number;
  pageScore: number;
  worstSampleScore: number;
  criticalMinimumScore?: number;
  sampleCount: number;
  failedSampleIds: string[];
  pass: boolean;
  samples: VisualComparisonSample[];
}

export interface QaStructureRecord {
  id: string;
  mapped: boolean;
  sourceMappingPresent: boolean;
  parentCorrect: boolean;
  meaningfulName: boolean;
}

export interface StructureQaReport {
  version: typeof NODE_29_QA_VERSION;
  evaluatedNodeCount: number;
  mappedNodeCount: number;
  mappingCompleteness: number;
  sourceMappingCompleteness: number;
  parentCorrectness: number;
  namingQuality: number;
  structureScore: number;
  threshold: number;
  pass: boolean;
  unmappedNodeIds: string[];
  invalidParentNodeIds: string[];
}

export interface QaSurfaceRecord {
  id: string;
  bounds: Rect;
  classification: QaSurfaceClassification;
  representation: QaRepresentation;
  editable: boolean;
  semanticKind?: string;
}

export interface EditabilityQaInput {
  pageBounds: Rect;
  surfaces: readonly QaSurfaceRecord[];
  corpusClass: QaCorpusClass;
}

export type QaAntiCheatingCode =
  | "WHOLE_PAGE_RASTER"
  | "SUPPORTED_SURFACE_RASTERIZED"
  | "EDITABLE_AREA_BELOW_TARGET"
  | "RASTER_AREA_ABOVE_TARGET";

export interface QaAntiCheatingViolation {
  code: QaAntiCheatingCode;
  message: string;
  surfaceIds?: string[];
}

export interface EditabilityQaReport {
  version: typeof NODE_29_QA_VERSION;
  corpusClass: QaCorpusClass;
  totalVisibleArea: number;
  supportedVisibleArea: number;
  editableSupportedArea: number;
  expectedFallbackArea: number;
  rasterArea: number;
  editableAreaRatio: number;
  rasterAreaRatio: number;
  editableThreshold: number;
  rasterThreshold: number;
  rasterThresholdApplicable: boolean;
  violations: QaAntiCheatingViolation[];
  pass: boolean;
}

export interface Node29QaReport {
  version: typeof NODE_29_QA_VERSION;
  visual?: VisualQaReport;
  structure: StructureQaReport;
  editability: EditabilityQaReport;
  pass: boolean;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertImage(image: RgbaImage, label: string): void {
  if (!Number.isSafeInteger(image.width) || image.width <= 0) {
    throw new Error(`${label} width must be a positive integer`);
  }
  if (!Number.isSafeInteger(image.height) || image.height <= 0) {
    throw new Error(`${label} height must be a positive integer`);
  }
  const expectedLength = image.width * image.height * 4;
  if (image.data.length !== expectedLength) {
    throw new Error(`${label} RGBA length ${image.data.length} does not match ${expectedLength}`);
  }
}

function luminance(data: Uint8Array | Uint8ClampedArray, offset: number): number {
  const alpha = data[offset + 3]! / 255;
  const r = data[offset]! * alpha;
  const g = data[offset + 1]! * alpha;
  const b = data[offset + 2]! * alpha;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function globalSsim(reference: RgbaImage, candidate: RgbaImage): number {
  const count = reference.width * reference.height;
  let meanReference = 0;
  let meanCandidate = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4;
    meanReference += luminance(reference.data, offset);
    meanCandidate += luminance(candidate.data, offset);
  }
  meanReference /= count;
  meanCandidate /= count;

  let varianceReference = 0;
  let varianceCandidate = 0;
  let covariance = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4;
    const referenceDelta = luminance(reference.data, offset) - meanReference;
    const candidateDelta = luminance(candidate.data, offset) - meanCandidate;
    varianceReference += referenceDelta * referenceDelta;
    varianceCandidate += candidateDelta * candidateDelta;
    covariance += referenceDelta * candidateDelta;
  }
  const divisor = Math.max(1, count - 1);
  varianceReference /= divisor;
  varianceCandidate /= divisor;
  covariance /= divisor;

  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const numerator = (2 * meanReference * meanCandidate + c1) * (2 * covariance + c2);
  const denominator =
    (meanReference ** 2 + meanCandidate ** 2 + c1) *
    (varianceReference + varianceCandidate + c2);
  if (denominator === 0) return 1;
  return clampUnit(numerator / denominator);
}

export function compareRgbaImages(
  id: string,
  scope: VisualComparisonSample["scope"],
  reference: RgbaImage,
  candidate: RgbaImage,
  options: VisualComparisonOptions = {},
): VisualComparisonSample {
  assertImage(reference, "Reference image");
  assertImage(candidate, "Candidate image");
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `Image dimensions differ: reference ${reference.width}x${reference.height}, candidate ${candidate.width}x${candidate.height}`,
    );
  }

  const changedPixelChannelDelta = Math.max(0, options.changedPixelChannelDelta ?? 8);
  const pixelCount = reference.width * reference.height;
  let absoluteError = 0;
  let maxChannelDelta = 0;
  let changedPixelCount = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(reference.data[offset + channel]! - candidate.data[offset + channel]!);
      absoluteError += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > changedPixelChannelDelta) pixelChanged = true;
    }
    if (pixelChanged) changedPixelCount += 1;
  }

  const meanAbsoluteChannelError = absoluteError / (pixelCount * 4);
  const pixelSimilarity = clampUnit(1 - meanAbsoluteChannelError / 255);
  const ssim = globalSsim(reference, candidate);
  return {
    id,
    scope,
    pixelCount,
    pixelSimilarity,
    ssim,
    normalizedVisualSimilarity: Math.min(pixelSimilarity, ssim),
    changedPixelRatio: changedPixelCount / pixelCount,
    meanAbsoluteChannelError,
    maxChannelDelta,
  };
}

function visualThreshold(target: QaVisualTarget): number | undefined {
  if (target === "deterministic") {
    return NODE_29_ACCEPTANCE_THRESHOLDS.deterministicVisualSimilarity;
  }
  if (target === "realistic") {
    return NODE_29_ACCEPTANCE_THRESHOLDS.realisticVisualSimilarity;
  }
  return undefined;
}

export function evaluateVisualQa(
  samples: readonly VisualComparisonSample[],
  target: QaVisualTarget,
): VisualQaReport {
  if (samples.length === 0) throw new Error("Visual QA requires at least one comparison sample");
  const totalPixels = samples.reduce((total, sample) => total + sample.pixelCount, 0);
  const pageScore =
    totalPixels > 0
      ? samples.reduce(
          (total, sample) => total + sample.normalizedVisualSimilarity * sample.pixelCount,
          0,
        ) / totalPixels
      : 0;
  const worstSampleScore = Math.min(...samples.map((sample) => sample.normalizedVisualSimilarity));
  const criticalSamples = samples.filter((sample) => sample.critical);
  const criticalMinimumScore =
    criticalSamples.length > 0
      ? Math.min(...criticalSamples.map((sample) => sample.normalizedVisualSimilarity))
      : undefined;
  const threshold = visualThreshold(target);
  const failedSampleIds =
    threshold === undefined
      ? []
      : samples
          .filter(
            (sample) =>
              sample.scope === "page" ||
              sample.scope === "section" ||
              sample.scope === "critical-node" ||
              sample.critical,
          )
          .filter((sample) => sample.normalizedVisualSimilarity < threshold)
          .map((sample) => sample.id);
  const pass =
    threshold === undefined ||
    (pageScore >= threshold &&
      (criticalMinimumScore === undefined || criticalMinimumScore >= threshold) &&
      failedSampleIds.length === 0);

  return {
    version: NODE_29_QA_VERSION,
    target,
    ...(threshold === undefined ? {} : { threshold }),
    pageScore,
    worstSampleScore,
    ...(criticalMinimumScore === undefined ? {} : { criticalMinimumScore }),
    sampleCount: samples.length,
    failedSampleIds,
    pass,
    samples: [...samples],
  };
}

function ratio(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

export function evaluateStructureQa(records: readonly QaStructureRecord[]): StructureQaReport {
  const evaluatedNodeCount = records.length;
  const mappedNodeCount = records.filter((record) => record.mapped).length;
  const mappingCompleteness = ratio(mappedNodeCount, evaluatedNodeCount);
  const sourceMappingCompleteness = ratio(
    records.filter((record) => record.sourceMappingPresent).length,
    evaluatedNodeCount,
  );
  const mappedRecords = records.filter((record) => record.mapped);
  const parentCorrectness = ratio(
    mappedRecords.filter((record) => record.parentCorrect).length,
    mappedRecords.length,
  );
  const namingQuality = ratio(
    records.filter((record) => record.meaningfulName).length,
    evaluatedNodeCount,
  );
  const structureScore = clampUnit(
    0.4 * mappingCompleteness +
      0.25 * sourceMappingCompleteness +
      0.25 * parentCorrectness +
      0.1 * namingQuality,
  );
  const threshold = NODE_29_ACCEPTANCE_THRESHOLDS.structureScore;
  return {
    version: NODE_29_QA_VERSION,
    evaluatedNodeCount,
    mappedNodeCount,
    mappingCompleteness,
    sourceMappingCompleteness,
    parentCorrectness,
    namingQuality,
    structureScore,
    threshold,
    pass: structureScore >= threshold,
    unmappedNodeIds: records.filter((record) => !record.mapped).map((record) => record.id),
    invalidParentNodeIds: records
      .filter((record) => record.mapped && !record.parentCorrect)
      .map((record) => record.id),
  };
}

function normalizeRect(rect: Rect): Rect | undefined {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return undefined;
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return rect;
}

function intersection(left: Rect, right: Rect): Rect | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  if (rightEdge <= x || bottomEdge <= y) return undefined;
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

export function unionRectArea(rectangles: readonly Rect[], clip?: Rect): number {
  const normalizedClip = clip ? normalizeRect(clip) : undefined;
  const rects = rectangles
    .map(normalizeRect)
    .filter((rect): rect is Rect => rect !== undefined)
    .map((rect) => (normalizedClip ? intersection(rect, normalizedClip) : rect))
    .filter((rect): rect is Rect => rect !== undefined);
  if (rects.length === 0) return 0;

  const xEdges = [...new Set(rects.flatMap((rect) => [rect.x, rect.x + rect.width]))].sort(
    (left, right) => left - right,
  );
  let area = 0;
  for (let index = 0; index < xEdges.length - 1; index += 1) {
    const x0 = xEdges[index]!;
    const x1 = xEdges[index + 1]!;
    if (x1 <= x0) continue;
    const intervals = rects
      .filter((rect) => rect.x < x1 && rect.x + rect.width > x0)
      .map((rect) => [rect.y, rect.y + rect.height] as const)
      .sort((left, right) => left[0] - right[0]);
    if (intervals.length === 0) continue;
    let coveredY = 0;
    let start = intervals[0]![0];
    let end = intervals[0]![1];
    for (const [nextStart, nextEnd] of intervals.slice(1)) {
      if (nextStart <= end) {
        end = Math.max(end, nextEnd);
      } else {
        coveredY += end - start;
        start = nextStart;
        end = nextEnd;
      }
    }
    coveredY += end - start;
    area += (x1 - x0) * coveredY;
  }
  return area;
}

export function evaluateEditabilityQa(input: EditabilityQaInput): EditabilityQaReport {
  const pageBounds = normalizeRect(input.pageBounds);
  if (!pageBounds) throw new Error("Editability QA page bounds must be positive finite geometry");

  const visible = input.surfaces.filter((surface) => surface.classification !== "blocked");
  const supported = input.surfaces.filter(
    (surface) => surface.classification === "native-supported",
  );
  const editableSupported = supported.filter(
    (surface) => surface.editable && surface.representation !== "raster",
  );
  const expectedFallback = input.surfaces.filter(
    (surface) => surface.classification === "expected-fallback",
  );
  const raster = visible.filter((surface) => surface.representation === "raster");
  const totalVisibleArea = unionRectArea(
    visible.map((surface) => surface.bounds),
    pageBounds,
  );
  const supportedVisibleArea = unionRectArea(
    supported.map((surface) => surface.bounds),
    pageBounds,
  );
  const editableSupportedArea = unionRectArea(
    editableSupported.map((surface) => surface.bounds),
    pageBounds,
  );
  const expectedFallbackArea = unionRectArea(
    expectedFallback.map((surface) => surface.bounds),
    pageBounds,
  );
  const rasterArea = unionRectArea(
    raster.map((surface) => surface.bounds),
    pageBounds,
  );
  const editableAreaRatio =
    supportedVisibleArea === 0 ? 1 : clampUnit(editableSupportedArea / supportedVisibleArea);
  const rasterAreaRatio = totalVisibleArea === 0 ? 0 : clampUnit(rasterArea / totalVisibleArea);
  const editableThreshold = NODE_29_ACCEPTANCE_THRESHOLDS.editableAreaRatio;
  const rasterThreshold = NODE_29_ACCEPTANCE_THRESHOLDS.nativeSupportedRasterAreaRatio;
  const rasterThresholdApplicable = input.corpusClass === "native-supported";
  const violations: QaAntiCheatingViolation[] = [];

  const pageArea = pageBounds.width * pageBounds.height;
  const wholePageRasterIds = raster
    .filter((surface) => {
      const clipped = intersection(surface.bounds, pageBounds);
      if (!clipped) return false;
      return (
        (clipped.width * clipped.height) / pageArea >=
        NODE_29_ACCEPTANCE_THRESHOLDS.wholePageRasterCoverage
      );
    })
    .map((surface) => surface.id);
  if (wholePageRasterIds.length > 0 && input.corpusClass !== "expected-fallback") {
    violations.push({
      code: "WHOLE_PAGE_RASTER",
      message: "A raster surface covers at least 95% of the page and cannot satisfy editability acceptance.",
      surfaceIds: wholePageRasterIds,
    });
  }

  const rasterizedSupportedIds = supported
    .filter((surface) => surface.representation === "raster")
    .map((surface) => surface.id);
  if (rasterizedSupportedIds.length > 0) {
    violations.push({
      code: "SUPPORTED_SURFACE_RASTERIZED",
      message: "Native-supported surfaces were classified as raster fallback.",
      surfaceIds: rasterizedSupportedIds,
    });
  }
  if (editableAreaRatio < editableThreshold) {
    violations.push({
      code: "EDITABLE_AREA_BELOW_TARGET",
      message: `Editable supported area ratio ${editableAreaRatio.toFixed(4)} is below ${editableThreshold.toFixed(2)}.`,
    });
  }
  if (rasterThresholdApplicable && rasterAreaRatio > rasterThreshold) {
    violations.push({
      code: "RASTER_AREA_ABOVE_TARGET",
      message: `Raster area ratio ${rasterAreaRatio.toFixed(4)} exceeds ${rasterThreshold.toFixed(2)} for the native-supported corpus.`,
    });
  }

  return {
    version: NODE_29_QA_VERSION,
    corpusClass: input.corpusClass,
    totalVisibleArea,
    supportedVisibleArea,
    editableSupportedArea,
    expectedFallbackArea,
    rasterArea,
    editableAreaRatio,
    rasterAreaRatio,
    editableThreshold,
    rasterThreshold,
    rasterThresholdApplicable,
    violations,
    pass: violations.length === 0,
  };
}

export function buildNode29QaReport(input: {
  visual?: VisualQaReport;
  structure: StructureQaReport;
  editability: EditabilityQaReport;
}): Node29QaReport {
  return {
    version: NODE_29_QA_VERSION,
    ...(input.visual ? { visual: input.visual } : {}),
    structure: input.structure,
    editability: input.editability,
    pass: (input.visual?.pass ?? true) && input.structure.pass && input.editability.pass,
  };
}
