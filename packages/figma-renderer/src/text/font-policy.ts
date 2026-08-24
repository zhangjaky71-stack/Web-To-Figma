import type { WtfFontDescriptor } from "@w2f/w2f-ir";
import type { W2fFontRequest } from "./types.js";

const WEIGHT_STYLES: ReadonlyArray<readonly [maximum: number, style: string]> = [
  [150, "Thin"],
  [250, "Extra Light"],
  [350, "Light"],
  [450, "Regular"],
  [550, "Medium"],
  [650, "Semi Bold"],
  [750, "Bold"],
  [850, "Extra Bold"],
  [1000, "Black"],
];

function numericWeight(weight: number | string | undefined): number {
  if (typeof weight === "number" && Number.isFinite(weight)) return Math.min(1000, Math.max(1, weight));
  if (typeof weight !== "string") return 400;
  const normalized = weight.trim().toLowerCase();
  if (normalized === "normal") return 400;
  if (normalized === "bold" || normalized === "bolder") return 700;
  if (normalized === "lighter") return 300;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.min(1000, Math.max(1, parsed)) : 400;
}

function styleForWeight(weight: number | string | undefined): string {
  const value = numericWeight(weight);
  return WEIGHT_STYLES.find(([maximum]) => value <= maximum)?.[1] ?? "Black";
}

export function candidateFigmaFontStyle(font: WtfFontDescriptor): string {
  const requested = font.style?.trim();
  const normalized = requested?.toLowerCase();
  if (requested && normalized !== "normal" && normalized !== "italic" && normalized !== "oblique") {
    return requested;
  }
  const base = styleForWeight(font.weight);
  return normalized === "italic" || normalized === "oblique" ? `${base} Italic` : base;
}

export function createFontRequest(font: WtfFontDescriptor): W2fFontRequest {
  const family = font.family.trim();
  if (!family) throw new TypeError("W2F_RENDERER_FONT: font family must not be empty");
  const candidateStyle = candidateFigmaFontStyle(font);
  return {
    family,
    candidateStyle,
    key: `${family}\u0000${candidateStyle}`,
    ...(font.style ? { requestedStyle: font.style } : {}),
    ...(font.weight !== undefined ? { weight: font.weight } : {}),
    ...(font.stretch ? { stretch: font.stretch } : {}),
    ...(font.variationSettings ? { variationSettings: font.variationSettings } : {}),
    ...(font.featureSettings ? { featureSettings: font.featureSettings } : {}),
    ...(font.postscriptName ? { postscriptName: font.postscriptName } : {}),
    ...(font.sourceRef ? { sourceRef: font.sourceRef } : {}),
    ...(font.fingerprint ? { fingerprint: font.fingerprint } : {}),
  };
}
