import { describe, expect, it } from "vitest";
import {
  figmaMessage,
  isW2fImportSelection,
  isW2fUiToMainMessage,
  W2F_FIGMA_PROTOCOL,
  W2F_FIGMA_PROTOCOL_VERSION,
  W2F_IMPORT_PROFILES,
} from "../src/protocol.js";

describe("NODE-22 Figma protocol", () => {
  it("freezes the versioned main/UI envelope", () => {
    const message = figmaMessage({ type: "W2F_UI_READY" as const });
    expect(message.protocol).toBe(W2F_FIGMA_PROTOCOL);
    expect(message.version).toBe(W2F_FIGMA_PROTOCOL_VERSION);
    expect(isW2fUiToMainMessage(message)).toBe(true);
  });

  it("freezes the three V2 render profiles", () => {
    expect(W2F_IMPORT_PROFILES).toEqual(["high-fidelity", "balanced", "design-friendly"]);
  });

  it("keeps literal token import as the V2.1 default policy", () => {
    expect(
      isW2fImportSelection({
        profile: "balanced",
        scope: "whole-page",
        selectedSectionIds: [],
        tokenPolicy: "literal",
      }),
    ).toBe(true);
    expect(
      isW2fImportSelection({
        profile: "balanced",
        scope: "whole-page",
        selectedSectionIds: [],
        tokenPolicy: "figma-variables",
      }),
    ).toBe(false);
  });

  it("rejects unversioned or unknown UI messages", () => {
    expect(isW2fUiToMainMessage({ payload: { type: "W2F_UI_READY" } })).toBe(false);
    expect(isW2fUiToMainMessage(figmaMessage({ type: "W2F_PARSE_ARCHIVE" }))).toBe(false);
  });
});
