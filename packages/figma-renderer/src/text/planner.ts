import type { WtfRenderNode, WtfTextRun } from "@w2f/w2f-ir";
import { createColorPlan } from "../color.js";
import { createFontRequest } from "./font-policy.js";
import {
  W2F_TEXT_RENDER_PLAN_VERSION,
  type W2fLineHeightPlan,
  type W2fTextAlignPlan,
  type W2fTextDecorationPlan,
  type W2fTextRangePlan,
  type W2fTextRenderPlan,
} from "./types.js";

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`W2F_RENDERER_TEXT: ${label} must be a positive finite number`);
  }
  return value;
}

export function createLineHeightPlan(value: number | string | undefined): W2fLineHeightPlan {
  if (value === undefined) return { unit: "AUTO" };
  if (typeof value === "number") return { unit: "PIXELS", value: finitePositive(value, "line height") };
  const raw = value.trim();
  const normalized = raw.toLowerCase();
  if (!raw || normalized === "normal") return { unit: "AUTO" };
  const pixels = /^([0-9]*\.?[0-9]+)px$/i.exec(raw);
  if (pixels) return { unit: "PIXELS", value: finitePositive(Number(pixels[1]), "line height") };
  const percent = /^([0-9]*\.?[0-9]+)%$/.exec(raw);
  if (percent) return { unit: "PERCENT", value: finitePositive(Number(percent[1]), "line height") };
  const unitless = Number(raw);
  if (Number.isFinite(unitless) && unitless > 0) {
    return { unit: "PERCENT", value: unitless * 100 };
  }
  return { unit: "UNRESOLVED", raw };
}

export function createTextDecorationPlan(value: string | undefined): W2fTextDecorationPlan {
  const raw = value?.trim() ?? "";
  if (!raw || raw === "none") return { kind: "NONE" };
  const lower = raw.toLowerCase();
  const underline = lower.includes("underline");
  const strike = lower.includes("line-through");
  if (underline && !strike) return { kind: "UNDERLINE" };
  if (strike && !underline) return { kind: "STRIKETHROUGH" };
  return { kind: "UNRESOLVED", raw };
}

export function createTextAlignPlan(value: string | undefined, direction: "ltr" | "rtl"): W2fTextAlignPlan {
  switch (value?.trim().toLowerCase()) {
    case "center":
      return "CENTER";
    case "right":
      return "RIGHT";
    case "justify":
    case "justify-all":
      return "JUSTIFIED";
    case "end":
      return direction === "rtl" ? "LEFT" : "RIGHT";
    case "start":
      return direction === "rtl" ? "RIGHT" : "LEFT";
    case "left":
    default:
      return "LEFT";
  }
}

function assertRun(run: WtfTextRun, value: string, expectedStart: number): void {
  if (!Number.isSafeInteger(run.start) || !Number.isSafeInteger(run.end)) {
    throw new TypeError("W2F_RENDERER_TEXT: text run indexes must be safe integers");
  }
  if (run.start !== expectedStart || run.end < run.start || run.end > value.length) {
    throw new TypeError(`W2F_RENDERER_TEXT: text runs must cover the value without gaps or overlap at ${expectedStart}`);
  }
  if (value.slice(run.start, run.end) !== run.text) {
    throw new TypeError(`W2F_RENDERER_TEXT: text run ${run.start}-${run.end} does not match characters`);
  }
  finitePositive(run.fontSize, "font size");
  if (run.letterSpacing !== undefined && !Number.isFinite(run.letterSpacing)) {
    throw new TypeError("W2F_RENDERER_TEXT: letter spacing must be finite");
  }
  if (run.baselineShift !== undefined && !Number.isFinite(run.baselineShift)) {
    throw new TypeError("W2F_RENDERER_TEXT: baseline shift must be finite");
  }
}

function createRangePlan(run: WtfTextRun): W2fTextRangePlan {
  return {
    start: run.start,
    end: run.end,
    text: run.text,
    font: createFontRequest(run.font),
    fontSize: run.fontSize,
    lineHeight: createLineHeightPlan(run.lineHeight),
    ...(run.letterSpacing !== undefined ? { letterSpacing: run.letterSpacing } : {}),
    ...(run.color ? { color: createColorPlan(run.color) } : {}),
    decoration: createTextDecorationPlan(run.decoration),
    ...(run.baselineShift !== undefined ? { baselineShift: run.baselineShift } : {}),
    ...(run.direction ? { direction: run.direction } : {}),
  };
}

export function createTextRenderPlan(node: WtfRenderNode): W2fTextRenderPlan | null {
  if (!node.text) return null;
  if (node.kind !== "text") {
    throw new TypeError(`W2F_RENDERER_TEXT: render node ${node.id} carries text but is not kind=text`);
  }

  const model = node.text;
  const runs = [...model.runs].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  for (const run of runs) {
    assertRun(run, model.value, cursor);
    cursor = run.end;
  }
  if (cursor !== model.value.length) {
    if (model.value.length !== 0 || runs.length !== 0) {
      throw new TypeError("W2F_RENDERER_TEXT: text runs must cover every character");
    }
  }

  const ranges = runs.map(createRangePlan);
  const direction = model.direction ?? ranges[0]?.direction ?? "ltr";
  return {
    version: W2F_TEXT_RENDER_PLAN_VERSION,
    renderNodeId: node.id,
    characters: model.value,
    ranges,
    ...(ranges[0] ? { baseFont: ranges[0].font } : {}),
    textAlign: createTextAlignPlan(model.textAlign, direction),
    direction,
    ...(model.whiteSpace ? { whiteSpace: model.whiteSpace } : {}),
    ...(model.wordBreak ? { wordBreak: model.wordBreak } : {}),
    ...(model.overflowWrap ? { overflowWrap: model.overflowWrap } : {}),
    ...(model.editableStrategyHint ? { editableStrategyHint: model.editableStrategyHint } : {}),
    sourceNodeIds: [...node.sourceNodeIds],
    sourceStableIds: [...(node.sourceStableIds ?? [])],
    ...(node.revisionHashes ? { revisionHashes: { ...node.revisionHashes } } : {}),
  };
}
