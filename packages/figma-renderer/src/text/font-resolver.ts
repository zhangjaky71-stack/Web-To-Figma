import type { W2fAvailableFont } from "../rich-types.js";
import type { W2fFontRequest, W2fFontResolution } from "./types.js";

const WEIGHT_BY_TOKEN: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bthin\b/i, 100],
  [/\b(extra|ultra)[ -]?light\b/i, 200],
  [/\blight\b/i, 300],
  [/\b(book|normal|regular|roman)\b/i, 400],
  [/\bmedium\b/i, 500],
  [/\b(semi|demi)[ -]?bold\b/i, 600],
  [/\bbold\b/i, 700],
  [/\b(extra|ultra)[ -]?bold\b/i, 800],
  [/\b(black|heavy)\b/i, 900],
];

function numericWeight(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const lower = value.toLowerCase();
    if (lower === "bold" || lower === "bolder") return 700;
    if (lower === "lighter") return 300;
  }
  return 400;
}

function styleWeight(style: string): number {
  for (const [pattern, weight] of WEIGHT_BY_TOKEN) {
    if (pattern.test(style)) return weight;
  }
  return 400;
}

function isItalic(style: string): boolean {
  return /\b(italic|oblique)\b/i.test(style);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/g, " ");
}

function styleScore(request: W2fFontRequest, available: W2fAvailableFont): number {
  const weightPenalty = Math.abs(numericWeight(request.weight) - styleWeight(available.style));
  const italicPenalty = isItalic(request.candidateStyle) === isItalic(available.style) ? 0 : 1000;
  return italicPenalty + weightPenalty;
}

export function resolveFontRequest(
  request: W2fFontRequest,
  availableFonts: readonly W2fAvailableFont[],
): W2fFontResolution {
  const family = normalize(request.family);
  const familyMatches = availableFonts.filter((font) => normalize(font.family) === family);
  const exact = familyMatches.find((font) => normalize(font.style) === normalize(request.candidateStyle));
  if (exact) {
    return {
      level: "A",
      requested: request,
      resolvedFamily: exact.family,
      resolvedStyle: exact.style,
    };
  }
  if (familyMatches.length === 0) {
    return {
      level: "C",
      requested: request,
      diagnostic: `Font family ${request.family} is not available in the current Figma editor`,
      routeToHybridFallback: true,
    };
  }

  const ranked = [...familyMatches].sort((left, right) => {
    const score = styleScore(request, left) - styleScore(request, right);
    if (score !== 0) return score;
    return left.style.localeCompare(right.style, "en-US");
  });
  const selected = ranked[0]!;
  return {
    level: "B",
    requested: request,
    resolvedFamily: selected.family,
    resolvedStyle: selected.style,
    diagnostic: `Font style ${request.family} ${request.candidateStyle} is unavailable; using same-family ${selected.style}`,
  };
}

export function resolveFontRequests(
  requests: readonly W2fFontRequest[],
  availableFonts: readonly W2fAvailableFont[],
): readonly W2fFontResolution[] {
  const unique = new Map<string, W2fFontRequest>();
  for (const request of requests) unique.set(request.key, request);
  return [...unique.values()]
    .sort((left, right) => left.key.localeCompare(right.key, "en-US"))
    .map((request) => resolveFontRequest(request, availableFonts));
}
