import { describe, expect, it } from "vitest";
import { persistFontSubstitutionDiagnostics } from "../src/font-diagnostics.js";

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
});
