import { describe, expect, it } from "vitest";
import {
  figmaMessage,
  isW2fBasicRenderRequest,
  isW2fImportSelection,
  isW2fUiToMainMessage,
  W2F_FIGMA_PROTOCOL,
  W2F_FIGMA_PROTOCOL_VERSION,
  W2F_IMPORT_PROFILES,
} from "../src/protocol.js";

function renderRequest() {
  return {
    intakeId: "intake_fixture",
    renderTree: { rootId: "root", nodes: [], sections: [] },
    sourceGraph: { rootCaptureNodeId: "source-root", nodes: [], revision: {} },
    profile: "balanced" as const,
    mode: "whole-page" as const,
    selectedRootIds: [],
    tokenPolicy: "literal" as const,
  };
}

describe("Figma protocol", () => {
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

  it("accepts only versioned basic-render handoffs with literal tokens", () => {
    const request = renderRequest();
    expect(isW2fBasicRenderRequest(request)).toBe(true);
    expect(
      isW2fUiToMainMessage(
        figmaMessage({ type: "W2F_RENDER_BASIC_REQUEST" as const, request }),
      ),
    ).toBe(true);
    expect(isW2fBasicRenderRequest({ ...request, tokenPolicy: "figma-variables" })).toBe(false);
    expect(isW2fBasicRenderRequest({ ...request, mode: "unknown" })).toBe(false);
    expect(isW2fBasicRenderRequest({ ...request, renderTree: null })).toBe(false);
  });

  it("rejects unversioned or unknown UI messages", () => {
    expect(isW2fUiToMainMessage({ payload: { type: "W2F_UI_READY" } })).toBe(false);
    expect(isW2fUiToMainMessage(figmaMessage({ type: "W2F_PARSE_ARCHIVE" }))).toBe(false);
  });
});
