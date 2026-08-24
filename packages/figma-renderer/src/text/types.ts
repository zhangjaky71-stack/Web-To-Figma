import type { WtfFontDescriptor, WtfRenderNode } from "@w2f/w2f-ir";
import type { W2fColorPlan } from "../color.js";

export const W2F_TEXT_RENDER_PLAN_VERSION = "1.0.0" as const;

export type W2fTextAlignPlan = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";

export type W2fLineHeightPlan =
  | { unit: "AUTO" }
  | { unit: "PIXELS"; value: number }
  | { unit: "PERCENT"; value: number }
  | { unit: "UNRESOLVED"; raw: string };

export type W2fTextDecorationPlan =
  | { kind: "NONE" }
  | { kind: "UNDERLINE" }
  | { kind: "STRIKETHROUGH" }
  | { kind: "UNRESOLVED"; raw: string };

export interface W2fFontRequest {
  family: string;
  candidateStyle: string;
  key: string;
  requestedStyle?: string;
  weight?: number | string;
  stretch?: string;
  variationSettings?: string;
  featureSettings?: string;
  postscriptName?: string;
  sourceRef?: string;
  fingerprint?: string;
}

export interface W2fTextRangePlan {
  start: number;
  end: number;
  text: string;
  font: W2fFontRequest;
  fontSize: number;
  lineHeight: W2fLineHeightPlan;
  letterSpacing?: number;
  color?: W2fColorPlan;
  decoration: W2fTextDecorationPlan;
  baselineShift?: number;
  direction?: "ltr" | "rtl";
}

export interface W2fTextRenderPlan {
  version: typeof W2F_TEXT_RENDER_PLAN_VERSION;
  renderNodeId: string;
  characters: string;
  ranges: readonly W2fTextRangePlan[];
  baseFont?: W2fFontRequest;
  textAlign: W2fTextAlignPlan;
  direction: "ltr" | "rtl";
  whiteSpace?: string;
  wordBreak?: string;
  overflowWrap?: string;
  editableStrategyHint?: "editable" | "balanced" | "pixel";
  sourceNodeIds: readonly string[];
  sourceStableIds: readonly string[];
  revisionHashes?: WtfRenderNode["revisionHashes"];
}

export interface W2fFontResolutionExact {
  level: "A";
  requested: W2fFontRequest;
  resolvedFamily: string;
  resolvedStyle: string;
}

export interface W2fFontResolutionSubstitution {
  level: "B";
  requested: W2fFontRequest;
  resolvedFamily: string;
  resolvedStyle: string;
  diagnostic: string;
}

export interface W2fFontResolutionUnavailable {
  level: "C";
  requested: W2fFontRequest;
  diagnostic: string;
  routeToHybridFallback: true;
}

export type W2fFontResolution =
  | W2fFontResolutionExact
  | W2fFontResolutionSubstitution
  | W2fFontResolutionUnavailable;

export type W2fFontDescriptorInput = WtfFontDescriptor;
