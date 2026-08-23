import type { WtfStyleDeclaration, WtfStyleRecord, WtfStyleSourceTrace } from "@w2f/w2f-ir";
import {
  CSS_CASCADE_ENGINE_VERSION,
  type CssAuthoredDeclarationEvidence,
  type CssCascadePayload,
  type CssCascadePropertyTrace,
  type CssNodeCascadeEvidence,
} from "./types.js";

function normalizedProperty(property: string): string {
  const trimmed = property.trim();
  if (!trimmed) throw new TypeError("CSS property must not be empty");
  return trimmed.startsWith("--") ? trimmed : trimmed.toLowerCase();
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`);
  return value;
}

function candidateKey(candidate: CssAuthoredDeclarationEvidence): string {
  return [
    candidate.source.type,
    candidate.source.stylesheetRef ?? "",
    candidate.source.selector ?? "",
    candidate.source.ruleIndex ?? -1,
    candidate.source.declarationIndex ?? -1,
    candidate.source.layer ?? "",
    candidate.authoredValue,
  ].join("\u001f");
}

function normalizeCandidate(
  property: string,
  candidate: CssAuthoredDeclarationEvidence,
): CssAuthoredDeclarationEvidence {
  const candidateProperty = normalizedProperty(candidate.property);
  if (candidateProperty !== property) {
    throw new TypeError(`cascade candidate property mismatch: expected ${property}, received ${candidateProperty}`);
  }
  const sourceOrder = nonNegativeInteger(candidate.sourceOrder, "sourceOrder");
  const specificity = candidate.specificity;
  if (specificity) {
    nonNegativeInteger(specificity.ids, "specificity.ids");
    nonNegativeInteger(specificity.classes, "specificity.classes");
    nonNegativeInteger(specificity.types, "specificity.types");
  }
  if (candidate.source.ruleIndex !== undefined) nonNegativeInteger(candidate.source.ruleIndex, "ruleIndex");
  if (candidate.source.declarationIndex !== undefined) {
    nonNegativeInteger(candidate.source.declarationIndex, "declarationIndex");
  }
  if (!candidate.authoredValue.trim()) throw new TypeError("authoredValue must not be empty");

  return {
    property,
    authoredValue: candidate.authoredValue,
    important: candidate.important,
    inherited: candidate.inherited,
    status: candidate.status,
    sourceOrder,
    ...(specificity
      ? {
          specificity: {
            ids: specificity.ids,
            classes: specificity.classes,
            types: specificity.types,
          },
        }
      : {}),
    source: {
      type: candidate.source.type,
      ...(candidate.source.stylesheetRef ? { stylesheetRef: candidate.source.stylesheetRef } : {}),
      ...(candidate.source.selector ? { selector: candidate.source.selector } : {}),
      ...(candidate.source.ruleIndex === undefined ? {} : { ruleIndex: candidate.source.ruleIndex }),
      ...(candidate.source.declarationIndex === undefined
        ? {}
        : { declarationIndex: candidate.source.declarationIndex }),
      ...(candidate.source.mediaConditions?.length
        ? { mediaConditions: candidate.source.mediaConditions.map((condition) => condition.trim()).filter(Boolean) }
        : {}),
      ...(candidate.source.layer ? { layer: candidate.source.layer } : {}),
    },
  };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sourceTrace(candidate: CssAuthoredDeclarationEvidence): WtfStyleSourceTrace | undefined {
  const source = candidate.source;
  const trace: WtfStyleSourceTrace = {
    ...(source.stylesheetRef ? { stylesheetRef: source.stylesheetRef } : {}),
    ...(source.selector ? { selector: source.selector } : {}),
    ...(source.ruleIndex === undefined ? {} : { ruleIndex: source.ruleIndex }),
    ...(source.type === "inline" ? { inline: true } : {}),
  };
  return Object.keys(trace).length === 0 ? undefined : trace;
}

export function createCascadePropertyTrace(
  property: string,
  computedValue: string,
  candidates: CssAuthoredDeclarationEvidence[],
  inheritedFromSourceNodeId?: string,
): CssCascadePropertyTrace {
  const normalized = normalizedProperty(property);
  const normalizedCandidates = candidates
    .map((candidate) => normalizeCandidate(normalized, candidate))
    .sort((left, right) => left.sourceOrder - right.sourceOrder || candidateKey(left).localeCompare(candidateKey(right)));

  const winners = normalizedCandidates.filter((candidate) => candidate.status === "winner");
  if (winners.length > 1) throw new TypeError(`cascade trace for ${normalized} has multiple winners`);

  return {
    property: normalized,
    computedValue,
    candidates: normalizedCandidates,
    ...(inheritedFromSourceNodeId ? { inheritedFromSourceNodeId } : {}),
  };
}

export function createNodeCascadeEvidence(
  sourceNodeId: string,
  traces: CssCascadePropertyTrace[],
  customProperties: Record<string, string> = {},
): CssNodeCascadeEvidence {
  if (!sourceNodeId.trim()) throw new TypeError("sourceNodeId must not be empty");
  const normalizedTraces = traces
    .map((trace) =>
      createCascadePropertyTrace(
        trace.property,
        trace.computedValue,
        trace.candidates,
        trace.inheritedFromSourceNodeId,
      ),
    )
    .sort((left, right) => left.property.localeCompare(right.property));

  const properties = new Set<string>();
  for (const trace of normalizedTraces) {
    if (properties.has(trace.property)) throw new TypeError(`duplicate cascade trace for ${trace.property}`);
    properties.add(trace.property);
  }

  const normalizedCustomProperties = Object.fromEntries(
    Object.entries(customProperties)
      .map(([name, value]) => {
        if (!name.startsWith("--")) throw new TypeError(`custom property must start with --: ${name}`);
        return [name, value] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    sourceNodeId,
    traces: normalizedTraces,
    customProperties: normalizedCustomProperties,
  };
}

export function createCascadePayload(nodes: CssNodeCascadeEvidence[]): CssCascadePayload {
  const normalizedNodes = nodes
    .map((node) => createNodeCascadeEvidence(node.sourceNodeId, node.traces, node.customProperties))
    .sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
  const ids = new Set<string>();
  for (const node of normalizedNodes) {
    if (ids.has(node.sourceNodeId)) throw new TypeError(`duplicate cascade node ${node.sourceNodeId}`);
    ids.add(node.sourceNodeId);
  }
  return { version: CSS_CASCADE_ENGINE_VERSION, nodes: normalizedNodes };
}

export function toWtfStyleRecord(id: string, evidence: CssNodeCascadeEvidence): WtfStyleRecord {
  if (!id.trim()) throw new TypeError("style record id must not be empty");
  const normalized = createNodeCascadeEvidence(
    evidence.sourceNodeId,
    evidence.traces,
    evidence.customProperties,
  );
  const declarations: WtfStyleDeclaration[] = normalized.traces.map((trace) => {
    const winner = trace.candidates.find((candidate) => candidate.status === "winner");
    const source = winner ? sourceTrace(winner) : undefined;
    return {
      property: trace.property,
      computedValue: trace.computedValue,
      ...(winner ? { authoredValue: winner.authoredValue, important: winner.important } : {}),
      ...(winner?.inherited || trace.inheritedFromSourceNodeId ? { inherited: true } : {}),
      ...(source ? { source } : {}),
    };
  });
  const cascadeHash = fnv1a(JSON.stringify(normalized));
  return {
    id,
    declarations,
    ...(Object.keys(normalized.customProperties).length
      ? { customProperties: normalized.customProperties }
      : {}),
    cascadeHash,
  };
}
