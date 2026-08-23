import type { WtfCssLength, WtfCssLengthSemantic } from "@w2f/w2f-ir";

const LENGTH_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%|em|rem|vw|vh|vmin|vmax)$/i;
const ZERO_PATTERN = /^[+-]?0(?:\.0+)?$/;
const KEYWORD_PATTERN = /^[a-z-]+$/i;

function finiteResolvedPx(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseCssLength(authoredValue: string, resolvedPx?: number): WtfCssLength {
  const raw = authoredValue.trim();
  const lower = raw.toLowerCase();
  let semantic: WtfCssLengthSemantic;

  if (ZERO_PATTERN.test(lower)) {
    semantic = { type: "px", value: 0 };
  } else {
    const match = LENGTH_PATTERN.exec(lower);
    if (match) {
      const value = Number.parseFloat(match[1]!);
      const unit = match[2]!.toLowerCase();
      if (unit === "px") semantic = { type: "px", value };
      else if (unit === "%") semantic = { type: "percent", value };
      else if (unit === "em") semantic = { type: "em", value };
      else if (unit === "rem") semantic = { type: "rem", value };
      else {
        semantic = {
          type: "viewport",
          unit: unit as "vw" | "vh" | "vmin" | "vmax",
          value,
        };
      }
    } else if (raw && KEYWORD_PATTERN.test(raw)) {
      semantic = { type: "keyword", value: raw };
    } else {
      semantic = { type: "expression", raw };
    }
  }

  const resolved = finiteResolvedPx(resolvedPx);
  return {
    semantic,
    authoredValue,
    ...(resolved === undefined ? {} : { resolvedPx: resolved }),
  };
}
