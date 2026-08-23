import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import {
  createCssCascadeCapture,
  extractVarReferenceNames,
  isCssCascadeCapture,
  type CssAuthoredDeclarationEvidence,
  type CssCascadeAcquisition,
  type CssCascadeCapture,
  type CssCascadeDiagnostic,
  type CssNodeCascadeEvidence,
  type CssTokenDefinitionEvidence,
  type CssTokenUsageEvidence,
  type CssUnresolvedTokenUsage,
} from "@w2f/css-cascade";
import {
  captureStandardCascadeInPage,
  type StandardCascadeFrameHint,
  type StandardCascadeInput,
  type StandardCascadeResult,
  type StandardCascadeTargetHint,
} from "@w2f/standard-capture-adapter";

const CDP_REQUIRED_PROTOCOL_VERSION = "1.3" as const;
const CDP_CASCADE_NODE_LIMIT = 2500;
const TABLE_REQUIRED_COMPUTED_PROPERTIES = [
  "border-collapse",
  "border-spacing",
  "table-layout",
  "caption-side",
] as const;

interface ChromeDebuggee {
  tabId?: number;
}

interface ChromeDebuggerApi {
  attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
  detach(target: ChromeDebuggee): Promise<void>;
  sendCommand(
    target: ChromeDebuggee,
    method: string,
    commandParams?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export interface CdpCascadeEvidenceEntry {
  sourceNodeId: string;
  matched: Record<string, unknown>;
  computed: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function debuggerApi(): ChromeDebuggerApi {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { debugger?: ChromeDebuggerApi };
  };
  const api = runtime.chrome?.debugger;
  if (!api) throw new Error("Chrome debugger API is unavailable in this extension context");
  return api;
}

async function command(
  api: ChromeDebuggerApi,
  target: ChromeDebuggee,
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return api.sendCommand(target, method, params);
}

function shadowHostForNode(node: RawNode, byId: Map<string, RawNode>): string | undefined {
  let current: RawNode | undefined = node;
  const visited = new Set<string>();
  while (current && !visited.has(current.captureNodeId)) {
    visited.add(current.captureNodeId);
    if (current.kind === "shadow-root") return current.relationships.shadowHostId;
    const parentId: string | undefined = current.relationships.sourceParentId;
    current = parentId ? byId.get(parentId) : undefined;
  }
  return undefined;
}

export function buildStandardCascadeInput(snapshot: RawSnapshot): StandardCascadeInput {
  const byId = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const frames: StandardCascadeFrameHint[] = snapshot.frames.map((frame) => {
    const root = frame.rootCaptureNodeId ? byId.get(frame.rootCaptureNodeId) : undefined;
    const ownerSourceNodeId = root?.relationships.sourceParentId;
    return {
      frameId: frame.context.frameId,
      ...(frame.context.parentFrameId ? { parentFrameId: frame.context.parentFrameId } : {}),
      ...(frame.context.url ? { url: frame.context.url } : {}),
      ...(ownerSourceNodeId ? { ownerSourceNodeId } : {}),
    };
  });
  const targets: StandardCascadeTargetHint[] = snapshot.nodes.flatMap((node) => {
    if (node.kind !== "element" && node.kind !== "pseudo") return [];
    if (node.kind === "pseudo") {
      const host = node.relationships.sourceParentId ?? node.relationships.composedParentId;
      return [
        {
          sourceNodeId: node.captureNodeId,
          frameId: node.frameContext.frameId,
          ...(node.source.pseudoType ? { pseudoType: node.source.pseudoType } : {}),
          ...(host ? { pseudoHostSourceNodeId: host } : {}),
        },
      ];
    }
    const shadowHostSourceNodeId = shadowHostForNode(node, byId);
    return [
      {
        sourceNodeId: node.captureNodeId,
        frameId: node.frameContext.frameId,
        ...(node.source.sourceSelector ? { sourceSelector: node.source.sourceSelector } : {}),
        ...(shadowHostSourceNodeId ? { shadowHostSourceNodeId } : {}),
      },
    ];
  });
  return { frames, targets };
}

async function captureStandardCascade(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<CssCascadeCapture> {
  const input = buildStandardCascadeInput(snapshot);
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureStandardCascadeInPage,
    args: [input],
  });
  const result = injectionResults[0]?.result as StandardCascadeResult | undefined;
  if (!result?.acquisition || result.acquisition.adapter !== "standard") {
    throw new Error("Standard authored CSS acquisition returned invalid evidence");
  }
  const capture = createCssCascadeCapture(result.acquisition);
  if (!isCssCascadeCapture(capture)) throw new Error("Standard CSS sidecar validation failed");
  return capture;
}

function styleProperties(style: unknown): Array<Record<string, unknown>> {
  if (!isRecord(style) || !Array.isArray(style.cssProperties)) return [];
  return style.cssProperties.filter(isRecord);
}

function computedMap(response: Record<string, unknown>): Map<string, string> {
  const result = new Map<string, string>();
  if (!Array.isArray(response.computedStyle)) return result;
  for (const item of response.computedStyle) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.value !== "string")
      continue;
    result.set(item.name.startsWith("--") ? item.name : item.name.toLowerCase(), item.value);
  }
  return result;
}

