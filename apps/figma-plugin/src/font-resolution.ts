export interface W2fFontRequest {
  family?: string;
  style?: string;
  weight?: number | string;
}

export interface W2fAvailableFont {
  fontName: {
    family: string;
    style: string;
  };
}

export type W2fFontResolutionReason =
  | "exact"
  | "same-family-regular"
  | "same-family-nearest"
  | "default-font"
  | "first-available"
  | "built-in-default";

export interface W2fFontResolutionDecision {
  requestedFamily: string | null;
  requestedStyle: string;
  chosenFamily: string;
  chosenStyle: string;
  fallback: boolean;
  reason: W2fFontResolutionReason;
}

export const W2F_DEFAULT_FONT = { family: "Inter", style: "Regular" } as const;

export function fontStyleFromWeight(weight: number | string | undefined): string {
  const numeric =
    typeof weight === "number" ? weight : Number.parseInt(String(weight ?? "400"), 10);
  if (!Number.isFinite(numeric)) return "Regular";
  if (numeric >= 800) return "Extra Bold";
  if (numeric >= 700) return "Bold";
  if (numeric >= 600) return "Semi Bold";
  if (numeric >= 500) return "Medium";
  if (numeric <= 300) return "Light";
  return "Regular";
}

function same(value: string, expected: string): boolean {
  return value.toLowerCase() === expected.toLowerCase();
}

export function resolveFontDecision(
  request: W2fFontRequest | undefined,
  available: readonly W2fAvailableFont[],
): W2fFontResolutionDecision {
  const family = request?.family?.trim() || null;
  const requestedStyle = request?.style?.trim() || fontStyleFromWeight(request?.weight);

  if (family) {
    const exact = available.find(
      (font) => same(font.fontName.family, family) && same(font.fontName.style, requestedStyle),
    );
    if (exact) {
      return {
        requestedFamily: family,
        requestedStyle,
        chosenFamily: exact.fontName.family,
        chosenStyle: exact.fontName.style,
        fallback: false,
        reason: "exact",
      };
    }

    const regular = available.find(
      (font) => same(font.fontName.family, family) && same(font.fontName.style, "Regular"),
    );
    if (regular) {
      return {
        requestedFamily: family,
        requestedStyle,
        chosenFamily: regular.fontName.family,
        chosenStyle: regular.fontName.style,
        fallback: true,
        reason: "same-family-regular",
      };
    }

    const nearest = available.find((font) => same(font.fontName.family, family));
    if (nearest) {
      return {
        requestedFamily: family,
        requestedStyle,
        chosenFamily: nearest.fontName.family,
        chosenStyle: nearest.fontName.style,
        fallback: true,
        reason: "same-family-nearest",
      };
    }
  }

  const defaultFont = available.find(
    (font) =>
      same(font.fontName.family, W2F_DEFAULT_FONT.family) &&
      same(font.fontName.style, W2F_DEFAULT_FONT.style),
  );
  if (defaultFont) {
    return {
      requestedFamily: family,
      requestedStyle,
      chosenFamily: defaultFont.fontName.family,
      chosenStyle: defaultFont.fontName.style,
      fallback: true,
      reason: "default-font",
    };
  }

  const first = available[0];
  if (first) {
    return {
      requestedFamily: family,
      requestedStyle,
      chosenFamily: first.fontName.family,
      chosenStyle: first.fontName.style,
      fallback: true,
      reason: "first-available",
    };
  }

  return {
    requestedFamily: family,
    requestedStyle,
    chosenFamily: W2F_DEFAULT_FONT.family,
    chosenStyle: W2F_DEFAULT_FONT.style,
    fallback: true,
    reason: "built-in-default",
  };
}
