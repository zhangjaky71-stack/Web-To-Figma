import type { WtfCssLength, WtfStyleRecord } from "@w2f/w2f-ir";
import type { WtfTokenGraph, WtfTokenKind } from "@w2f/w2f-schema";

export const CSS_CASCADE_ENGINE_VERSION = "1.0.0" as const;

export type CssCascadeEngineVersion = typeof CSS_CASCADE_ENGINE_VERSION;
export type CssCascadeAdapter = "standard" | "cdp";
export type CssDeclarationStatus =
  | "winner"
  | "overridden"
  | "inactive-condition"
  | "matched-unresolved";

export interface CssSpecificity {
  ids: number;
  classes: number;
  types: number;
}

export interface CssAuthoredSource {
  type: "stylesheet" | "inline" | "presentational";
  stylesheetRef?: string;
  selector?: string;
  ruleIndex?: number;
  declarationIndex?: number;
  mediaConditions?: string[];
  layer?: string;
}

export interface CssAuthoredDeclarationEvidence {
  property: string;
  authoredValue: string;
  important: boolean;
  inherited: boolean;
  status: CssDeclarationStatus;
  sourceOrder: number;
  specificity?: CssSpecificity;
  source: CssAuthoredSource;
}

export interface CssCascadePropertyTrace {
  property: string;
  computedValue: string;
  candidates: CssAuthoredDeclarationEvidence[];
  inheritedFromSourceNodeId?: string;
}

export interface CssNodeCascadeEvidence {
  sourceNodeId: string;
  traces: CssCascadePropertyTrace[];
  customProperties: Record<string, string>;
}

export interface CssCascadePayload {
  version: CssCascadeEngineVersion;
  nodes: CssNodeCascadeEvidence[];
}

export interface CssTokenDefinitionEvidence {
  definitionKey: string;
  name: string;
  rawValue: string;
  resolvedValue?: unknown;
  kind?: WtfTokenKind;
  sourceNodeId?: string;
  stylesheetRef?: string;
  selector?: string;
  sourceType: "css-custom-property" | "inline-variable" | "derived";
  referenceDefinitionKeys: string[];
  confidence: number;
}

export interface CssTokenUsageEvidence {
  definitionKey: string;
  sourceNodeId: string;
  property: string;
  authoredValue: string;
  resolvedValue: string;
}

export interface CssUnresolvedTokenUsage {
  sourceNodeId: string;
  property: string;
  tokenName: string;
  authoredValue: string;
  resolvedValue: string;
  reason: "definition-ambiguous" | "definition-unavailable";
}

export interface CssTokenGraphBuildInput {
  definitions: CssTokenDefinitionEvidence[];
  usages: CssTokenUsageEvidence[];
}

export interface CssTokenGraphBuildResult {
  graph: WtfTokenGraph;
  definitionIds: Record<string, string>;
}

export interface CssCascadeDiagnostic {
  code:
    | "CSS_STYLESHEET_INACCESSIBLE"
    | "CSS_SELECTOR_UNSUPPORTED"
    | "CSS_SOURCE_NODE_UNRESOLVED"
    | "CSS_CDP_NODE_UNAVAILABLE"
    | "CSS_CDP_MATCHED_STYLES_UNAVAILABLE"
    | "CSS_TOKEN_USAGE_UNRESOLVED";
  message: string;
  sourceNodeId?: string;
  stylesheetRef?: string;
}

export interface CssCascadeCapture {
  version: CssCascadeEngineVersion;
  adapter: CssCascadeAdapter;
  cascade: CssCascadePayload;
  styles: WtfStyleRecord[];
  tokens: WtfTokenGraph;
  unresolvedTokenUsages: CssUnresolvedTokenUsage[];
  diagnostics: CssCascadeDiagnostic[];
}

export type CssLengthModel = WtfCssLength;
export type CssStyleRecord = WtfStyleRecord;
