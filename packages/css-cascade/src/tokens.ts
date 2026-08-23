import type { WtfTokenKind } from "@w2f/w2f-schema";
import type {
  CssTokenDefinitionEvidence,
  CssTokenGraphBuildInput,
  CssTokenGraphBuildResult,
} from "./types.js";

const COLOR_PATTERN = /^(?:#(?:[0-9a-f]{3,8})|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\()/i;
const DIMENSION_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px|%|em|rem|vw|vh|vmin|vmax)$/i;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const VAR_REFERENCE_PATTERN = /var\(\s*(--[A-Za-z0-9_-]+)/g;

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function confidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("token confidence must be within [0, 1]");
  }
  return value;
}

function tokenId(definition: CssTokenDefinitionEvidence): string {
  return `tok_${fnv1a(`${definition.definitionKey}\u001f${definition.name}`)}`;
}

export function inferTokenKind(value: unknown): WtfTokenKind {
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim();
  if (COLOR_PATTERN.test(trimmed)) return "color";
  if (DIMENSION_PATTERN.test(trimmed)) return "dimension";
  if (NUMBER_PATTERN.test(trimmed)) return "number";
  return trimmed ? "string" : "unknown";
}

export function extractVarReferenceNames(authoredValue: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const match of authoredValue.matchAll(VAR_REFERENCE_PATTERN)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function buildTokenGraph(input: CssTokenGraphBuildInput): CssTokenGraphBuildResult {
  const definitions = [...input.definitions].sort((left, right) =>
    left.definitionKey.localeCompare(right.definitionKey),
  );
  const byKey = new Map<string, CssTokenDefinitionEvidence>();
  const definitionIds: Record<string, string> = {};

  for (const definition of definitions) {
    if (!definition.definitionKey.trim()) throw new TypeError("token definitionKey must not be empty");
    if (!definition.name.startsWith("--")) {
      throw new TypeError(`CSS custom property token must start with --: ${definition.name}`);
    }
    if (byKey.has(definition.definitionKey)) {
      throw new TypeError(`duplicate token definitionKey ${definition.definitionKey}`);
    }
    byKey.set(definition.definitionKey, definition);
    definitionIds[definition.definitionKey] = tokenId(definition);
  }

  const tokens = definitions.map((definition) => {
    const references = definition.referenceDefinitionKeys.map((referenceKey) => {
      const referenceId = definitionIds[referenceKey];
      if (!referenceId) {
        throw new TypeError(
          `token ${definition.definitionKey} references unknown definition ${referenceKey}`,
        );
      }
      return referenceId;
    });
    const resolvedKindSource = definition.resolvedValue ?? definition.rawValue;
    return {
      id: definitionIds[definition.definitionKey]!,
      name: definition.name,
      kind: definition.kind ?? inferTokenKind(resolvedKindSource),
      rawValue: definition.rawValue,
      ...(definition.resolvedValue === undefined ? {} : { resolvedValue: definition.resolvedValue }),
      scope: {
        ...(definition.sourceNodeId ? { sourceNodeId: definition.sourceNodeId } : {}),
        ...(definition.stylesheetRef ? { stylesheetRef: definition.stylesheetRef } : {}),
        ...(definition.selector ? { selector: definition.selector } : {}),
      },
      references,
      source: { type: definition.sourceType },
      confidence: confidence(definition.confidence),
    };
  });

  const usages = input.usages
    .map((usage) => {
      const id = definitionIds[usage.definitionKey];
      if (!id) throw new TypeError(`token usage references unknown definition ${usage.definitionKey}`);
      if (!usage.sourceNodeId.trim()) throw new TypeError("token usage sourceNodeId must not be empty");
      if (!usage.property.trim()) throw new TypeError("token usage property must not be empty");
      return {
        tokenId: id,
        sourceNodeId: usage.sourceNodeId,
        property: usage.property.startsWith("--") ? usage.property : usage.property.toLowerCase(),
        authoredValue: usage.authoredValue,
        resolvedValue: usage.resolvedValue,
      };
    })
    .sort(
      (left, right) =>
        left.tokenId.localeCompare(right.tokenId) ||
        left.sourceNodeId.localeCompare(right.sourceNodeId) ||
        left.property.localeCompare(right.property) ||
        left.authoredValue.localeCompare(right.authoredValue),
    );

  return { graph: { tokens, usages }, definitionIds };
}
