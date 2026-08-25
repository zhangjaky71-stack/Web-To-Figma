import type { W2fFontResolutionReason } from "./font-resolution.js";

export interface W2fFontSubstitutionDiagnostic {
  renderNodeId: string;
  start: number;
  end: number;
  requestedFamily: string | null;
  requestedStyle: string;
  chosenFamily: string;
  chosenStyle: string;
  reason: Exclude<W2fFontResolutionReason, "exact">;
}

interface PluginDataWriter {
  setPluginData(key: string, value: string): void;
}

const MAX_PERSISTED_FONT_SUBSTITUTIONS = 64;

export function persistFontSubstitutionDiagnostics(
  root: PluginDataWriter,
  diagnostics: readonly W2fFontSubstitutionDiagnostic[],
): void {
  const persisted = diagnostics.slice(0, MAX_PERSISTED_FONT_SUBSTITUTIONS);
  root.setPluginData("w2f.font.substitutionCount", String(diagnostics.length));
  root.setPluginData("w2f.font.substitutions", JSON.stringify(persisted));
  root.setPluginData(
    "w2f.font.substitutionsTruncated",
    String(diagnostics.length > MAX_PERSISTED_FONT_SUBSTITUTIONS),
  );
}
