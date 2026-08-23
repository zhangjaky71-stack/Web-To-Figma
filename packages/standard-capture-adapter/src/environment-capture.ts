import type {
  ContainerDefinitionEvidence,
  ContainerQueryEvidence,
  EnvironmentCaptureDiagnostic,
  MediaRuleEvidence,
  RuntimeEnvironmentEvidence,
} from "@w2f/environment-capture";
import type {
  StandardCascadeTargetHint,
  StandardEnvironmentInput,
  StandardEnvironmentResult,
} from "./types.js";

export function captureStandardEnvironmentInPage(
  input: StandardEnvironmentInput,
): StandardEnvironmentResult {
  type Root = Document | ShadowRoot;
  type ResolvedTarget = {
    hint: StandardCascadeTargetHint;
    element: Element;
    pseudoType?: string;
  };
  type RuleContext = {
    id: string;
    stylesheetRef: string;
    ruleIndex: number;
  };
  type MediaContext = RuleContext & { query: string; active: boolean };
  type ContainerContext = RuleContext & { condition: string; containerName?: string };
  type MutableMedia = MediaRuleEvidence & {
    properties: Set<string>;
    sourceNodeIds: Set<string>;
  };
  type MutableContainerQuery = ContainerQueryEvidence & {
    properties: Set<string>;
    sourceNodeIds: Set<string>;
  };

  const maxRules = Math.max(1, Math.min(input.maxRules ?? 20_000, 100_000));
  const maxDeclarations = Math.max(1, Math.min(input.maxDeclarations ?? 200_000, 500_000));
  const diagnostics: EnvironmentCaptureDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const frameDocuments = new Map<string, Document>();
  const resolvedTargets = new Map<string, ResolvedTarget>();
  const targetsByRoot = new Map<Root, ResolvedTarget[]>();
  const stylesheetRefs = new WeakMap<CSSStyleSheet, string>();
  const mediaEvidence = new Map<string, MutableMedia>();
  const containerQueryEvidence = new Map<string, MutableContainerQuery>();
  const containers = new Map<string, ContainerDefinitionEvidence>();
  let sheetSequence = 0;
  let ruleSequence = 0;
  let scannedRules = 0;
  let scannedDeclarations = 0;
  let budgetReported = false;

  function diagnostic(value: EnvironmentCaptureDiagnostic): void {
    const key = `${value.code}\u001f${value.sourceNodeId ?? ""}\u001f${value.stylesheetRef ?? ""}\u001f${value.message}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(value);
  }

  function reportBudget(): void {
    if (budgetReported) return;
    budgetReported = true;
    diagnostic({
      code: "ENV_CAPTURE_BUDGET_EXCEEDED",
      message: `Environment CSS acquisition reached its configured budget (${maxRules} rules / ${maxDeclarations} declarations).`,
    });
  }

  function stylesheetRef(sheet: CSSStyleSheet): string {
    const existing = stylesheetRefs.get(sheet);
    if (existing) return existing;
    const ref = sheet.href || `inline-stylesheet:${sheetSequence}`;
    sheetSequence += 1;
    stylesheetRefs.set(sheet, ref);
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

  function rootFrameId(): string | undefined {
    return input.frames.find((frame) => !frame.parentFrameId)?.frameId ?? input.frames[0]?.frameId;
  }

  const mainFrameId = rootFrameId();
  if (mainFrameId) frameDocuments.set(mainFrameId, document);
  const hintsById = new Map(input.targets.map((target) => [target.sourceNodeId, target]));

  function resolveElement(sourceNodeId: string): Element | undefined {
    const existing = resolvedTargets.get(sourceNodeId)?.element;
    if (existing) return existing;
    const hint = hintsById.get(sourceNodeId);
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
      const resolved = { hint, element };
      resolvedTargets.set(sourceNodeId, resolved);
      return element;
    } catch {
      diagnostic({
        code: "ENV_SELECTOR_UNSUPPORTED",
        message: `Source selector could not be resolved: ${hint.sourceSelector}`,
        sourceNodeId,
      });
      return undefined;
    }
  }

  let frameProgress = true;
  while (frameProgress) {
    frameProgress = false;
    for (const frame of input.frames) {
      if (frameDocuments.has(frame.frameId) || !frame.parentFrameId || !frame.ownerSourceNodeId)
        continue;
      if (!frameDocuments.has(frame.parentFrameId)) continue;
      const owner = resolveElement(frame.ownerSourceNodeId);
      if (!(owner instanceof HTMLIFrameElement) || !owner.contentDocument) continue;
      frameDocuments.set(frame.frameId, owner.contentDocument);
      frameProgress = true;
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

  for (const hint of input.targets) {
    const target = resolveTarget(hint);
    if (!target) {
      if (hint.sourceSelector || hint.pseudoType) {
        diagnostic({
          code: "ENV_SOURCE_NODE_UNRESOLVED",
          message: "Environment acquisition could not resolve the captured source node.",
          sourceNodeId: hint.sourceNodeId,
        });
      }
      continue;
    }
    const root = target.element.getRootNode();
    if (!(root instanceof Document || root instanceof ShadowRoot)) continue;
    const list = targetsByRoot.get(root) ?? [];
    list.push(target);
    targetsByRoot.set(root, list);

    if (!target.pseudoType) {
      const view = target.element.ownerDocument.defaultView;
      if (view) {
        const computed = view.getComputedStyle(target.element);
        const containerName = computed.getPropertyValue("container-name").trim();
        const containerType = computed.getPropertyValue("container-type").trim();
        if (
          (containerName && containerName !== "none") ||
          (containerType && containerType !== "normal")
        ) {
          containers.set(hint.sourceNodeId, {
            sourceNodeId: hint.sourceNodeId,
            ...(containerName && containerName !== "none" ? { containerName } : {}),
            ...(containerType && containerType !== "normal" ? { containerType } : {}),
          });
        }
      }
    }
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
      if (char === '"' || char === "'") quote = char;
      else if (char === "(") round += 1;
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

  function selectorMatches(target: ResolvedTarget, selectorText: string, ref: string): boolean {
    const selectors = splitSelectorList(selectorText);
    const pseudoMarker = target.pseudoType ? `::${target.pseudoType}` : undefined;
    const applicable = selectors
      .filter((selector) =>
        pseudoMarker ? selector.includes(pseudoMarker) : !selector.includes("::"),
      )
      .map((selector) => (pseudoMarker ? selector.replaceAll(pseudoMarker, "") : selector))
      .filter(Boolean);
    if (!applicable.length) return false;
    try {
      return target.element.matches(applicable.join(", "));
    } catch {
      diagnostic({
        code: "ENV_SELECTOR_UNSUPPORTED",
        message: `Environment selector could not be evaluated: ${selectorText}`,
        sourceNodeId: target.hint.sourceNodeId,
        stylesheetRef: ref,
      });
      return false;
    }
  }

  function ensureMedia(context: MediaContext): MutableMedia {
    const existing = mediaEvidence.get(context.id);
    if (existing) return existing;
    const value: MutableMedia = {
      id: context.id,
      query: context.query,
      active: context.active,
      activeInSnapshotIds: context.active ? [input.snapshotId] : [],
      affectedProperties: [],
      affectedSourceNodeIds: [],
      stylesheetRef: context.stylesheetRef,
      ruleIndex: context.ruleIndex,
      properties: new Set<string>(),
      sourceNodeIds: new Set<string>(),
    };
    mediaEvidence.set(context.id, value);
    return value;
  }

  function ensureContainerQuery(context: ContainerContext): MutableContainerQuery {
    const existing = containerQueryEvidence.get(context.id);
    if (existing) return existing;
    const value: MutableContainerQuery = {
      id: context.id,
      ...(context.containerName ? { containerName: context.containerName } : {}),
      condition: context.condition,
      affectedProperties: [],
      affectedSourceNodeIds: [],
      stylesheetRef: context.stylesheetRef,
      ruleIndex: context.ruleIndex,
      properties: new Set<string>(),
      sourceNodeIds: new Set<string>(),
    };
    containerQueryEvidence.set(context.id, value);
    return value;
  }

  function containerContext(
    rule: CSSRule,
    ref: string,
    index: number,
  ): ContainerContext | undefined {
    if (rule.constructor.name !== "CSSContainerRule") return undefined;
    const record = rule as CSSRule & {
      conditionText?: string;
      containerName?: string;
      containerQuery?: string;
    };
    const condition = (record.conditionText ?? record.containerQuery ?? "").trim();
    if (!condition) return undefined;
    const name = record.containerName?.trim();
    return {
      id: `container-rule:${ref}:${index}`,
      stylesheetRef: ref,
      ruleIndex: index,
      condition,
      ...(name && name !== "none" ? { containerName: name } : {}),
    };
  }

  function walkRules(
    list: CSSRuleList,
    ref: string,
    root: Root,
    mediaStack: MediaContext[],
    containerStack: ContainerContext[],
  ): void {
    const view = root instanceof Document ? root.defaultView : root.ownerDocument.defaultView;
    if (!view) return;
    for (const rule of [...list]) {
      if (scannedRules >= maxRules || scannedDeclarations >= maxDeclarations) {
        reportBudget();
        return;
      }
      const currentIndex = ruleSequence;
      ruleSequence += 1;
      scannedRules += 1;

      if (rule instanceof CSSStyleRule) {
        const properties: string[] = [];
        for (let index = 0; index < rule.style.length; index += 1) {
          if (scannedDeclarations >= maxDeclarations) {
            reportBudget();
            break;
          }
          const property = rule.style.item(index);
          if (property)
            properties.push(property.startsWith("--") ? property : property.toLowerCase());
          scannedDeclarations += 1;
        }
        if (!properties.length || (!mediaStack.length && !containerStack.length)) continue;
        for (const target of targetsByRoot.get(root) ?? []) {
          if (!selectorMatches(target, rule.selectorText, ref)) continue;
          for (const media of mediaStack) {
            const evidence = ensureMedia(media);
            for (const property of properties) evidence.properties.add(property);
            evidence.sourceNodeIds.add(target.hint.sourceNodeId);
          }
          for (const container of containerStack) {
            const evidence = ensureContainerQuery(container);
            for (const property of properties) evidence.properties.add(property);
            evidence.sourceNodeIds.add(target.hint.sourceNodeId);
          }
        }
        continue;
      }

      if (rule instanceof CSSMediaRule) {
        const query = rule.conditionText.trim();
        const context: MediaContext = {
          id: `media-rule:${ref}:${currentIndex}`,
          stylesheetRef: ref,
          ruleIndex: currentIndex,
          query,
          active: view.matchMedia(rule.conditionText).matches,
        };
        ensureMedia(context);
        walkRules(rule.cssRules, ref, root, [...mediaStack, context], containerStack);
        continue;
      }

      const container = containerContext(rule, ref, currentIndex);
      const group = rule as CSSRule & { cssRules?: CSSRuleList; conditionText?: string };
      if (!group.cssRules) continue;
      if (container) {
        ensureContainerQuery(container);
        walkRules(group.cssRules, ref, root, mediaStack, [...containerStack, container]);
        continue;
      }
      walkRules(group.cssRules, ref, root, mediaStack, containerStack);
    }
  }

  for (const root of targetsByRoot.keys()) {
    for (const sheet of sheetsForRoot(root)) {
      const ref = stylesheetRef(sheet);
      try {
        walkRules(sheet.cssRules, ref, root, [], []);
      } catch {
        diagnostic({
          code: "ENV_STYLESHEET_INACCESSIBLE",
          message: "Stylesheet rules are not readable from the Standard CSSOM boundary.",
          stylesheetRef: ref,
        });
      }
    }
  }

  function browserIdentity(): { name: string; version: string } {
    const ua = navigator.userAgent;
    const candidates: Array<[string, RegExp]> = [
      ["Edge", /Edg\/([\d.]+)/],
      ["Chrome", /Chrome\/([\d.]+)/],
      ["Firefox", /Firefox\/([\d.]+)/],
      ["Safari", /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of candidates) {
      const match = pattern.exec(ua);
      if (match?.[1]) return { name, version: match[1] };
    }
    return { name: "Unknown", version: "unknown" };
  }

  const identity = browserIdentity();
  const navigatorWithData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const direction = getComputedStyle(document.documentElement).direction === "rtl" ? "rtl" : "ltr";
  const environment: RuntimeEnvironmentEvidence = {
    browserName: identity.name,
    browserVersion: identity.version,
    platform: navigatorWithData.userAgentData?.platform || navigator.platform || "unknown",
    language: navigator.language || "und",
    direction,
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    ...(input.scale.pageZoom === undefined ? {} : { pageZoom: input.scale.pageZoom }),
    pageZoomAvailability: input.scale.pageZoomAvailability,
    ...(input.scale.visualViewportScale === undefined
      ? {}
      : { visualViewportScale: input.scale.visualViewportScale }),
    ...(input.scale.cssZoom === undefined ? {} : { cssZoom: input.scale.cssZoom }),
    cssZoomAvailability: input.scale.cssZoomAvailability,
  };

  if (environment.pageZoomAvailability !== "observed") {
    diagnostic({
      code: "ENV_PAGE_ZOOM_UNAVAILABLE",
      message:
        "Browser page zoom could not be separated from other scale factors for this capture profile.",
    });
  }

  const mediaRules: MediaRuleEvidence[] = [...mediaEvidence.values()].map((value) => ({
    id: value.id,
    query: value.query,
    active: value.active,
    activeInSnapshotIds: value.active ? [input.snapshotId] : [],
    affectedProperties: [...value.properties],
    affectedSourceNodeIds: [...value.sourceNodeIds],
    ...(value.stylesheetRef ? { stylesheetRef: value.stylesheetRef } : {}),
    ...(value.ruleIndex === undefined ? {} : { ruleIndex: value.ruleIndex }),
  }));
  const containerQueries: ContainerQueryEvidence[] = [...containerQueryEvidence.values()].map(
    (value) => ({
      id: value.id,
      ...(value.containerName ? { containerName: value.containerName } : {}),
      condition: value.condition,
      affectedProperties: [...value.properties],
      affectedSourceNodeIds: [...value.sourceNodeIds],
      ...(value.stylesheetRef ? { stylesheetRef: value.stylesheetRef } : {}),
      ...(value.ruleIndex === undefined ? {} : { ruleIndex: value.ruleIndex }),
    }),
  );

  return {
    capture: {
      version: "1.0.0",
      adapter: input.adapter,
      snapshotId: input.snapshotId,
      environment,
      mediaRules,
      containers: [...containers.values()],
      containerQueries,
      diagnostics,
    },
  };
}
