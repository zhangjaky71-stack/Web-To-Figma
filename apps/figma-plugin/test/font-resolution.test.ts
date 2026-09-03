import { describe, expect, it } from "vitest";
import { fontStyleFromWeight, resolveFontDecision } from "../src/font-resolution.js";

const available = [
  { fontName: { family: "Inter", style: "Regular" } },
  { fontName: { family: "Acme Sans", style: "Regular" } },
  { fontName: { family: "Acme Sans", style: "Bold" } },
  { fontName: { family: "Display One", style: "Black" } },
] as const;

describe("NODE-31 font resolution", () => {
  it("prefers an exact available family and style without fallback", () => {
    expect(resolveFontDecision({ family: "acme sans", style: "bold" }, available)).toEqual({
      requestedFamily: "acme sans",
      requestedStyle: "bold",
      chosenFamily: "Acme Sans",
      chosenStyle: "Bold",
      fallback: false,
      reason: "exact",
    });
  });

  it("maps a missing style to same-family Regular with an explicit reason", () => {
    expect(resolveFontDecision({ family: "Acme Sans", style: "Italic" }, available)).toMatchObject({
      chosenFamily: "Acme Sans",
      chosenStyle: "Regular",
      fallback: true,
      reason: "same-family-regular",
    });
  });

  it("uses the nearest same-family face when Regular is unavailable", () => {
    expect(resolveFontDecision({ family: "Display One", style: "Bold" }, available)).toMatchObject({
      chosenFamily: "Display One",
      chosenStyle: "Black",
      fallback: true,
      reason: "same-family-nearest",
    });
  });

  it("falls back to the declared default before arbitrary available fonts", () => {
    expect(resolveFontDecision({ family: "Missing", style: "Bold" }, available)).toMatchObject({
      chosenFamily: "Inter",
      chosenStyle: "Regular",
      fallback: true,
      reason: "default-font",
    });
  });

  it("keeps weight-to-style mapping deterministic", () => {
    expect(fontStyleFromWeight(800)).toBe("Extra Bold");
    expect(fontStyleFromWeight(700)).toBe("Bold");
    expect(fontStyleFromWeight(600)).toBe("Semi Bold");
    expect(fontStyleFromWeight(500)).toBe("Medium");
    expect(fontStyleFromWeight(300)).toBe("Light");
    expect(fontStyleFromWeight("not-a-weight")).toBe("Regular");
  });
});
