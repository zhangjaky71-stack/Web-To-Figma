import { describe, expect, it } from "vitest";
import {
  fontGeometryCorrectionScale,
  fontGeometryErrorRatio,
  persistFontSubstitutionDiagnostics,
} from "../src/font-diagnostics.js";

function diagnostic(index: number) {
  return {
    renderNodeId: `text-${index}`,
    start: 0,
    end: 4,
    requestedFamily: "Missing Sans",
    requestedStyle: "Bold",
    chosenFamily: "Inter",
    chosenStyle: "Regular",
    reason: "default-font" as const,
  };
}

function geometryTextNode(options: {
  targetWidth?: number;
  targetHeight?: number;
  fontSize: number;
  naturalHeightForFontSize: (fontSize: number) => number;
}) {
  const pluginData = new Map<string, string>();
  let width = options.targetWidth ?? 100;
  let height = options.targetHeight ?? 20;
  let fontSize = options.fontSize;
  let textAutoResize: "NONE" | "HEIGHT" = "NONE";

  return {
    pluginData,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get textAutoResize() {
      return textAutoResize;
    },
    set textAutoResize(value: "NONE" | "HEIGHT") {
      textAutoResize = value;
      if (value === "HEIGHT") height = options.naturalHeightForFontSize(fontSize);
    },
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
    },
    getRangeFontSize() {
      return fontSize;
    },
    setRangeFontSize(_start: number, _end: number, nextFontSize: number) {
      fontSize = nextFontSize;
      if (textAutoResize === "HEIGHT") height = options.naturalHeightForFontSize(fontSize);
    },
    setPluginData(key: string, value: string) {
      pluginData.set(key, value);
    },
  };
}

describe("NODE-31 font substitution diagnostics", () => {
  it("persists requested-to-chosen mappings and substitution count", () => {
    const pluginData = new Map<string, string>();
    persistFontSubstitutionDiagnostics(
      { setPluginData: (key, value) => pluginData.set(key, value) },
      [diagnostic(1)],
    );

    expect(pluginData.get("w2f.font.substitutionCount")).toBe("1");
    expect(JSON.parse(pluginData.get("w2f.font.substitutions") ?? "[]")).toEqual([diagnostic(1)]);
    expect(pluginData.get("w2f.font.substitutionsTruncated")).toBe("false");
  });

  it("caps persisted detail while preserving the full substitution count", () => {
    const pluginData = new Map<string, string>();
    const diagnostics = Array.from({ length: 70 }, (_, index) => diagnostic(index));
    persistFontSubstitutionDiagnostics(
      { setPluginData: (key, value) => pluginData.set(key, value) },
      diagnostics,
    );

    expect(pluginData.get("w2f.font.substitutionCount")).toBe("70");
    expect(JSON.parse(pluginData.get("w2f.font.substitutions") ?? "[]")).toHaveLength(64);
    expect(pluginData.get("w2f.font.substitutionsTruncated")).toBe("true");
  });

  it("measures substitution drift, corrects font size, validates the result, and restores target geometry", () => {
    const node = geometryTextNode({
      fontSize: 11,
      naturalHeightForFontSize: (fontSize) => fontSize * 2,
    });

    persistFontSubstitutionDiagnostics(node, [diagnostic(1)]);

    const correction = JSON.parse(node.pluginData.get("w2f.font.geometryCorrection") ?? "{}") as {
      status?: string;
      attempted?: boolean;
      adjustedRangeCount?: number;
      measuredHeightBefore?: number;
      measuredHeightAfter?: number;
      errorRatioAfter?: number;
      scale?: number;
    };
    expect(correction.status).toBe("corrected");
    expect(correction.attempted).toBe(true);
    expect(correction.adjustedRangeCount).toBe(1);
    expect(correction.measuredHeightBefore).toBeCloseTo(22, 6);
    expect(correction.measuredHeightAfter).toBeCloseTo(20, 6);
    expect(correction.errorRatioAfter).toBeLessThanOrEqual(0.02);
    expect(correction.scale).toBeCloseTo(20 / 22, 6);
    expect(node.pluginData.get("w2f.font.geometryCorrectionStatus")).toBe("corrected");
    expect(node.width).toBe(100);
    expect(node.height).toBe(20);
    expect(node.textAutoResize).toBe("NONE");
  });

  it("fails closed when bounded correction cannot validate geometry and still restores exact bounds", () => {
    const node = geometryTextNode({
      fontSize: 20,
      naturalHeightForFontSize: (fontSize) => fontSize * 2,
    });

    persistFontSubstitutionDiagnostics(node, [diagnostic(1)]);

    const correction = JSON.parse(node.pluginData.get("w2f.font.geometryCorrection") ?? "{}") as {
      status?: string;
      attempted?: boolean;
      adjustedRangeCount?: number;
      measuredHeightBefore?: number;
      measuredHeightAfter?: number;
      scale?: number;
    };
    expect(correction.status).toBe("attempted-unvalidated");
    expect(correction.attempted).toBe(true);
    expect(correction.adjustedRangeCount).toBe(1);
    expect(correction.measuredHeightBefore).toBeCloseTo(40, 6);
    expect(correction.measuredHeightAfter).toBeCloseTo(34, 6);
    expect(correction.scale).toBe(0.85);
    expect(node.width).toBe(100);
    expect(node.height).toBe(20);
    expect(node.textAutoResize).toBe("NONE");
  });

  it("keeps correction scaling deterministic and bounded", () => {
    expect(fontGeometryErrorRatio(20, 22)).toBeCloseTo(0.1, 6);
    expect(fontGeometryCorrectionScale(20, 22)).toBeCloseTo(20 / 22, 6);
    expect(fontGeometryCorrectionScale(20, 40)).toBe(0.85);
    expect(fontGeometryCorrectionScale(20, 10)).toBe(1.15);
  });
});
