import {
  combineVisualPixelMetrics,
  compareRgbaPixels,
  evaluateVisualQa,
  W2F_NODE29_QA_VERSION,
  W2F_NODE29_THRESHOLDS,
  type W2fVisualQaReport,
} from "@w2f/figma-renderer";
import type { WtfParsedPackage } from "@w2f/wtf-parser";
import { node29PixelQaReferenceById } from "./qa-payload.js";

export interface W2fQaVisualExportTile {
  tileId: string;
  pngBytes: Uint8Array;
}

export interface W2fQaVisualExportPayload {
  referenceId: string;
  tiles: W2fQaVisualExportTile[];
}

export interface W2fQaVisualUiResult {
  report: W2fVisualQaReport;
  detail: string;
}

interface DecodedRgba {
  width: number;
  height: number;
  data: Uint8Array;
}

async function decodePng(bytes: Uint8Array): Promise<DecodedRgba> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("NODE-29 could not create a 2D canvas context");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Uint8Array.from(imageData.data),
    };
  } finally {
    bitmap.close();
  }
}

function terminalResult(
  status: "FAIL" | "UNAVAILABLE",
  detail: string,
): W2fQaVisualUiResult {
  return {
    report: {
      version: W2F_NODE29_QA_VERSION,
      status,
      target: "realistic",
      threshold: W2F_NODE29_THRESHOLDS.realisticVisualSimilarity,
      metrics: {
        pixelCount: 0,
        meanAbsoluteChannelError: 255,
        rootMeanSquaredChannelError: 255,
        maxChannelError: 255,
        changedPixelRatio: 1,
        normalizedSimilarity: 0,
      },
    },
    detail,
  };
}

export function unavailableNode29VisualQa(detail: string): W2fQaVisualUiResult {
  return terminalResult("UNAVAILABLE", detail);
}

function hardFailure(detail: string): W2fQaVisualUiResult {
  return terminalResult("FAIL", detail);
}

export async function runNode29VisualQa(
  parsed: WtfParsedPackage,
  payload: W2fQaVisualExportPayload,
): Promise<W2fQaVisualUiResult> {
  const reference = node29PixelQaReferenceById(parsed, payload.referenceId);
  if (!reference) return hardFailure(`full-page reference ${payload.referenceId} is unavailable`);
  const actualById = new Map(payload.tiles.map((tile) => [tile.tileId, tile]));
  if (actualById.size !== reference.tiles.length) {
    return hardFailure(
      `tile count mismatch: browser ${reference.tiles.length}, Figma ${actualById.size}`,
    );
  }

  const tileMetrics = [];
  for (const tile of reference.tiles) {
    const expectedBytes = parsed.binaryPayloads.get(tile.path);
    const actual = actualById.get(tile.id);
    if (!expectedBytes || !actual) return hardFailure(`missing visual QA tile ${tile.id}`);
    const [expectedDecoded, actualDecoded] = await Promise.all([
      decodePng(expectedBytes),
      decodePng(actual.pngBytes),
    ]);
    if (
      expectedDecoded.width !== actualDecoded.width ||
      expectedDecoded.height !== actualDecoded.height
    ) {
      return hardFailure(
        `tile ${tile.id} dimensions differ: browser ${expectedDecoded.width}x${expectedDecoded.height}, Figma ${actualDecoded.width}x${actualDecoded.height}`,
      );
    }
    tileMetrics.push(
      compareRgbaPixels(expectedDecoded.data, actualDecoded.data, { changedChannelThreshold: 1 }),
    );
  }

  const metrics = combineVisualPixelMetrics(tileMetrics);
  const report = evaluateVisualQa(metrics, "realistic");
  return {
    report,
    detail: `visual ${(report.metrics.normalizedSimilarity * 100).toFixed(2)}% · changed pixels ${(report.metrics.changedPixelRatio * 100).toFixed(2)}% · MAE ${report.metrics.meanAbsoluteChannelError.toFixed(3)}`,
  };
}
