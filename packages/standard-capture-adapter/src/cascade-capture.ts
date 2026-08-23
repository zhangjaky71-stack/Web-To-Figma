import type {
  CssAuthoredDeclarationEvidence,
  CssCascadeAcquisition,
  CssCascadeDiagnostic,
  CssNodeCascadeEvidence,
  CssTokenDefinitionEvidence,
  CssTokenUsageEvidence,
  CssUnresolvedTokenUsage,
} from "@w2f/css-cascade";
import type {
  StandardCascadeInput,
  StandardCascadeResult,
  StandardCascadeTargetHint,
} from "./types.js";

export function captureStandardCascadeInPage(input: StandardCascadeInput): StandardCascadeResult {
  type Root = Document | ShadowRoot;
  type ResolvedTarget = {
    hint: StandardCascadeTargetHint;
    element: Element;
    pseudoType?: string;
  };
  type LocalDeclaration = {
    property: string;
    value: string;
    important: boolean;
    declarationIndex: number;
    sourceOrder: number;
  };
  type LocalRule = {
    selectorText: string;
    declarations: LocalDeclaration[];
    stylesheetRef: string;
    ruleIndex: number;
    mediaConditions: string[];
    active: boolean;
    layer?: string;
  };
  type ProvisionalDefinition = CssTokenDefinitionEvidence & { referenceNames: string[] };

  const maxRules = Math.max(1, Math.min(input.maxRules ?? 20_000, 100_000));
  const maxDeclarations = Math.max(1, Math.min(input.maxDeclarations ?? 200_000, 500_000));
  const diagnostics: CssCascadeDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const frameDocuments = new Map<string, Document>();
  const resolvedTargets = new Map<string, ResolvedTarget>();
  const rulesByRoot = new Map<Root, LocalRule[]>();
  const rootSheetRefs = new WeakMap<CSSStyleSheet, string>();
  const provisionalDefinitions = new Map<string, ProvisionalDefinition>();
  const tokenUsageDrafts: Array<{
    sourceNodeId: string;
    property: string;
    authoredValue: string;
    resolvedValue: string;
    tokenNames: string[];
  }> = [];
  let sheetSequence = 0;
  let ruleSequence = 0;
  let sourceOrder = 0;
  let scannedRules = 0;
  let scannedDeclarations = 0;
  let budgetReported = false;

  function diagnostic(value: CssCascadeDiagnostic): void {
    const key = `${value.code}\u001f${value.sourceNodeId ?? ""}\u001f${value.stylesheetRef ?? ""}\u001f${value.message}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(value);
  }

  function reportBudget(): void {
    if (budgetReported) return;
    budgetReported = true;
    diagnostic({
      code: "CSS_CAPTURE_BUDGET_EXCEEDED",
      message: `Standard authored CSS acquisition reached its configured budget (${maxRules} rules / ${maxDeclarations} declarations).`,
    });
  }

  function splitSelectorList(selectorText: string): string[] {
    const result: string[] = [];
    let start = 0;
    let round = 0;
    let square = 0;
    let quote = "";
    for (let index = 0; index < selectorText.length; index += 1) {
      const char = selectorText[index]!;
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === "(") round += 1;
      else if (char === ")") round = Math.max(0, round - 1);
      else if (char === "[") square += 1;
      else if (char === "]") square = Math.max(0, square - 1);
      else if (char === "," && round === 0 && square === 0) {
        const selector = selectorText.slice(start, index).trim();
        if (selector) result.push(selector);
        start = index + 1;
      }
    }
    const tail = selectorText.slice(start).trim();
    if (tail) result.push(tail);
    return result;
  }

  function extractVarNames(value: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const pattern = /var\(\s*(--[A-Za-z0-9_-]+)/g;
    for (const match of value.matchAll(pattern)) {
      const name = match[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  function stylesheetRef(sheet: CSSStyleSheet): string {
    const existing = rootSheetRefs.get(sheet);
    if (existing) return existing;
    const ref = sheet.href || `inline-stylesheet:${sheetSequence}`;
    sheetSequence += 1;
    rootSheetRefs.set(sheet, ref);
    return ref;
  }

  function sheetsForRoot(root: Root): CSSStyleSheet[] {
    const result: CSSStyleSheet[] = [];
    const seen = new Set<CSSStyleSheet>();
    const push = (sheet: CSSStyleSheet | null | undefined) => {
      if (!sheet || seen.has(sheet)) return;
      seen.add(sheet);
      result.push(sheet);
    };
    if (root instanceof Document) {
      for (const sheet of [...root.styleSheets]) push(sheet as CSSStyleSheet);
      for (const sheet of root.adoptedStyleSheets) push(sheet);
    } else {
      for (const style of [...root.querySelectorAll("style")]) push(style.sheet);
      for (const sheet of root.adoptedStyleSheets) push(sheet);
    }
    return result;
  }

  function collectRuleList(
    list: CSSRuleList,
    ref: string,
    mediaConditions: string[],
    active: boolean,
    layer: string | undefined,
    output: LocalRule[],
    view: Window,
  ): void {
    for (const rule of [...list]) {
      if (scannedRules >= maxRules || scannedDeclarations >= maxDeclarations) {
        reportBudget();
        return;
      }
      scannedRules += 1;
      if (rule instanceof CSSStyleRule) {
        const declarations: LocalDeclaration[] = [];
        for (let index = 0; index < rule.style.length; index += 1) {
          if (scannedDeclarations >= maxDeclarations) {
            reportBudget();
            break;
          }
          const property = rule.style.item(index);
          if (!property) continue;
          const value = rule.style.getPropertyValue(property);
          declarations.push({
            property,
            value,
            important: rule.style.getPropertyPriority(property) === "important",
            declarationIndex: index,
            sourceOrder,
          });
          sourceOrder += 1;
          scannedDeclarations += 1;
        }
        output.push({
          selectorText: rule.selectorText,
          declarations,
          stylesheetRef: ref,
          ruleIndex: ruleSequence,
          mediaConditions,
          active,
          ...(layer ? { layer } : {}),
        });
        ruleSequence += 1;
        continue;
      }
      if (rule instanceof CSSMediaRule) {
        const condition = rule.conditionText.trim();
        collectRuleList(
          rule.cssRules,
          ref,
          condition ? [...mediaConditions, condition] : mediaConditions,
          active && view.matchMedia(rule.conditionText).matches,
          layer,
          output,
          view,
        );
        continue;
      }
      const group = rule as CSSRule & {
        cssRules?: CSSRuleList;
        conditionText?: string;
        name?: string;
      };
      if (!group.cssRules) continue;
      let nestedActive = active;
      if (rule.constructor.name === "CSSSupportsRule" && group.conditionText) {
        try {
          nestedActive = active && CSS.supports(group.conditionText);
        } catch {
          nestedActive = false;
        }
      }
      const nestedLayer =
        rule.constructor.name === "CSSLayerBlockRule" && group.name ? group.name : layer;
      collectRuleList(
        group.cssRules,
        ref,
        mediaConditions,
        nestedActive,
        nestedLayer,
        output,
        view,
      );
    }
  }

  function rulesForRoot(root: Root): LocalRule[] {
    const cached = rulesByRoot.get(root);
    if (cached) return cached;
    const output: LocalRule[] = [];
    const view = root instanceof Document ? root.defaultView : root.ownerDocument.defaultView;
    if (!view) return output;
    for (const sheet of sheetsForRoot(root)) {
      const ref = stylesheetRef(sheet);
      try {
        collectRuleList(sheet.cssRules, ref, [], true, undefined, output, view);
      } catch {
        diagnostic({
          code: "CSS_STYLESHEET_INACCESSIBLE",
          message: "Stylesheet rules are not readable from the Standard CSSOM boundary.",
          stylesheetRef: ref,
        });
      }
    }
    rulesByRoot.set(root, output);
    return output;
  }

  function rootFrameId(): string | undefined {
    return input.frames.find((frame) => !frame.parentFrameId)?.frameId ?? input.frames[0]?.frameId;
  }

  const mainFrameId = rootFrameId();
  if (mainFrameId) frameDocuments.set(mainFrameId, document);

  const targetHints = new Map(input.targets.map((target) => [target.sourceNodeId, target]));

  function resolveElement(sourceNodeId: string): Element | undefined {
    const existing = resolvedTargets.get(sourceNodeId)?.element;
    if (existing) return existing;
    const hint = targetHints.get(sourceNodeId);
    if (!hint || hint.pseudoType) return undefined;
    const frameDocument = frameDocuments.get(hint.frameId);
    if (!frameDocument) return undefined;
    let root: Root = frameDocument;
    if (hint.shadowHostSourceNodeId) {
      const host = resolveElement(hint.shadowHostSourceNodeId);
      if (!host?.shadowRoot) return undefined;
      root = host.shadowRoot;
    }
    if (!hint.sourceSelector) return undefined;
    try {
      const element = root.querySelector(hint.sourceSelector);
      if (!element) return undefined;
      resolvedTargets.set(sourceNodeId, { hint, element });
      return element;
    } catch {
      diagnostic({
        code: "CSS_SELECTOR_UNSUPPORTED",
        message: `Source selector could not be resolved: ${hint.sourceSelector}`,
        sourceNodeId,
      });
      return undefined;
    }
  }

  let madeFrameProgress = true;
  while (madeFrameProgress) {
    madeFrameProgress = false;
    for (const frame of input.frames) {
      if (frameDocuments.has(frame.frameId) || !frame.parentFrameId || !frame.ownerSourceNodeId)
        continue;
      if (!frameDocuments.has(frame.parentFrameId)) continue;
      const owner = resolveElement(frame.ownerSourceNodeId);
      if (!(owner instanceof HTMLIFrameElement) || !owner.contentDocument) continue;
      frameDocuments.set(frame.frameId, owner.contentDocument);
      madeFrameProgress = true;
    }
  }

  function resolveTarget(hint: StandardCascadeTargetHint): ResolvedTarget | undefined {
    const existing = resolvedTargets.get(hint.sourceNodeId);
    if (existing) return existing;
    if (hint.pseudoType) {
      const hostId = hint.pseudoHostSourceNodeId;
      if (!hostId) return undefined;
      const element = resolveElement(hostId);
      if (!element) return undefined;
      const resolved = { hint, element, pseudoType: hint.pseudoType };
      resolvedTargets.set(hint.sourceNodeId, resolved);
      return resolved;
    }
    const element = resolveElement(hint.sourceNodeId);
    return element ? resolvedTargets.get(hint.sourceNodeId) : undefined;
  }

  function selectorMatches(target: ResolvedTarget, selectorText: string, ref: string): boolean {
    const selectors = splitSelectorList(selectorText);
    const pseudoMarker = target.pseudoType ? `::${target.pseudoType}` : undefined;
    const applicable = selectors
      .filter((selector) =>
        pseudoMarker ? selector.includes(pseudoMarker) : !selector.includes("::"),
      )
      .map((selector) => (pseudoMarker ? selector.replaceAll(pseudoMarker, "") : selector))
      .filter(Boolean);
    if (applicable.length === 0) return false;
    try {
      return target.element.matches(applicable.join(", "));
    } catch {
      diagnostic({
        code: "CSS_SELECTOR_UNSUPPORTED",
        message: `Matched selector could not be evaluated: ${selectorText}`,
        sourceNodeId: target.hint.sourceNodeId,
        stylesheetRef: ref,
      });
      return false;
    }
  }

  function definitionKey(
    sourceNodeId: string,
    property: string,
    source: CssAuthoredDeclarationEvidence["source"],
  ): string {
    return [
      source.type,
      source.type === "inline" ? sourceNodeId : "",
      source.stylesheetRef ?? "",
      source.selector ?? "",
      source.ruleIndex ?? -1,
      source.declarationIndex ?? -1,
      property,
    ].join("\u001f");
  }

  const nodes: CssNodeCascadeEvidence[] = [];
  for (const hint of input.targets) {
    const target = resolveTarget(hint);
    if (!target) {
      if (hint.sourceSelector || hint.pseudoType) {
        diagnostic({
          code: "CSS_SOURCE_NODE_UNRESOLVED",
          message: "Standard authored CSS acquisition could not resolve the captured source node.",
          sourceNodeId: hint.sourceNodeId,
        });
      }
      continue;
    }
    const root = target.element.getRootNode();
    if (!(root instanceof Document || root instanceof ShadowRoot)) continue;
    const view = target.element.ownerDocument.defaultView;
    if (!view) continue;
    const computed = view.getComputedStyle(
      target.element,
      target.pseudoType ? `::${target.pseudoType}` : undefined,
    );
    const candidatesByProperty = new Map<string, CssAuthoredDeclarationEvidence[]>();

    const addCandidate = (candidate: CssAuthoredDeclarationEvidence) => {
      const property = candidate.property.startsWith("--")
        ? candidate.property
        : candidate.property.toLowerCase();
      const list = candidatesByProperty.get(property) ?? [];
      list.push({ ...candidate, property });
      candidatesByProperty.set(property, list);
      if (property.startsWith("--")) {
        const key = definitionKey(hint.sourceNodeId, property, candidate.source);
        if (!provisionalDefinitions.has(key)) {
          provisionalDefinitions.set(key, {
            definitionKey: key,
            name: property,
            rawValue: candidate.authoredValue,
            ...(candidate.source.type === "inline"
              ? {
                  resolvedValue: computed.getPropertyValue(property).trim(),
                  sourceNodeId: hint.sourceNodeId,
                }
              : {}),
            ...(candidate.source.stylesheetRef
              ? { stylesheetRef: candidate.source.stylesheetRef }
              : {}),
            ...(candidate.source.selector ? { selector: candidate.source.selector } : {}),
            sourceType:
              candidate.source.type === "inline" ? "inline-variable" : "css-custom-property",
            referenceDefinitionKeys: [],
            confidence: candidate.status === "inactive-condition" ? 0.75 : 0.95,
            referenceNames: extractVarNames(candidate.authoredValue),
          });
        }
      } else {
        const tokenNames = extractVarNames(candidate.authoredValue);
        if (tokenNames.length > 0 && candidate.status !== "inactive-condition") {
          tokenUsageDrafts.push({
            sourceNodeId: hint.sourceNodeId,
            property,
            authoredValue: candidate.authoredValue,
            resolvedValue: computed.getPropertyValue(property),
            tokenNames,
          });
        }
      }
    };

    for (const rule of rulesForRoot(root)) {
      if (!selectorMatches(target, rule.selectorText, rule.stylesheetRef)) continue;
      for (const declaration of rule.declarations) {
        addCandidate({
          property: declaration.property,
          authoredValue: declaration.value,
          important: declaration.important,
          inherited: false,
          status: rule.active ? "matched-unresolved" : "inactive-condition",
          sourceOrder: declaration.sourceOrder,
          source: {
            type: "stylesheet",
            stylesheetRef: rule.stylesheetRef,
            selector: rule.selectorText,
            ruleIndex: rule.ruleIndex,
            declarationIndex: declaration.declarationIndex,
            ...(rule.mediaConditions.length ? { mediaConditions: rule.mediaConditions } : {}),
            ...(rule.layer ? { layer: rule.layer } : {}),
          },
        });
      }
    }

    if (!target.pseudoType) {
      const inlineStyle = (target.element as HTMLElement).style;
      for (let index = 0; index < inlineStyle.length; index += 1) {
        const property = inlineStyle.item(index);
        if (!property) continue;
        addCandidate({
          property,
          authoredValue: inlineStyle.getPropertyValue(property),
          important: inlineStyle.getPropertyPriority(property) === "important",
          inherited: false,
          status: "matched-unresolved",
          sourceOrder,
          source: {
            type: "inline",
            declarationIndex: index,
          },
        });
        sourceOrder += 1;
      }
    }

    const traces = [...candidatesByProperty.entries()]
      .map(([property, candidates]) => ({
        property,
        computedValue: computed.getPropertyValue(property),
        candidates,
      }))
      .sort((left, right) => left.property.localeCompare(right.property));
    const customProperties = Object.fromEntries(
      traces
        .filter((trace) => trace.property.startsWith("--"))
        .map((trace) => [trace.property, trace.computedValue] as const),
    );
    if (traces.length > 0 || Object.keys(customProperties).length > 0) {
      nodes.push({ sourceNodeId: hint.sourceNodeId, traces, customProperties });
    }
  }

  const definitionsByName = new Map<string, ProvisionalDefinition[]>();
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
  for (const draft of tokenUsageDrafts) {
    for (const tokenName of draft.tokenNames) {
      const definitions = definitionsByName.get(tokenName) ?? [];
      const key = `${draft.sourceNodeId}\u001f${draft.property}\u001f${draft.authoredValue}\u001f${tokenName}`;
      if (usageKeys.has(key)) continue;
      usageKeys.add(key);
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
        diagnostic({
          code: "CSS_TOKEN_USAGE_UNRESOLVED",
          message: `Token usage ${tokenName} was preserved without a fabricated definition link (${reason}).`,
          sourceNodeId: draft.sourceNodeId,
        });
      }
    }
  }

  const acquisition: CssCascadeAcquisition = {
    adapter: "standard",
    nodes,
    tokenDefinitions,
    tokenUsages,
    unresolvedTokenUsages,
    diagnostics,
  };
  return { acquisition };
}