function mediaEvidence(rule: Record<string, unknown>): { conditions: string[]; active: boolean } {
  if (!Array.isArray(rule.media)) return { conditions: [], active: true };
  const conditions: string[] = [];
  let active = true;
  for (const item of rule.media) {
    if (!isRecord(item)) continue;
    if (typeof item.text === "string" && item.text.trim()) conditions.push(item.text.trim());
    if (item.active === false) active = false;
  }
  return { conditions, active };
}

function layerName(rule: Record<string, unknown>): string | undefined {
  if (!Array.isArray(rule.layers) || rule.layers.length === 0) return undefined;
  const last = rule.layers.at(-1);
  return isRecord(last) && typeof last.text === "string"
    ? last.text
    : isRecord(last) && typeof last.name === "string"
      ? last.name
      : undefined;
}

export function normalizeCdpMatchedStyleAcquisition(
  entries: CdpCascadeEvidenceEntry[],
  diagnostics: CssCascadeDiagnostic[] = [],
): CssCascadeAcquisition {
  const nodes: CssNodeCascadeEvidence[] = [];
  const provisionalDefinitions = new Map<
    string,
    CssTokenDefinitionEvidence & { referenceNames: string[] }
  >();
  const usageDrafts: Array<{
    sourceNodeId: string;
    property: string;
    authoredValue: string;
    resolvedValue: string;
    tokenNames: string[];
  }> = [];
  let sourceOrder = 0;
  let ruleIndex = 0;

  for (const entry of entries) {
    const computed = computedMap(entry.computed);
    const candidates = new Map<string, CssAuthoredDeclarationEvidence[]>();
    const addCandidate = (candidate: CssAuthoredDeclarationEvidence) => {
      const property = candidate.property.startsWith("--")
        ? candidate.property
        : candidate.property.toLowerCase();
      const list = candidates.get(property) ?? [];
      list.push({ ...candidate, property });
      candidates.set(property, list);
      if (property.startsWith("--")) {
        const key = [
          candidate.source.type,
          candidate.source.type === "inline" ? entry.sourceNodeId : "",
          candidate.source.stylesheetRef ?? "",
          candidate.source.selector ?? "",
          candidate.source.ruleIndex ?? -1,
          candidate.source.declarationIndex ?? -1,
          property,
        ].join("\u001f");
        if (!provisionalDefinitions.has(key)) {
          provisionalDefinitions.set(key, {
            definitionKey: key,
            name: property,
            rawValue: candidate.authoredValue,
            ...(candidate.source.type === "inline"
              ? { sourceNodeId: entry.sourceNodeId, resolvedValue: computed.get(property) ?? "" }
              : {}),
            ...(candidate.source.stylesheetRef
              ? { stylesheetRef: candidate.source.stylesheetRef }
              : {}),
            ...(candidate.source.selector ? { selector: candidate.source.selector } : {}),
            sourceType:
              candidate.source.type === "inline" ? "inline-variable" : "css-custom-property",
            referenceDefinitionKeys: [],
            confidence: candidate.status === "inactive-condition" ? 0.8 : 0.98,
            referenceNames: extractVarReferenceNames(candidate.authoredValue),
          });
        }
      } else if (candidate.status !== "inactive-condition") {
        const tokenNames = extractVarReferenceNames(candidate.authoredValue);
        if (tokenNames.length) {
          usageDrafts.push({
            sourceNodeId: entry.sourceNodeId,
            property,
            authoredValue: candidate.authoredValue,
            resolvedValue: computed.get(property) ?? "",
            tokenNames,
          });
        }
      }
    };

    const addStyle = (
      style: unknown,
      inherited: boolean,
      source: CssAuthoredDeclarationEvidence["source"],
      active = true,
    ) => {
      for (const [declarationIndex, property] of styleProperties(style).entries()) {
        if (
          property.disabled === true ||
          property.parsedOk === false ||
          typeof property.name !== "string" ||
          typeof property.value !== "string"
        ) {
          continue;
        }
        addCandidate({
          property: property.name,
          authoredValue: property.value,
          important: property.important === true,
          inherited,
          status: active ? "matched-unresolved" : "inactive-condition",
          sourceOrder,
          source: {
            ...source,
            declarationIndex,
          },
        });
        sourceOrder += 1;
      }
    };

    const addRuleMatches = (matches: unknown, inherited: boolean) => {
      if (!Array.isArray(matches)) return;
      for (const match of matches) {
        if (!isRecord(match) || !isRecord(match.rule)) continue;
        const rule = match.rule;
        const selectorList = isRecord(rule.selectorList) ? rule.selectorList : undefined;
        const selector =
          selectorList && typeof selectorList.text === "string" ? selectorList.text : undefined;
        const style = rule.style;
        const ref =
          isRecord(style) && typeof style.styleSheetId === "string"
            ? style.styleSheetId
            : undefined;
        const media = mediaEvidence(rule);
        const layer = layerName(rule);
        addStyle(
          style,
          inherited,
          {
            type: "stylesheet",
            ...(ref ? { stylesheetRef: `cdp:${ref}` } : {}),
            ...(selector ? { selector } : {}),
            ruleIndex,
            ...(media.conditions.length ? { mediaConditions: media.conditions } : {}),
            ...(layer ? { layer } : {}),
          },
          media.active,
        );
        ruleIndex += 1;
      }
    };

    addRuleMatches(entry.matched.matchedCSSRules, false);
    addStyle(entry.matched.attributesStyle, false, { type: "presentational" });
    addStyle(entry.matched.inlineStyle, false, { type: "inline" });
    if (Array.isArray(entry.matched.inherited)) {
      for (const inherited of entry.matched.inherited) {
        if (!isRecord(inherited)) continue;
        addRuleMatches(inherited.matchedCSSRules, true);
        addStyle(inherited.inlineStyle, true, { type: "inline" });
      }
    }

    for (const property of TABLE_REQUIRED_COMPUTED_PROPERTIES) {
      if (!candidates.has(property)) candidates.set(property, []);
    }

    const traces = [...candidates.entries()]
      .map(([property, values]) => ({
        property,
        computedValue: computed.get(property) ?? "",
        candidates: values,
      }))
      .sort((left, right) => left.property.localeCompare(right.property));
    const customProperties = Object.fromEntries(
      traces
        .filter((trace) => trace.property.startsWith("--"))
        .map((trace) => [trace.property, trace.computedValue] as const),
    );
    if (traces.length || Object.keys(customProperties).length) {
      nodes.push({ sourceNodeId: entry.sourceNodeId, traces, customProperties });
    }
  }

  const definitionsByName = new Map<
    string,
    Array<CssTokenDefinitionEvidence & { referenceNames: string[] }>
  >();
  for (const definition of provisionalDefinitions.values()) {
    const list = definitionsByName.get(definition.name) ?? [];
    list.push(definition);
    definitionsByName.set(definition.name, list);
  }
  const tokenDefinitions: CssTokenDefinitionEvidence[] = [...provisionalDefinitions.values()].map(
    ({ referenceNames, ...definition }) => ({
      ...definition,
      referenceDefinitionKeys: referenceNames.flatMap((name) => {
        const matches = definitionsByName.get(name) ?? [];
        return matches.length === 1 ? [matches[0]!.definitionKey] : [];
      }),
    }),
  );
  const tokenUsages: CssTokenUsageEvidence[] = [];
  const unresolvedTokenUsages: CssUnresolvedTokenUsage[] = [];
  const usageKeys = new Set<string>();
  for (const draft of usageDrafts) {
    for (const tokenName of draft.tokenNames) {
      const definitions = definitionsByName.get(tokenName) ?? [];
      const usageKey = `${draft.sourceNodeId}\u001f${draft.property}\u001f${draft.authoredValue}\u001f${tokenName}`;
      if (usageKeys.has(usageKey)) continue;
      usageKeys.add(usageKey);
      if (definitions.length === 1) {
        tokenUsages.push({
          definitionKey: definitions[0]!.definitionKey,
          sourceNodeId: draft.sourceNodeId,
          property: draft.property,
          authoredValue: draft.authoredValue,
          resolvedValue: draft.resolvedValue,
        });
      } else {
        const reason = definitions.length === 0 ? "definition-unavailable" : "definition-ambiguous";
        unresolvedTokenUsages.push({
          sourceNodeId: draft.sourceNodeId,
          property: draft.property,
          tokenName,
          authoredValue: draft.authoredValue,
          resolvedValue: draft.resolvedValue,
          reason,
        });
        diagnostics.push({
          code: "CSS_TOKEN_USAGE_UNRESOLVED",
          message: `CDP token usage ${tokenName} was preserved without a fabricated definition link (${reason}).`,
          sourceNodeId: draft.sourceNodeId,
        });
      }
    }
  }

  return {
    adapter: "cdp",
    nodes,
    tokenDefinitions,
    tokenUsages,
    unresolvedTokenUsages,
    diagnostics,
  };
}

