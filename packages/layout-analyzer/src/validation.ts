import { BASE_LAYOUT_ANALYSIS_VERSION, type BaseLayoutAnalysis } from "./types.js";

const LAYOUT_MODES = new Set([
  "none",
  "flow",
  "flex",
  "grid",
  "absolute",
  "table",
  "inline",
  "contents",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteConfidence(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    finiteConfidence(value.confidence) &&
    Array.isArray(value.reasons) &&
    value.reasons.every((reason) => typeof reason === "string") &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) && value.sourceRefs.every((ref) => typeof ref === "string")))
  );
}

function isSizing(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.width) || !isRecord(value.height)) return false;
  const modes = new Set(["fill", "hug", "fixed", "intrinsic", "content", "unknown"]);
  return (
    modes.has(String(value.width.mode)) &&
    modes.has(String(value.height.mode)) &&
    isDecision(value.width) &&
    isDecision(value.height)
  );
}

function isLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    LAYOUT_MODES.has(String(value.mode)) &&
    typeof value.display === "string" &&
    typeof value.position === "string" &&
    isSizing(value.sizing) &&
    isDecision(value.decision)
  );
}

function isDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.startsWith("LAYOUT_") &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.sourceNodeId === undefined || typeof value.sourceNodeId === "string") &&
    (value.property === undefined || typeof value.property === "string")
  );
}

export function isBaseLayoutAnalysis(value: unknown): value is BaseLayoutAnalysis {
  if (!isRecord(value) || value.version !== BASE_LAYOUT_ANALYSIS_VERSION) return false;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.diagnostics)) return false;
  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (!isRecord(node) || typeof node.sourceNodeId !== "string" || !node.sourceNodeId) return false;
    if (ids.has(node.sourceNodeId) || !isLayout(node.layout)) return false;
    if (!Array.isArray(node.diagnostics) || !node.diagnostics.every(isDiagnostic)) return false;
    ids.add(node.sourceNodeId);
  }
  return value.diagnostics.every(isDiagnostic);
}
