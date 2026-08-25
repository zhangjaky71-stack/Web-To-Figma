import {
  W2F_NODE29_QA_VERSION,
  W2F_NODE29_THRESHOLDS,
  type W2fVisualPixelMetrics,
  type W2fVisualQaReport,
} from "./types.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function compareRgbaPixels(
  expected: Uint8Array,
  actual: Uint8Array,
  options: { changedChannelThreshold?: number } = {},
): W2fVisualPixelMetrics {
  if (expected.byteLength !== actual.byteLength) {
    throw new Error(
      `NODE-29 pixel buffers differ in length: ${expected.byteLength} vs ${actual.byteLength}`,
    );
  }
  if (expected.byteLength === 0 || expected.byteLength % 4 !== 0) {
    throw new Error("NODE-29 pixel buffers must be non-empty RGBA byte arrays");
  }

  const threshold = Math.max(0, Math.min(255, options.changedChannelThreshold ?? 0));
  const pixelCount = expected.byteLength / 4;
  let absoluteError = 0;
  let squaredError = 0;
  let maxChannelError = 0;
  let changedPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    let pixelChanged = false;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const error = Math.abs((expected[offset + channel] ?? 0) - (actual[offset + channel] ?? 0));
      absoluteError += error;
      squaredError += error * error;
      maxChannelError = Math.max(maxChannelError, error);
      if (error > threshold) pixelChanged = true;
    }
    if (pixelChanged) changedPixels += 1;
  }

  const channelCount = expected.byteLength;
  const meanAbsoluteChannelError = absoluteError / channelCount;
  const rootMeanSquaredChannelError = Math.sqrt(squaredError / channelCount);
  const normalizedSimilarity = clamp01(1 - meanAbsoluteChannelError / 255);

  return {
    pixelCount,
    meanAbsoluteChannelError,
    rootMeanSquaredChannelError,
    maxChannelError,
    changedPixelRatio: changedPixels / pixelCount,
    normalizedSimilarity,
  };
}

export function combineVisualPixelMetrics(
  metrics: readonly W2fVisualPixelMetrics[],
): W2fVisualPixelMetrics {
  if (metrics.length === 0) {
    throw new Error("NODE-29 requires at least one visual metric sample");
  }
  const pixelCount = metrics.reduce((total, item) => total + item.pixelCount, 0);
  if (pixelCount <= 0) throw new Error("NODE-29 visual metric samples contain no pixels");
  const channelCount = pixelCount * 4;
  const absoluteError = metrics.reduce(
    (total, item) => total + item.meanAbsoluteChannelError * item.pixelCount * 4,
    0,
  );
  const squaredError = metrics.reduce(
    (total, item) => total + item.rootMeanSquaredChannelError ** 2 * item.pixelCount * 4,
    0,
  );
  const changedPixels = metrics.reduce(
    (total, item) => total + item.changedPixelRatio * item.pixelCount,
    0,
  );
  const meanAbsoluteChannelError = absoluteError / channelCount;
  return {
    pixelCount,
    meanAbsoluteChannelError,
    rootMeanSquaredChannelError: Math.sqrt(squaredError / channelCount),
    maxChannelError: Math.max(...metrics.map((item) => item.maxChannelError)),
    changedPixelRatio: clamp01(changedPixels / pixelCount),
    normalizedSimilarity: clamp01(1 - meanAbsoluteChannelError / 255),
  };
}

export function evaluateVisualQa(
  metrics: W2fVisualPixelMetrics,
  target: "deterministic" | "realistic" = "deterministic",
): W2fVisualQaReport {
  const threshold =
    target === "deterministic"
      ? W2F_NODE29_THRESHOLDS.deterministicVisualSimilarity
      : W2F_NODE29_THRESHOLDS.realisticVisualSimilarity;
  const warningFloor = Math.max(0, threshold - 0.02);
  const status =
    metrics.normalizedSimilarity >= threshold
      ? "PASS"
      : metrics.normalizedSimilarity >= warningFloor
        ? "WARNING"
        : "FAIL";
  return {
    version: W2F_NODE29_QA_VERSION,
    status,
    target,
    metrics,
    threshold,
  };
}
