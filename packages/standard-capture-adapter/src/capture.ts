import type { RawCaptureDiagnostic, RawFrameRecord, RawNode, RawSnapshot } from "@w2f/capture-core";
import type { StandardCaptureInput, StandardCaptureResult } from "./types.js";

export function captureStandardSnapshotInPage(input: StandardCaptureInput): StandardCaptureResult {
  type LocalRect = { x: number; y: number; width: number; height: number };
  type LocalFrameContext = {
    frameId: string;
    parentFrameId?: string;
    origin?: string;
    url?: string;
  };
  type LocalScrollContainer = {
    sourceNodeId: string;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    scrollLeft: number;
    scrollTop: number;
    overflowX: string;
    overflowY: string;
    isDocumentScrollRoot: boolean;
    isPrimaryApplicationScrollRoot: boolean;
    parentScrollContainerId?: string;
  };

  const maxNodes = Math.max(1, Math.min(input.maxNodes ?? 100_000, 200_000));
  const captureTarget = input.captureTarget;
  const nodes: RawNode[] = [];
  const nodeIds = new Map<Node, string>();
  const frames: RawFrameRecord[] = [];
  const scrollContainers: LocalScrollContainer[] = [];
  const diagnostics: RawCaptureDiagnostic[] = [];
  const slotElements: Array<{ element: HTMLSlotElement; captureNodeId: string }> = [];
  let nodeSequence = 0;
  let frameSequence = 0;
  let budgetReported = false;

  const sensitiveNamePattern =
    /(?:^|[-_:])(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)(?:$|[-_:])/i;
  const sensitiveQueryPattern =
    /(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)/i;
  const urlAttributes = new Set(["action", "formaction", "href", "poster", "src", "cite"]);

  function safeUrl(value: string, baseUrl: string): string {
    try {
      const url = new URL(value, baseUrl);
      url.username = "";
      url.password = "";
      for (const key of [...url.searchParams.keys()]) {
        if (sensitiveQueryPattern.test(key)) url.searchParams.delete(key);
      }
      return url.href;
    } catch {
      return value;
    }
  }

  function frameContext(
    frameId: string,
    parentFrameId: string | undefined,
    view: Window,
  ): LocalFrameContext {
    let url = "";
    let origin = "";
    try {
      url = safeUrl(view.location.href, view.location.href);
      origin = view.location.origin;
    } catch {
      // Cross-origin frame details are recorded from the iframe boundary instead.
    }
    return {
      frameId,
      ...(parentFrameId === undefined ? {} : { parentFrameId }),
      ...(origin ? { origin } : {}),
      ...(url ? { url } : {}),
    };
  }

  function sanitizeAttributes(element: Element): Record<string, string> {
    const result: Record<string, string> = {};
    const tagName = element.tagName.toUpperCase();
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (
        name === "srcdoc" ||
        name === "style" ||
        name.startsWith("on") ||
        sensitiveNamePattern.test(name) ||
        ((tagName === "INPUT" || tagName === "TEXTAREA") && name === "value")
      ) {
        continue;
      }
      const rawValue = attribute.value.slice(0, 16_384);
      result[name] = urlAttributes.has(name)
        ? safeUrl(rawValue, element.ownerDocument.baseURI)
        : rawValue;
    }
    return result;
  }

  function toDocumentRect(rect: DOMRect, offsetX: number, offsetY: number): LocalRect {
    return {
      x: offsetX + rect.x,
      y: offsetY + rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  function clientRects(node: Node, offsetX: number, offsetY: number): LocalRect[] {
    if (node.nodeType === 1) {
      return [...(node as Element).getClientRects()].map((rect) =>
        toDocumentRect(rect, offsetX, offsetY),
      );
    }
    if (node.nodeType === 3 && node.textContent) {
      const range = node.ownerDocument?.createRange();
      if (!range) return [];
      range.selectNodeContents(node);
      return [...range.getClientRects()].map((rect) => toDocumentRect(rect, offsetX, offsetY));
    }
    return [];
  }

  function cssPixels(value: string): number | undefined {
    if (!value || value === "normal") return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function textStyleForNode(node: Node): CSSStyleDeclaration | undefined {
    const parent =
      node.parentElement ??
      (node.parentNode instanceof ShadowRoot
        ? node.parentNode.host
        : node.ownerDocument?.documentElement);
    const view = node.ownerDocument?.defaultView;
    return parent && view ? view.getComputedStyle(parent) : undefined;
  }

  function rawTextRun(
    text: string,
    style: CSSStyleDeclaration,
  ): NonNullable<RawNode["text"]>["runs"][number] {
    const fontSize = cssPixels(style.fontSize) ?? 0;
    const lineHeight = cssPixels(style.lineHeight);
    const letterSpacing = cssPixels(style.letterSpacing);
    return {
      start: 0,
      end: text.length,
      text,
      font: {
        family: style.fontFamily,
        ...(style.fontStyle ? { style: style.fontStyle } : {}),
        ...(style.fontWeight ? { weight: style.fontWeight } : {}),
        ...(style.fontStretch ? { stretch: style.fontStretch } : {}),
        ...(style.fontVariationSettings ? { variationSettings: style.fontVariationSettings } : {}),
        ...(style.fontFeatureSettings ? { featureSettings: style.fontFeatureSettings } : {}),
      },
      fontSize,
      ...(lineHeight === undefined ? { lineHeight: style.lineHeight || "normal" } : { lineHeight }),
      ...(letterSpacing === undefined ? {} : { letterSpacing }),
      ...(style.color ? { color: style.color } : {}),
      ...(style.textDecorationLine ? { decoration: style.textDecorationLine } : {}),
      direction: style.direction === "rtl" ? "rtl" : "ltr",
    };
  }

  function baselineForRect(
    rect: LocalRect,
    style: CSSStyleDeclaration,
    doc: Document,
  ): Pick<
    NonNullable<RawNode["text"]>["fragments"][number],
    "baseline" | "baselineSource" | "baselineConfidence"
  > {
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font =
        style.font ||
        `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${style.fontFamily || "sans-serif"}`;
      const metrics = context.measureText("Hg");
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
        return {
          baseline: rect.y + Math.max(0, (rect.height - (ascent + descent)) / 2) + ascent,
          baselineSource: "font-metrics",
          baselineConfidence: 0.9,
        };
      }
    }
    return {
      baseline: rect.y + rect.height * 0.8,
      baselineSource: "line-box-estimate",
      baselineConfidence: 0.55,
    };
  }

  function textFragments(
    node: Text,
    style: CSSStyleDeclaration,
    offsetX: number,
    offsetY: number,
  ): NonNullable<RawNode["text"]>["fragments"] {
    const text = node.textContent ?? "";
    const doc = node.ownerDocument;
    const range = doc.createRange();
    const samples: Array<{ start: number; end: number; bounds: LocalRect }> = [];
    const measurementEnd = Math.min(text.length, 4096);
    for (let start = 0; start < measurementEnd;) {
      const codePoint = text.codePointAt(start);
      const end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
      range.setStart(node, start);
      range.setEnd(node, Math.min(end, measurementEnd));
      for (const rect of [...range.getClientRects()]) {
        if (rect.width === 0 && rect.height === 0) continue;
        samples.push({
          start,
          end: Math.min(end, measurementEnd),
          bounds: toDocumentRect(rect, offsetX, offsetY),
        });
      }
      start = end;
    }

    const vertical =
      style.writingMode.startsWith("vertical") || style.writingMode.startsWith("sideways");
    const lines: Array<{ start: number; end: number; bounds: LocalRect }> = [];
    for (const sample of samples) {
      const last = lines.at(-1);
      const sameLine =
        last !== undefined &&
        (vertical
          ? Math.abs(sample.bounds.x - last.bounds.x) <=
            Math.max(1, Math.min(sample.bounds.width, last.bounds.width) * 0.5)
          : Math.abs(sample.bounds.y - last.bounds.y) <=
            Math.max(1, Math.min(sample.bounds.height, last.bounds.height) * 0.5));
      if (!last || !sameLine) {
        lines.push({ ...sample });
        continue;
      }
      const left = Math.min(last.bounds.x, sample.bounds.x);
      const top = Math.min(last.bounds.y, sample.bounds.y);
      const right = Math.max(
        last.bounds.x + last.bounds.width,
        sample.bounds.x + sample.bounds.width,
      );
      const bottom = Math.max(
        last.bounds.y + last.bounds.height,
        sample.bounds.y + sample.bounds.height,
      );
      last.start = Math.min(last.start, sample.start);
      last.end = Math.max(last.end, sample.end);
      last.bounds = { x: left, y: top, width: right - left, height: bottom - top };
    }

    return lines.map((line, lineIndex) => ({
      start: line.start,
      end: line.end,
      bounds: line.bounds,
      ...baselineForRect(line.bounds, style, doc),
      lineIndex,
    }));
  }

  function textEvidence(node: Text, offsetX: number, offsetY: number): RawNode["text"] {
    const value = node.textContent ?? "";
    const style = textStyleForNode(node);
    if (!style) return undefined;
    return {
      value,
      runs: [rawTextRun(value, style)],
      fragments: textFragments(node, style, offsetX, offsetY),
      whiteSpace: style.whiteSpace,
      wordBreak: style.wordBreak,
      overflowWrap: style.overflowWrap,
      textAlign: style.textAlign,
      direction: style.direction === "rtl" ? "rtl" : "ltr",
      writingMode: style.writingMode,
    };
  }

  function inlineEvidence(element: Element, rects: LocalRect[]): RawNode["inline"] {
    const view = element.ownerDocument.defaultView;
    if (!view) return undefined;
    const style = view.getComputedStyle(element);
    if (!(style.display.startsWith("inline") || style.display.startsWith("ruby"))) return undefined;
    return {
      display: style.display,
      writingMode: style.writingMode,
      ...(style.verticalAlign ? { verticalAlign: style.verticalAlign } : {}),
      fragmentBounds: rects,
    };
  }

  function formVisualEvidence(element: Element): RawNode["formVisual"] {
    const tagName = element.tagName.toUpperCase();
    if (
      !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "PROGRESS", "METER", "OUTPUT"].includes(tagName)
    ) {
      return undefined;
    }
    const view = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);
    const common = {
      disabled: "disabled" in element ? Boolean((element as HTMLInputElement).disabled) : false,
      ...(style?.appearance ? { appearance: style.appearance } : {}),
      ...(style?.accentColor ? { accentColor: style.accentColor } : {}),
    };
    if (tagName === "INPUT") {
      const input = element as HTMLInputElement;
      const type = (input.getAttribute("type") || "text").toLowerCase();
      const checkable = type === "checkbox" || type === "radio";
      const textual = ![
        "button",
        "submit",
        "reset",
        "checkbox",
        "radio",
        "range",
        "color",
        "file",
        "image",
        "hidden",
      ].includes(type);
      return {
        controlKind: "input",
        inputType: type,
        ...common,
        readOnly: input.readOnly,
        required: input.required,
        ...(checkable ? { checked: input.checked, indeterminate: input.indeterminate } : {}),
        ...(input.placeholder ? { placeholder: input.placeholder } : {}),
        textValueCapture: textual ? "omitted-sensitive" : "not-applicable",
      };
    }
    if (tagName === "TEXTAREA") {
      const textarea = element as HTMLTextAreaElement;
      return {
        controlKind: "textarea",
        ...common,
        readOnly: textarea.readOnly,
        required: textarea.required,
        ...(textarea.placeholder ? { placeholder: textarea.placeholder } : {}),
        textValueCapture: "omitted-sensitive",
      };
    }
    if (tagName === "SELECT") {
      const select = element as HTMLSelectElement;
      return {
        controlKind: "select",
        ...common,
        required: select.required,
        multiple: select.multiple,
        textValueCapture: "omitted-sensitive",
      };
    }
    return {
      controlKind: tagName.toLowerCase() as "button" | "progress" | "meter" | "output",
      ...common,
      textValueCapture: "not-applicable",
    };
  }

  function pseudoContent(content: string): NonNullable<RawNode["pseudo"]> {
    if (!content || content === "none" || content === "normal") {
      return { type: "before", content, contentKind: "none" };
    }
    const first = content[0];
    const last = content.at(-1);
    const quoted =
      (first === String.fromCharCode(34) || first === String.fromCharCode(39)) && last === first;
    if (quoted) {
      const raw = content.slice(1, -1);
      let generatedText = "";
      for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index]!;
        if (character === "\\" && index + 1 < raw.length) {
          const next = raw[index + 1]!;
          if (next.toLowerCase() === "a") {
            generatedText += "\n";
            index += 1;
            if (" \t\r\n\f".includes(raw[index + 1] ?? "")) index += 1;
            continue;
          }
          generatedText += next;
          index += 1;
          continue;
        }
        generatedText += character;
      }
      return { type: "before", content, contentKind: "text", generatedText };
    }
    return { type: "before", content, contentKind: "complex" };
  }
  function capturePseudo(
    element: Element,
    host: RawNode,
    hostId: string,
    pseudoType: "before" | "after" | "marker",
    context: LocalFrameContext,
  ): void {
    if (nodes.length >= maxNodes) {
      reportBudget(context.frameId);
      return;
    }
    const view = element.ownerDocument.defaultView;
    if (!view) return;
    let style: CSSStyleDeclaration;
    try {
      style = view.getComputedStyle(element, `::${pseudoType}`);
    } catch {
      return;
    }
    const hostDisplay = view.getComputedStyle(element).display;
    const parsed = pseudoContent(style.content || "");
    parsed.type = pseudoType;
    if (pseudoType !== "marker" && parsed.contentKind === "none") return;
    if (pseudoType === "marker" && hostDisplay !== "list-item" && parsed.contentKind === "none")
      return;

    const captureNodeId = createId(context.frameId);
    const generatedText = parsed.generatedText;
    const raw: RawNode = {
      captureNodeId,
      kind: "pseudo",
      relationships: { sourceParentId: hostId, composedParentId: hostId },
      childCaptureNodeIds: [],
      frameContext: context,
      source: {
        pseudoType,
        ...(host.source.sourceSelector
          ? { sourceSelector: `${host.source.sourceSelector}::${pseudoType}` }
          : {}),
      },
      visibility: {
        display: style.display || "inline",
        visibility: style.visibility || "visible",
        contentVisibility: style.contentVisibility || "visible",
        opacity: Number.parseFloat(style.opacity || "1"),
        hiddenAttribute: false,
        rendered:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse",
      },
      pseudo: parsed,
      ...(generatedText === undefined
        ? {}
        : {
            textContent: generatedText,
            text: {
              value: generatedText,
              runs: [rawTextRun(generatedText, style)],
              fragments: [],
              whiteSpace: style.whiteSpace,
              wordBreak: style.wordBreak,
              overflowWrap: style.overflowWrap,
              textAlign: style.textAlign,
              direction: style.direction === "rtl" ? "rtl" : "ltr",
              writingMode: style.writingMode,
            },
          }),
    };
    nodes.push(raw);
    host.childCaptureNodeIds.push(captureNodeId);
  }

  function boundsForNode(node: Node, offsetX: number, offsetY: number): LocalRect | undefined {
    if (node.nodeType === 9) {
      const doc = node as Document;
      const root = doc.documentElement;
      const body = doc.body;
      return {
        x: offsetX,
        y: offsetY,
        width: Math.max(root?.scrollWidth ?? 0, root?.clientWidth ?? 0, body?.scrollWidth ?? 0),
        height: Math.max(root?.scrollHeight ?? 0, root?.clientHeight ?? 0, body?.scrollHeight ?? 0),
      };
    }
    const rects = clientRects(node, offsetX, offsetY);
    if (rects.length === 0) return undefined;
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function intersects(a: LocalRect, b: LocalRect): boolean {
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  }

  function contains(outer: LocalRect, inner: LocalRect): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  function isFullyExcluded(bounds: LocalRect | undefined): boolean {
    if (!bounds || captureTarget.type !== "region") return false;
    return captureTarget.exclusions.some(
      (item) => item.kind === "exclude" && contains(item.bounds, bounds),
    );
  }

  function isMasked(bounds: LocalRect | undefined): boolean {
    if (!bounds || captureTarget.type !== "region") return false;
    return captureTarget.exclusions.some(
      (item) => item.kind === "redact" && intersects(item.bounds, bounds),
    );
  }

  function sourceSelector(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;
    while (current) {
      const tag = current.tagName.toLowerCase();
      let segment = tag;
      const parent: Element | null = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current!.tagName);
        if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
      segments.unshift(segment);
      const root = current.getRootNode();
      current = parent;
      if (!current || root instanceof ShadowRoot) break;
    }
    return segments.join(" > ");
  }

  function createId(frameId: string): string {
    const id = `std:${frameId}:${nodeSequence}`;
    nodeSequence += 1;
    return id;
  }

  function reportBudget(frameId: string): void {
    if (budgetReported) return;
    budgetReported = true;
    diagnostics.push({
      code: "STANDARD_CAPTURE_NODE_LIMIT",
      message: `Standard capture stopped at the configured ${maxNodes} node limit`,
      frameId,
    });
  }

  function visibilityFor(element: Element): RawNode["visibility"] {
    const view = element.ownerDocument.defaultView;
    if (!view) return undefined;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const visibility = style.visibility;
    return {
      display: style.display,
      visibility,
      contentVisibility: style.contentVisibility || "visible",
      opacity: Number.parseFloat(style.opacity || "1"),
      hiddenAttribute: element.hasAttribute("hidden"),
      rendered:
        style.display !== "none" &&
        visibility !== "hidden" &&
        visibility !== "collapse" &&
        rect.width >= 0 &&
        rect.height >= 0,
    };
  }

  function registerScrollContainer(
    element: Element,
    captureNodeId: string,
    parentScrollContainerId: string | undefined,
    frameId: string,
  ): string | undefined {
    const view = element.ownerDocument.defaultView;
    if (!view) return parentScrollContainerId;
    const doc = element.ownerDocument;
    if (element === doc.scrollingElement || element === doc.documentElement) {
      return parentScrollContainerId;
    }
    const style = view.getComputedStyle(element);
    const html = element as HTMLElement;
    const scrollable = html.scrollWidth > html.clientWidth || html.scrollHeight > html.clientHeight;
    if (!scrollable) return parentScrollContainerId;
    const record: LocalScrollContainer = {
      sourceNodeId: captureNodeId,
      scrollWidth: html.scrollWidth,
      scrollHeight: html.scrollHeight,
      clientWidth: html.clientWidth,
      clientHeight: html.clientHeight,
      scrollLeft: html.scrollLeft,
      scrollTop: html.scrollTop,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      isDocumentScrollRoot: false,
      isPrimaryApplicationScrollRoot: false,
      ...(parentScrollContainerId === undefined ? {} : { parentScrollContainerId }),
    };
    scrollContainers.push(record);
    if (record.clientWidth <= 0 || record.clientHeight <= 0) {
      diagnostics.push({
        code: "STANDARD_CAPTURE_ZERO_SCROLL_VIEWPORT",
        message: "Scrollable element has a zero-size client viewport",
        frameId,
        sourceNodeId: captureNodeId,
      });
    }
    return captureNodeId;
  }

  function captureDocument(
    doc: Document,
    context: LocalFrameContext,
    offsetX: number,
    offsetY: number,
    sourceParentId?: string,
  ): string | undefined {
    if (nodes.length >= maxNodes) {
      reportBudget(context.frameId);
      return undefined;
    }

    const documentId = createId(context.frameId);
    const documentBounds = boundsForNode(doc, offsetX, offsetY);
    const documentNode: RawNode = {
      captureNodeId: documentId,
      kind: "document",
      relationships: {
        ...(sourceParentId === undefined
          ? {}
          : { sourceParentId, composedParentId: sourceParentId }),
      },
      childCaptureNodeIds: [],
      frameContext: context,
      source: {},
      ...(documentBounds === undefined ? {} : { geometry: { bounds: documentBounds } }),
    };
    nodes.push(documentNode);
    nodeIds.set(doc, documentId);

    const view = doc.defaultView;
    const root = doc.documentElement;
    if (view && root) {
      scrollContainers.push({
        sourceNodeId: documentId,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        scrollLeft: view.scrollX,
        scrollTop: view.scrollY,
        overflowX: view.getComputedStyle(root).overflowX,
        overflowY: view.getComputedStyle(root).overflowY,
        isDocumentScrollRoot: true,
        isPrimaryApplicationScrollRoot: false,
      });
    }

    for (const child of [...doc.childNodes]) {
      const childId = captureNode(
        child,
        documentId,
        documentId,
        context,
        offsetX,
        offsetY,
        documentId,
      );
      if (childId) documentNode.childCaptureNodeIds.push(childId);
    }
    return documentId;
  }

  function captureShadowRoot(
    root: ShadowRoot,
    hostId: string,
    context: LocalFrameContext,
    offsetX: number,
    offsetY: number,
    parentScrollContainerId: string | undefined,
  ): string | undefined {
    if (nodes.length >= maxNodes) {
      reportBudget(context.frameId);
      return undefined;
    }
    const rootId = createId(context.frameId);
    const raw: RawNode = {
      captureNodeId: rootId,
      kind: "shadow-root",
      relationships: { sourceParentId: hostId, composedParentId: hostId, shadowHostId: hostId },
      childCaptureNodeIds: [],
      frameContext: context,
      source: {},
    };
    nodes.push(raw);
    nodeIds.set(root, rootId);
    for (const child of [...root.childNodes]) {
      const childId = captureNode(
        child,
        rootId,
        hostId,
        context,
        offsetX,
        offsetY,
        parentScrollContainerId,
        hostId,
      );
      if (childId) raw.childCaptureNodeIds.push(childId);
    }
    return rootId;
  }

  function captureIframeDocument(
    element: HTMLIFrameElement,
    iframeId: string,
    parentContext: LocalFrameContext,
    iframeBounds: LocalRect | undefined,
  ): void {
    frameSequence += 1;
    const childFrameId = `${parentContext.frameId}.iframe-${frameSequence}`;
    let childDoc: Document | null = null;
    let childView: Window | null = null;
    try {
      childDoc = element.contentDocument;
      childView = element.contentWindow;
      if (childDoc) void childDoc.documentElement;
      if (childView) void childView.location.href;
    } catch {
      childDoc = null;
      childView = null;
    }

    if (!childDoc || !childView) {
      const rawSrc = element.getAttribute("src") ?? "";
      const url = rawSrc ? safeUrl(rawSrc, element.ownerDocument.baseURI) : undefined;
      const context: LocalFrameContext = {
        frameId: childFrameId,
        parentFrameId: parentContext.frameId,
        ...(url ? { url } : {}),
      };
      frames.push({
        context,
        accessible: false,
        inaccessibleReason: "cross-origin-or-inaccessible",
      });
      diagnostics.push({
        code: "STANDARD_CAPTURE_FRAME_INACCESSIBLE",
        message:
          "iframe content is cross-origin, sandboxed, or otherwise unavailable to Standard capture",
        frameId: childFrameId,
        sourceNodeId: iframeId,
      });
      return;
    }

    const context = frameContext(childFrameId, parentContext.frameId, childView);
    const frameRecord: RawFrameRecord = { context, accessible: true };
    frames.push(frameRecord);
    const childRoot = captureDocument(
      childDoc,
      context,
      (iframeBounds?.x ?? 0) + element.clientLeft,
      (iframeBounds?.y ?? 0) + element.clientTop,
      iframeId,
    );
    if (childRoot) frameRecord.rootCaptureNodeId = childRoot;
  }

  function captureNode(
    node: Node,
    sourceParentId: string,
    composedParentId: string,
    context: LocalFrameContext,
    offsetX: number,
    offsetY: number,
    parentScrollContainerId: string | undefined,
    shadowHostId?: string,
  ): string | undefined {
    if (nodes.length >= maxNodes) {
      reportBudget(context.frameId);
      return undefined;
    }

    if (node.nodeType === 3) {
      if (!node.textContent) return undefined;
      const textNode = node as Text;
      const bounds = boundsForNode(textNode, offsetX, offsetY);
      if (isFullyExcluded(bounds)) return undefined;
      const captureNodeId = createId(context.frameId);
      const masked = isMasked(bounds);
      const rects = clientRects(textNode, offsetX, offsetY);
      const text = masked ? undefined : textEvidence(textNode, offsetX, offsetY);
      const raw: RawNode = {
        captureNodeId,
        kind: "text",
        relationships: {
          sourceParentId,
          composedParentId,
          ...(shadowHostId === undefined ? {} : { shadowHostId }),
        },
        childCaptureNodeIds: [],
        frameContext: context,
        source: {},
        ...(bounds === undefined ? {} : { geometry: { bounds, clientRects: rects } }),
        ...(masked ? {} : { textContent: textNode.textContent }),
        ...(text === undefined ? {} : { text }),
      };
      nodes.push(raw);
      nodeIds.set(node, captureNodeId);
      if (!masked && textNode.textContent.length > 4096) {
        diagnostics.push({
          code: "STANDARD_TEXT_FRAGMENT_LIMIT",
          message:
            "Text fragment character measurement is capped at 4096 UTF-16 code units per text node; the full text run is still preserved.",
          frameId: context.frameId,
          sourceNodeId: captureNodeId,
        });
      }
      return captureNodeId;
    }

    if (node.nodeType === 8) {
      if (!input.includeComments) return undefined;
      const captureNodeId = createId(context.frameId);
      const raw: RawNode = {
        captureNodeId,
        kind: "comment",
        relationships: {
          sourceParentId,
          composedParentId,
          ...(shadowHostId === undefined ? {} : { shadowHostId }),
        },
        childCaptureNodeIds: [],
        frameContext: context,
        source: {},
      };
      nodes.push(raw);
      nodeIds.set(node, captureNodeId);
      return captureNodeId;
    }

    if (node.nodeType !== 1) return undefined;
    const element = node as Element;
    const bounds = boundsForNode(element, offsetX, offsetY);
    if (isFullyExcluded(bounds)) return undefined;
    const captureNodeId = createId(context.frameId);
    const masked = isMasked(bounds);
    const tagName = element.tagName.toUpperCase();
    const kind = tagName === "IFRAME" ? "iframe" : tagName === "SLOT" ? "slot" : "element";
    const namespace = element.namespaceURI;
    const role = element.getAttribute("role");
    const source = {
      tagName,
      ...(namespace === null ? {} : { namespace }),
      ...(role === null ? {} : { role }),
      sourceSelector: sourceSelector(element),
      ...(masked ? {} : { attributes: sanitizeAttributes(element) }),
    };
    const visibility = visibilityFor(element);
    const elementRects = clientRects(element, offsetX, offsetY);
    const inline = masked ? undefined : inlineEvidence(element, elementRects);
    const formVisual = masked ? undefined : formVisualEvidence(element);
    const raw: RawNode = {
      captureNodeId,
      kind,
      relationships: {
        sourceParentId,
        composedParentId,
        ...(shadowHostId === undefined ? {} : { shadowHostId }),
      },
      childCaptureNodeIds: [],
      frameContext: context,
      source,
      ...(bounds === undefined ? {} : { geometry: { bounds, clientRects: elementRects } }),
      ...(visibility === undefined ? {} : { visibility }),
      ...(inline === undefined ? {} : { inline }),
      ...(formVisual === undefined ? {} : { formVisual }),
    };
    nodes.push(raw);
    nodeIds.set(node, captureNodeId);

    if (!masked) {
      capturePseudo(element, raw, captureNodeId, "marker", context);
      capturePseudo(element, raw, captureNodeId, "before", context);
    }

    const currentScrollContainerId = registerScrollContainer(
      element,
      captureNodeId,
      parentScrollContainerId,
      context.frameId,
    );

    if (tagName === "SLOT") {
      slotElements.push({ element: element as HTMLSlotElement, captureNodeId });
    }

    const isFormValueContainer = tagName === "INPUT" || tagName === "TEXTAREA";
    if (!isFormValueContainer) {
      for (const child of [...element.childNodes]) {
        const childId = captureNode(
          child,
          captureNodeId,
          captureNodeId,
          context,
          offsetX,
          offsetY,
          currentScrollContainerId,
          shadowHostId,
        );
        if (childId) raw.childCaptureNodeIds.push(childId);
      }
    }

    const shadow = element.shadowRoot;
    if (shadow?.mode === "open") {
      const shadowId = captureShadowRoot(
        shadow,
        captureNodeId,
        context,
        offsetX,
        offsetY,
        currentScrollContainerId,
      );
      if (shadowId) raw.childCaptureNodeIds.push(shadowId);
    }

    if (tagName === "IFRAME" && !masked) {
      captureIframeDocument(element as HTMLIFrameElement, captureNodeId, context, bounds);
    }

    if (!masked) capturePseudo(element, raw, captureNodeId, "after", context);

    return captureNodeId;
  }

  const mainContext = frameContext("frame-main", undefined, window);
  const mainFrame: RawFrameRecord = { context: mainContext, accessible: true };
  frames.push(mainFrame);
  const rootCaptureNodeId = captureDocument(document, mainContext, window.scrollX, window.scrollY);
  if (!rootCaptureNodeId) throw new Error("Standard capture could not create the document root");
  mainFrame.rootCaptureNodeId = rootCaptureNodeId;

  for (const slot of slotElements) {
    let assigned: Node[] = [];
    try {
      assigned = slot.element.assignedNodes({ flatten: true });
    } catch {
      assigned = [];
    }
    for (const assignedNode of assigned) {
      const assignedId = nodeIds.get(assignedNode);
      if (!assignedId) continue;
      const raw = nodes.find((item) => item.captureNodeId === assignedId);
      if (!raw) continue;
      raw.relationships.composedParentId = slot.captureNodeId;
      raw.relationships.assignedSlotId = slot.captureNodeId;
    }
  }

  const nonDocumentScroll = scrollContainers.filter((item) => !item.isDocumentScrollRoot);
  const primary = nonDocumentScroll
    .filter((item) => item.clientWidth > 0 && item.clientHeight > 0)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (
    primary &&
    primary.clientWidth * primary.clientHeight >= window.innerWidth * window.innerHeight * 0.5
  ) {
    primary.isPrimaryApplicationScrollRoot = true;
  }

  let finalNodes = nodes;
  if (captureTarget.type === "region") {
    const nodeById = new Map(nodes.map((node) => [node.captureNodeId, node]));
    const keep = new Set<string>([rootCaptureNodeId]);
    for (const node of nodes) {
      const bounds = node.geometry?.bounds;
      if (bounds && intersects(bounds, captureTarget.bounds)) keep.add(node.captureNodeId);
    }

    for (const node of nodes) {
      if (node.kind !== "pseudo") continue;
      const parentId = node.relationships.sourceParentId;
      if (parentId && keep.has(parentId)) keep.add(node.captureNodeId);
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...keep]) {
        const node = nodeById.get(id);
        if (!node) continue;
        for (const field of [
          "sourceParentId",
          "composedParentId",
          "assignedSlotId",
          "shadowHostId",
        ] as const) {
          const relation = node.relationships[field];
          if (relation && !keep.has(relation)) {
            keep.add(relation);
            changed = true;
          }
        }
      }
    }

    finalNodes = nodes
      .filter((node) => keep.has(node.captureNodeId))
      .map((node) => ({
        ...node,
        childCaptureNodeIds: node.childCaptureNodeIds.filter((id) => keep.has(id)),
      }));
  }

  const finalNodeIds = new Set(finalNodes.map((node) => node.captureNodeId));
  const usedFrameIds = new Set(finalNodes.map((node) => node.frameContext.frameId));
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.frameId &&
      (diagnostic.sourceNodeId === undefined || finalNodeIds.has(diagnostic.sourceNodeId))
    ) {
      usedFrameIds.add(diagnostic.frameId);
    }
  }
  let frameClosureChanged = true;
  while (frameClosureChanged) {
    frameClosureChanged = false;
    for (const frame of frames) {
      if (!usedFrameIds.has(frame.context.frameId)) continue;
      const parentId = frame.context.parentFrameId;
      if (parentId && !usedFrameIds.has(parentId)) {
        usedFrameIds.add(parentId);
        frameClosureChanged = true;
      }
    }
  }

  const finalFrames: RawFrameRecord[] = frames
    .filter((frame) => usedFrameIds.has(frame.context.frameId))
    .map((frame) => {
      if (!frame.rootCaptureNodeId || finalNodeIds.has(frame.rootCaptureNodeId)) return frame;
      return {
        context: frame.context,
        accessible: frame.accessible,
        ...(frame.inaccessibleReason === undefined
          ? {}
          : { inaccessibleReason: frame.inaccessibleReason }),
      };
    });

  const snapshot: RawSnapshot = {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: new Date().toISOString(),
    url: safeUrl(window.location.href, window.location.href),
    title: document.title,
    rootCaptureNodeId,
    captureTarget,
    environment: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: {
        context: {
          devicePixelRatio: window.devicePixelRatio,
          ...(window.visualViewport?.scale === undefined
            ? {}
            : { visualViewportScale: window.visualViewport.scale }),
        },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [
          "Standard page APIs expose DPR and visual viewport scale but cannot reliably separate browser page zoom from OS display scaling.",
          "CSS zoom is element-scoped evidence and is intentionally deferred to authored/computed CSS capture.",
        ],
      },
    },
    nodes: finalNodes,
    frames: finalFrames,
    scrollContainers: scrollContainers.filter((item) => finalNodeIds.has(item.sourceNodeId)),
    diagnostics,
  };

  return { snapshot };
}
