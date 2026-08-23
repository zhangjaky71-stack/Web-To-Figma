import { buildTokenGraph } from "./tokens.js";
import { createCascadePayload, toWtfStyleRecord } from "./cascade.js";
import {
  CSS_CASCADE_ENGINE_VERSION,
  type CssCascadeAdapter,
  type CssCascadeCapture,
  type CssCascadeDiagnostic,
  type CssDeclarationStatus,
  type CssNodeCascadeEvidence,
  type CssTokenDefinitionEvidence,
  type CssTokenUsageEvidence,
  type CssUnresolvedTokenUsage,
} from "./types.js";

export interface CreateCssCascadeCaptureInput {
  adapter: CssCascadeAdapter;
  nodes: CssNodeCascadeEvidence[];
  tokenDefinitions?: CssTokenDefinitionEvidence[];
  tokenUsages?: CssTokenUsageEvidence[];
  unresolvedTokenUsages?: CssUnresolvedTokenUsage[];
  diagnostics?: CssCascadeDiagnostic[];
}

const STATUSES = new Set<CssDeclarationStatus>([
  "winner",
  "overridden",
  "inactive-condition",
  "matched-unresolved",
]);

function compareDiagnostic(left: CssCascadeDiagnostic, right: CssCascadeDiagnostic): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") ||
    (left.stylesheetRef ?? "").localeCompare(right.stylesheetRef ?? "") ||
    left.message.localeCompare(right.message)
  );
}

function compareUnresolvedUsage(
  left: CssUnresolvedTokenUsage,
  right: CssUnresolvedTokenUsage,
): number {
  return (
    left.sourceNodeId.localeCompare(right.sourceNodeId) ||
    left.property.localeCompare(right.property) ||
    left.tokenName.localeCompare(right.tokenName) ||
    left.authoredValue.localeCompare(right.authoredValue)
  );
}

export function createCssCascadeCapture(input: CreateCssCascadeCaptureInput): CssCascadeCapture {
  const cascade = createCascadePayload(input.nodes);
  const styles = cascade.nodes.map((node) => toWtfStyleRecord(`style:${node.sourceNodeId}`, node));
  const tokens = buildTokenGraph({
    definitions: input.tokenDefinitions ?? [],
    usages: input.tokenUsages ?? [],
  }).graph;
  return {
    version: CSS_CASCADE_ENGINE_VERSION,
    adapter: input.adapter,
    cascade,
    styles,
    tokens,
    unresolvedTokenUsages: [...(input.unresolvedTokenUsages ?? [])].sort(compareUnresolvedUsage),
    diagnostics: [...(input.diagnostics ?? [])].sort(compareDiagnostic),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isNodeEvidence(value: unknown): boolean {
  if (!isRecord(value) || typeof value.sourceNodeId !== "string" || !value.sourceNodeId) return false;
  if (!Array.isArray(value.traces) || !isStringRecord(value.customProperties)) return false;
  return value.traces.every((trace) => {
    if (
      !isRecord(trace) ||
      typeof trace.property !== "string" ||
      !trace.property ||
      typeof trace.computedValue !== "string" ||
      !Array.isArray(trace.candidates)
    ) {
      return false;
    }
    return trace.candidates.every((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.source)) return false;
      return (
        candidate.property === trace.property &&
        typeof candidate.authoredValue === "string" &&
        typeof candidate.important === "boolean" &&
        typeof candidate.inherited === "boolean" &&
        typeof candidate.status === "string" &&
        STATUSES.has(candidate.status as CssDeclarationStatus) &&
        Number.isSafeInteger(candidate.sourceOrder) &&
        (candidate.sourceOrder as number) >= 0 &&
        ["stylesheet", "inline", "presentational"].includes(String(candidate.source.type))
      );
    });
  });
}

function isStyleRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Array.isArray(value.declarations) &&
    value.declarations.every(
      (declaration) =>
        isRecord(declaration) &&
        typeof declaration.property === "string" &&
        typeof declaration.computedValue === "string",
    ) &&
    (value.customProperties === undefined || isStringRecord(value.customProperties)) &&
    (value.cascadeHash === undefined || typeof value.cascadeHash === "string")
  );
}

function isTokenGraph(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.tokens) || !Array.isArray(value.usages)) return false;
  const ids = new Set<string>();
  for (const token of value.tokens) {
    if (!isRecord(token) || typeof token.id !== "string" || !token.id || ids.has(token.id)) return false;
    ids.add(token.id);
  }
  return value.usages.every(
    (usage) => isRecord(usage) && typeof usage.tokenId === "string" && ids.has(usage.tokenId),
  );
}

function isUnresolvedUsage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sourceNodeId === "string" &&
    typeof value.property === "string" &&
    typeof value.tokenName === "string" &&
    value.tokenName.startsWith("--") &&
    typeof value.authoredValue === "string" &&
    typeof value.resolvedValue === "string" &&
    (value.reason === "definition-ambiguous" || value.reason === "definition-unavailable")
  );
}

function isDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.startsWith("CSS_") &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.sourceNodeId === undefined || typeof value.sourceNodeId === "string") &&
    (value.stylesheetRef === undefined || typeof value.stylesheetRef === "string")
  );
}

export function isCssCascadeCapture(value: unknown): value is CssCascadeCapture {
  if (
    !isRecord(value) ||
    value.version !== CSS_CASCADE_ENGINE_VERSION ||
    (value.adapter !== "standard" && value.adapter !== "cdp") ||
    !isRecord(value.cascade) ||
    value.cascade.version !== CSS_CASCADE_ENGINE_VERSION ||
    !Array.isArray(value.cascade.nodes) ||
    !value.cascade.nodes.every(isNodeEvidence) ||
    !Array.isArray(value.styles) ||
    !value.styles.every(isStyleRecord) ||
    !isTokenGraph(value.tokens) ||
    !Array.isArray(value.unresolvedTokenUsages) ||
    !value.unresolvedTokenUsages.every(isUnresolvedUsage) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic)
  ) {
    return false;
  }
  const sourceIds = new Set((value.cascade.nodes as CssNodeCascadeEvidence[]).map((node) => node.sourceNodeId));
  if (sourceIds.size !== value.cascade.nodes.length) return false;
  if (value.styles.length !== value.cascade.nodes.length) return false;
  return value.styles.every((style) => {
    const record = style as { id: string };
    return record.id.startsWith("style:") && sourceIds.has(record.id.slice("style:".length));
  });
}

export function summarizeCssCascadeCapture(capture: CssCascadeCapture) {
  if (!isCssCascadeCapture(capture)) throw new TypeError("invalid CssCascadeCapture");
  return {
    version: capture.version,
    adapter: capture.adapter,
    nodeCount: capture.cascade.nodes.length,
    styleCount: capture.styles.length,
    tokenCount: capture.tokens.tokens.length,
    tokenUsageCount: capture.tokens.usages.length,
    unresolvedTokenUsageCount: capture.unresolvedTokenUsages.length,
    diagnosticCount: capture.diagnostics.length,
  };
}