async function captureCdpCascade(tabId: number, snapshot: RawSnapshot): Promise<CssCascadeCapture> {
  const capability = chrome.runtime.getManifest().permissions?.includes("debugger") === true;
  if (!capability) throw new Error("High Fidelity debugger permission is unavailable");
  const candidates = snapshot.nodes.filter(
    (node) =>
      (node.kind === "element" || node.kind === "pseudo") &&
      typeof node.source.backendNodeId === "number" &&
      Number.isFinite(node.source.backendNodeId),
  );
  const selected = candidates.slice(0, CDP_CASCADE_NODE_LIMIT);
  const diagnostics: CssCascadeDiagnostic[] = [];
  if (candidates.length > selected.length) {
    diagnostics.push({
      code: "CSS_CAPTURE_BUDGET_EXCEEDED",
      message: `CDP authored CSS acquisition was capped at ${CDP_CASCADE_NODE_LIMIT} source nodes out of ${candidates.length}.`,
    });
  }
  const api = debuggerApi();
  const target = { tabId };
  let attached = false;
  try {
    await api.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
    attached = true;
    await Promise.all([command(api, target, "DOM.enable"), command(api, target, "CSS.enable")]);
    const backendNodeIds = selected.map((node) => node.source.backendNodeId as number);
    const pushed = await command(api, target, "DOM.pushNodesByBackendIdsToFrontend", {
      backendNodeIds,
    });
    const nodeIds = Array.isArray(pushed.nodeIds) ? pushed.nodeIds : [];
    const entries: CdpCascadeEvidenceEntry[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const sourceNode = selected[index]!;
      const frontendNodeId = nodeIds[index];
      if (typeof frontendNodeId !== "number" || frontendNodeId <= 0) {
        diagnostics.push({
          code: "CSS_CDP_NODE_UNAVAILABLE",
          message:
            "CDP could not materialize the captured backend node for authored CSS inspection.",
          sourceNodeId: sourceNode.captureNodeId,
        });
        continue;
      }
      try {
        const [matched, computed] = await Promise.all([
          command(api, target, "CSS.getMatchedStylesForNode", { nodeId: frontendNodeId }),
          command(api, target, "CSS.getComputedStyleForNode", { nodeId: frontendNodeId }),
        ]);
        entries.push({ sourceNodeId: sourceNode.captureNodeId, matched, computed });
      } catch (error) {
        diagnostics.push({
          code: "CSS_CDP_MATCHED_STYLES_UNAVAILABLE",
          message: `CDP matched-style inspection failed: ${error instanceof Error ? error.message : String(error)}`,
          sourceNodeId: sourceNode.captureNodeId,
        });
      }
    }
    const acquisition = normalizeCdpMatchedStyleAcquisition(entries, diagnostics);
    const capture = createCssCascadeCapture(acquisition);
    if (!isCssCascadeCapture(capture)) throw new Error("CDP CSS sidecar validation failed");
    return capture;
  } finally {
    if (attached) await api.detach(target).catch(() => undefined);
  }
}

export async function captureCssCascadeForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<CssCascadeCapture> {
  if (snapshot.adapter === "cdp") {
    try {
      return await captureCdpCascade(tabId, snapshot);
    } catch {
      return captureStandardCascade(tabId, snapshot);
    }
  }
  return captureStandardCascade(tabId, snapshot);
}
