import type { RawCaptureDiagnostic, RawFrameRecord, RawNode, RawSnapshot } from "@w2f/capture-core";
import type {
  CdpCaptureInput,
  CdpCaptureResult,
  CdpDocumentSnapshot,
  CdpFrameTree,
  CdpLayoutTreeSnapshot,
  CdpNodeTreeSnapshot,
  CdpRareBooleanData,
  CdpRareIntegerData,
  CdpRareStringData,
} from "./types.js";

export const CDP_COMPUTED_STYLE_PROPERTIES = [
  "display",
  "visibility",
  "content-visibility",
  "opacity",
  "overflow-x",
  "overflow-y",
  "position",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variation-settings",
  "font-feature-settings",
  "line-height",
  "letter-spacing",
  "color",
  "text-decoration-line",
  "white-space",
  "word-break",
  "overflow-wrap",
  "text-align",
  "direction",
  "writing-mode",
  "vertical-align",
  "content",
  "appearance",
  "accent-color",
] as const;

const SENSITIVE_ATTRIBUTE_PATTERN =
  /(?:^|[-_:])(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)(?:$|[-_:])/i;
const SENSITIVE_QUERY_PATTERN =
  /(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)/i;
const URL_ATTRIBUTES = new Set(["action", "formaction", "href", "poster", "src", "cite"]);

type Rect = { x: number; y: number; width: number; height: number };

function stringAt(strings: readonly string[], index: number | undefined): string {
  return typeof index === "number" && index >= 0 && index < strings.length
    ? (strings[index] ?? "")
    : "";
}

function rareInteger(data: CdpRareIntegerData | undefined, nodeIndex: number): number | undefined {
  if (!data) return undefined;
  const position = data.index.indexOf(nodeIndex);
  return position < 0 ? undefined : data.value[position];
}

function rareString(
  data: CdpRareStringData | undefined,
  nodeIndex: number,
  strings: readonly string[],
): string | undefined {
  if (!data) return undefined;
  const position = data.index.indexOf(nodeIndex);
  if (position < 0) return undefined;
  const value = stringAt(strings, data.value[position]);
  return value || undefined;
}

function rareBoolean(data: CdpRareBooleanData | undefined, nodeIndex: number): boolean | undefined {
  return data ? data.index.includes(nodeIndex) : undefined;
}

function rectangle(value: readonly number[] | undefined): Rect | undefined {
  if (!value || value.length < 4) return undefined;
  const [x, y, width, height] = value;
  if (![x, y, width, height].every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return { x: x!, y: y!, width: Math.max(0, width!), height: Math.max(0, height!) };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function safeUrl(value: string, baseUrl: string): string {
  try {
    const url = new URL(value, baseUrl);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PATTERN.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return value;
  }
}

function sanitizeAttributes(
  nodeName: string,
  encoded: readonly number[] | undefined,
  strings: readonly string[],
  baseUrl: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!encoded) return result;
  for (let index = 0; index + 1 < encoded.length; index += 2) {
    const name = stringAt(strings, encoded[index]).toLowerCase();
    if (!name) continue;
    if (
      name === "srcdoc" ||
      name === "style" ||
      name.startsWith("on") ||
      SENSITIVE_ATTRIBUTE_PATTERN.test(name) ||
      ((nodeName === "INPUT" || nodeName === "TEXTAREA") && name === "value")
    ) {
      continue;
    }
    const raw = stringAt(strings, encoded[index + 1]).slice(0, 16_384);
    result[name] = URL_ATTRIBUTES.has(name) ? safeUrl(raw, baseUrl) : raw;
  }
  return result;
}

function flattenFrameTree(
  tree: CdpFrameTree,
  result = new Map<string, CdpFrameTree["frame"]>(),
): Map<string, CdpFrameTree["frame"]> {
  result.set(tree.frame.id, tree.frame);
  for (const child of tree.childFrames ?? []) flattenFrameTree(child, result);
  return result;
}

function layoutLookup(layout: CdpLayoutTreeSnapshot): Map<number, number> {
  return new Map(layout.nodeIndex.map((nodeIndex, layoutIndex) => [nodeIndex, layoutIndex]));
}

function nodeKind(
  nodeType: number | undefined,
  nodeName: string,
  shadowRootType: string | undefined,
  pseudoType: string | undefined,
): RawNode["kind"] | undefined {
  if (pseudoType) return "pseudo";
  if (nodeType === 9) return "document";
  if (nodeType === 3) return "text";
  if (nodeType === 8) return "comment";
  if (nodeType === 11 && shadowRootType) return "shadow-root";
  if (nodeType !== 1 && nodeType !== 11) return undefined;
  if (nodeName === "IFRAME" || nodeName === "FRAME") return "iframe";
  if (nodeName === "SLOT") return "slot";
  return "element";
}

function stylesFor(
  layout: CdpLayoutTreeSnapshot,
  layoutIndex: number | undefined,
  strings: readonly string[],
): Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string> {
  const values = layoutIndex === undefined ? undefined : layout.styles[layoutIndex];
  const output = {} as Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>;
  CDP_COMPUTED_STYLE_PROPERTIES.forEach((property, index) => {
    output[property] = stringAt(strings, values?.[index]);
  });
  return output;
}

function cssPixels(value: string): number | undefined {
  if (!value || value === "normal") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function layoutIndicesLookup(layout: CdpLayoutTreeSnapshot): Map<number, number[]> {
  const result = new Map<number, number[]>();
  layout.nodeIndex.forEach((nodeIndex, layoutIndex) => {
    const entries = result.get(nodeIndex) ?? [];
    entries.push(layoutIndex);
    result.set(nodeIndex, entries);
  });
  return result;
}

function unionRects(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function rawTextRun(
  value: string,
  computed: Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>,
): NonNullable<RawNode["text"]>["runs"][number] {
  const fontSize = cssPixels(computed["font-size"]) ?? 0;
  const lineHeight = cssPixels(computed["line-height"]);
  const letterSpacing = cssPixels(computed["letter-spacing"]);
  return {
    start: 0,
    end: value.length,
    text: value,
    font: {
      family: computed["font-family"],
      ...(computed["font-style"] ? { style: computed["font-style"] } : {}),
      ...(computed["font-weight"] ? { weight: computed["font-weight"] } : {}),
      ...(computed["font-stretch"] ? { stretch: computed["font-stretch"] } : {}),
      ...(computed["font-variation-settings"]
        ? { variationSettings: computed["font-variation-settings"] }
        : {}),
      ...(computed["font-feature-settings"]
        ? { featureSettings: computed["font-feature-settings"] }
        : {}),
    },
    fontSize,
    ...(lineHeight === undefined
      ? { lineHeight: computed["line-height"] || "normal" }
      : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(computed.color ? { color: computed.color } : {}),
    ...(computed["text-decoration-line"] ? { decoration: computed["text-decoration-line"] } : {}),
    direction: computed.direction === "rtl" ? "rtl" : "ltr",
  };
}

function cdpBaseline(
  bounds: Rect,
  computed: Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>,
): Pick<
  NonNullable<RawNode["text"]>["fragments"][number],
  "baseline" | "baselineSource" | "baselineConfidence"
> {
  const fontSize = cssPixels(computed["font-size"]) ?? bounds.height;
  const lineHeight = cssPixels(computed["line-height"]) ?? bounds.height;
  const leading = Math.max(0, Math.min(bounds.height, lineHeight) - fontSize);
  return {
    baseline: bounds.y + leading / 2 + fontSize * 0.8,
    baselineSource: "cdp-layout-estimate",
    baselineConfidence: 0.7,
  };
}

function cdpTextEvidence(
  value: string,
  computed: Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>,
  layout: CdpLayoutTreeSnapshot,
  layoutIndices: number[],
  strings: readonly string[],
): RawNode["text"] {
  if (!value) return undefined;
  let cursor = 0;
  const fragments = layoutIndices.flatMap((layoutIndex, lineIndex) => {
    const bounds =
      rectangle(layout.clientRects?.[layoutIndex]) ?? rectangle(layout.bounds[layoutIndex]);
    if (!bounds) return [];
    const renderedText = stringAt(strings, layout.text[layoutIndex]);
    const found = renderedText ? value.indexOf(renderedText, cursor) : -1;
    const start = found >= 0 ? found : Math.min(cursor, value.length);
    const end = renderedText ? Math.min(value.length, start + renderedText.length) : value.length;
    cursor = Math.max(cursor, end);
    return [
      {
        start,
        end,
        bounds,
        ...cdpBaseline(bounds, computed),
        lineIndex,
      },
    ];
  });
  return {
    value,
    runs: [rawTextRun(value, computed)],
    fragments,
    whiteSpace: computed["white-space"],
    wordBreak: computed["word-break"],
    overflowWrap: computed["overflow-wrap"],
    textAlign: computed["text-align"],
    direction: computed.direction === "rtl" ? "rtl" : "ltr",
    writingMode: computed["writing-mode"],
  };
}

function inlineEvidence(
  computed: Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>,
  fragmentBounds: Rect[],
): RawNode["inline"] {
  const display = computed.display;
  if (!(display.startsWith("inline") || display.startsWith("ruby"))) return undefined;
  return {
    display,
    writingMode: computed["writing-mode"],
    ...(computed["vertical-align"] ? { verticalAlign: computed["vertical-align"] } : {}),
    fragmentBounds,
  };
}

function pseudoEvidence(
  pseudoType: string,
  content: string,
  renderedText: string,
): RawNode["pseudo"] {
  if (renderedText) {
    return { type: pseudoType, content, contentKind: "text", generatedText: renderedText };
  }
  if (!content || content === "none" || content === "normal") {
    return { type: pseudoType, content, contentKind: "none" };
  }
  return { type: pseudoType, content, contentKind: "complex" };
}

function formVisualEvidence(
  nodeName: string,
  attributes: Record<string, string>,
  computed: Record<(typeof CDP_COMPUTED_STYLE_PROPERTIES)[number], string>,
  checked: boolean | undefined,
): RawNode["formVisual"] {
  if (
    !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "PROGRESS", "METER", "OUTPUT"].includes(nodeName)
  ) {
    return undefined;
  }
  const disabled = Object.hasOwn(attributes, "disabled");
  const common = {
    disabled,
    ...(computed.appearance ? { appearance: computed.appearance } : {}),
    ...(computed["accent-color"] ? { accentColor: computed["accent-color"] } : {}),
  };
  if (nodeName === "INPUT") {
    const inputType = (attributes.type || "text").toLowerCase();
    const checkable = inputType === "checkbox" || inputType === "radio";
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
    ].includes(inputType);
    return {
      controlKind: "input",
      inputType,
      ...common,
      readOnly: Object.hasOwn(attributes, "readonly"),
      required: Object.hasOwn(attributes, "required"),
      ...(checkable && checked !== undefined ? { checked } : {}),
      ...(attributes.placeholder ? { placeholder: attributes.placeholder } : {}),
      textValueCapture: textual ? "omitted-sensitive" : "not-applicable",
    };
  }
  if (nodeName === "TEXTAREA") {
    return {
      controlKind: "textarea",
      ...common,
      readOnly: Object.hasOwn(attributes, "readonly"),
      required: Object.hasOwn(attributes, "required"),
      ...(attributes.placeholder ? { placeholder: attributes.placeholder } : {}),
      textValueCapture: "omitted-sensitive",
    };
  }
  if (nodeName === "SELECT") {
    return {
      controlKind: "select",
      ...common,
      required: Object.hasOwn(attributes, "required"),
      multiple: Object.hasOwn(attributes, "multiple"),
      textValueCapture: "omitted-sensitive",
    };
  }
  return {
    controlKind: nodeName.toLowerCase() as "button" | "progress" | "meter" | "output",
    ...common,
    textValueCapture: "not-applicable",
  };
}

function makeNodeId(
  documentIndex: number,
  nodeIndex: number,
  backendNodeId: number | undefined,
): string {
  return `cdp:${documentIndex}:${backendNodeId ?? nodeIndex}`;
}

function findDocumentRootIndex(nodes: CdpNodeTreeSnapshot): number {
  const index = nodes.nodeType.findIndex((value) => value === 9);
  return index >= 0 ? index : 0;
}

function buildDocumentNodeIds(documentIndex: number, document: CdpDocumentSnapshot): string[] {
  return document.nodes.nodeType.map((_, nodeIndex) =>
    makeNodeId(documentIndex, nodeIndex, document.nodes.backendNodeId[nodeIndex]),
  );
}

function documentUrl(
  document: CdpDocumentSnapshot,
  strings: readonly string[],
  fallback: string,
): string {
  const raw = stringAt(strings, document.documentURL) || fallback;
  return raw ? safeUrl(raw, raw) : "";
}

function frameContextFor(
  frameId: string,
  frames: Map<string, CdpFrameTree["frame"]>,
  fallbackUrl: string,
): RawNode["frameContext"] {
  const frame = frames.get(frameId);
  const url = frame?.url ? safeUrl(frame.url, frame.url) : fallbackUrl;
  let origin = frame?.securityOrigin;
  if (!origin && url) {
    try {
      origin = new URL(url).origin;
    } catch {
      origin = undefined;
    }
  }
  return {
    frameId,
    ...(frame?.parentId ? { parentFrameId: frame.parentId } : {}),
    ...(origin ? { origin } : {}),
    ...(url ? { url } : {}),
  };
}

export function normalizeCdpCapture(input: CdpCaptureInput): CdpCaptureResult {
  const { domSnapshot, layoutMetrics, frameTree, screenshot } = input.evidence;
  if (domSnapshot.documents.length === 0) throw new Error("CDP DOMSnapshot returned no documents");
  if (!screenshot.data) throw new Error("CDP Page.captureScreenshot returned no data");

  const strings = domSnapshot.strings;
  const frameMap = flattenFrameTree(frameTree.frameTree);
  const nodeIdsByDocument = domSnapshot.documents.map((document, index) =>
    buildDocumentNodeIds(index, document),
  );
  const documentFrameIds = domSnapshot.documents.map((document, index) => {
    const value = stringAt(strings, document.frameId);
    return value || `cdp-document-${index}`;
  });

  const documentOwner = new Map<number, { documentIndex: number; nodeIndex: number }>();
  domSnapshot.documents.forEach((document, documentIndex) => {
    document.nodes.nodeType.forEach((_, nodeIndex) => {
      const childDocumentIndex = rareInteger(document.nodes.contentDocumentIndex, nodeIndex);
      if (childDocumentIndex !== undefined) {
        documentOwner.set(childDocumentIndex, { documentIndex, nodeIndex });
      }
    });
  });

  const nodes: RawNode[] = [];
  const frames: RawFrameRecord[] = [];
  const diagnostics: RawCaptureDiagnostic[] = [];

  domSnapshot.documents.forEach((document, documentIndex) => {
    const frameId = documentFrameIds[documentIndex]!;
    const url = documentUrl(document, strings, input.fallbackUrl ?? "");
    const context = frameContextFor(frameId, frameMap, url);
    const owner = documentOwner.get(documentIndex);
    if (owner) {
      const parentFrameId = documentFrameIds[owner.documentIndex];
      if (parentFrameId !== undefined) context.parentFrameId = parentFrameId;
    }
    const rootIndex = findDocumentRootIndex(document.nodes);
    frames.push({
      context,
      rootCaptureNodeId: nodeIdsByDocument[documentIndex]![rootIndex]!,
      accessible: true,
    });

    const layoutMap = layoutLookup(document.layout);
    const layoutIndicesMap = layoutIndicesLookup(document.layout);
    const baseUrl = stringAt(strings, document.baseURL) || url;

    document.nodes.nodeType.forEach((type, nodeIndex) => {
      const nodeName = stringAt(strings, document.nodes.nodeName[nodeIndex]).toUpperCase();
      const shadowRootType = rareString(document.nodes.shadowRootType, nodeIndex, strings);
      const pseudoType = rareString(document.nodes.pseudoType, nodeIndex, strings);
      const kind = nodeKind(type, nodeName, shadowRootType, pseudoType);
      if (!kind) return;

      const captureNodeId = nodeIdsByDocument[documentIndex]![nodeIndex]!;
      const parentIndex = document.nodes.parentIndex[nodeIndex];
      const ownerForRoot = nodeIndex === rootIndex ? owner : undefined;
      const parentCaptureNodeId = ownerForRoot
        ? nodeIdsByDocument[ownerForRoot.documentIndex]?.[ownerForRoot.nodeIndex]
        : typeof parentIndex === "number" && parentIndex >= 0
          ? nodeIdsByDocument[documentIndex]?.[parentIndex]
          : undefined;

      const layoutIndex = layoutMap.get(nodeIndex);
      const layoutIndices = layoutIndicesMap.get(nodeIndex) ?? [];
      const layoutBounds = layoutIndices
        .map((index) => rectangle(document.layout.bounds[index]))
        .filter((value): value is Rect => value !== undefined);
      const bounds = unionRects(layoutBounds);
      if (
        input.captureTarget.type === "region" &&
        bounds &&
        input.captureTarget.exclusions.some(
          (item) => item.kind === "exclude" && contains(item.bounds, bounds),
        )
      ) {
        return;
      }
      const masked =
        input.captureTarget.type === "region" &&
        bounds !== undefined &&
        input.captureTarget.exclusions.some(
          (item) => item.kind === "redact" && intersects(item.bounds, bounds),
        );

      const computed = stylesFor(document.layout, layoutIndex, strings);
      const attributes = sanitizeAttributes(
        nodeName,
        document.nodes.attributes[nodeIndex],
        strings,
        baseUrl,
      );
      const hiddenAttribute = Object.hasOwn(attributes, "hidden");
      const rendered =
        layoutIndex !== undefined &&
        computed.display !== "none" &&
        computed.visibility !== "hidden" &&
        computed.visibility !== "collapse";
      const nodeValue = stringAt(strings, document.nodes.nodeValue[nodeIndex]);
      const clientRects = layoutIndices
        .map(
          (index) =>
            rectangle(document.layout.clientRects?.[index]) ??
            rectangle(document.layout.bounds[index]),
        )
        .filter((value): value is Rect => value !== undefined);
      const paintOrder =
        layoutIndex === undefined ? undefined : document.layout.paintOrders?.[layoutIndex];
      const renderedText = layoutIndices
        .map((index) => stringAt(strings, document.layout.text[index]))
        .filter(Boolean)
        .join("");
      const pseudo =
        kind === "pseudo" && pseudoType
          ? pseudoEvidence(pseudoType, computed.content, renderedText)
          : undefined;
      const textValue =
        kind === "text" ? nodeValue : kind === "pseudo" ? pseudo?.generatedText : undefined;
      const text =
        !masked && textValue
          ? cdpTextEvidence(textValue, computed, document.layout, layoutIndices, strings)
          : undefined;
      const inline = masked ? undefined : inlineEvidence(computed, clientRects);
      const formVisual = masked
        ? undefined
        : formVisualEvidence(
            nodeName,
            attributes,
            computed,
            rareBoolean(document.nodes.inputChecked, nodeIndex),
          );

      const raw: RawNode = {
        captureNodeId,
        kind,
        relationships: {
          ...(parentCaptureNodeId
            ? { sourceParentId: parentCaptureNodeId, composedParentId: parentCaptureNodeId }
            : {}),
        },
        childCaptureNodeIds: [],
        frameContext: context,
        source: {
          ...(nodeName && !nodeName.startsWith("#") ? { tagName: nodeName } : {}),
          ...(pseudoType ? { pseudoType } : {}),
          ...(masked ? {} : { attributes }),
          ...(typeof document.nodes.backendNodeId[nodeIndex] === "number"
            ? { backendNodeId: document.nodes.backendNodeId[nodeIndex] }
            : {}),
        },
        ...(bounds
          ? { geometry: { bounds, ...(clientRects.length > 0 ? { clientRects } : {}) } }
          : {}),
        ...(layoutIndex === undefined
          ? {}
          : {
              visibility: {
                display: computed.display || "",
                visibility: computed.visibility || "",
                ...(computed["content-visibility"]
                  ? { contentVisibility: computed["content-visibility"] }
                  : {}),
                opacity: Number.parseFloat(computed.opacity || "1"),
                hiddenAttribute,
                rendered,
              },
            }),
        ...(!masked && textValue ? { textContent: textValue } : {}),
        ...(text === undefined ? {} : { text }),
        ...(inline === undefined ? {} : { inline }),
        ...(pseudo === undefined ? {} : { pseudo }),
        ...(formVisual === undefined ? {} : { formVisual }),
        ...(typeof paintOrder === "number" ? { paintOrder } : {}),
      };
      nodes.push(raw);
    });
  });

  const nodeById = new Map(nodes.map((node) => [node.captureNodeId, node]));
  for (const node of nodes) {
    const parentId = node.relationships.sourceParentId;
    if (parentId) nodeById.get(parentId)?.childCaptureNodeIds.push(node.captureNodeId);
  }

  for (const frame of frameMap.values()) {
    if (frames.some((item) => item.context.frameId === frame.id)) continue;
    frames.push({
      context: frameContextFor(frame.id, frameMap, frame.url),
      accessible: false,
      inaccessibleReason: "frame-not-present-in-root-domsnapshot",
    });
    diagnostics.push({
      code: "CDP_FRAME_DOCUMENT_UNAVAILABLE",
      message:
        "Frame is present in Page.getFrameTree but absent from the root DOMSnapshot; it may be an out-of-process iframe target.",
      frameId: frame.id,
    });
  }

  let finalNodes = nodes;
  const rootDocument = domSnapshot.documents[0]!;
  const rootIndex = findDocumentRootIndex(rootDocument.nodes);
  const rootCaptureNodeId = nodeIdsByDocument[0]![rootIndex]!;
  if (input.captureTarget.type === "region") {
    const keep = new Set<string>([rootCaptureNodeId]);
    for (const node of nodes) {
      const bounds = node.geometry?.bounds;
      if (bounds && intersects(bounds, input.captureTarget.bounds)) keep.add(node.captureNodeId);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...keep]) {
        const node = nodeById.get(id);
        const parentId = node?.relationships.sourceParentId;
        if (parentId && !keep.has(parentId)) {
          keep.add(parentId);
          changed = true;
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
  const finalFrameIds = new Set(finalNodes.map((node) => node.frameContext.frameId));
  for (const diagnostic of diagnostics)
    if (diagnostic.frameId) finalFrameIds.add(diagnostic.frameId);
  let frameChanged = true;
  while (frameChanged) {
    frameChanged = false;
    for (const frame of frames) {
      if (!finalFrameIds.has(frame.context.frameId)) continue;
      const parent = frame.context.parentFrameId;
      if (parent && !finalFrameIds.has(parent)) {
        finalFrameIds.add(parent);
        frameChanged = true;
      }
    }
  }

  const finalFrames = frames
    .filter((frame) => finalFrameIds.has(frame.context.frameId))
    .map((frame) =>
      frame.rootCaptureNodeId && !finalNodeIds.has(frame.rootCaptureNodeId)
        ? {
            context: frame.context,
            accessible: frame.accessible,
            ...(frame.inaccessibleReason ? { inaccessibleReason: frame.inaccessibleReason } : {}),
          }
        : frame,
    );

  const cssLayout = layoutMetrics.cssLayoutViewport ?? layoutMetrics.layoutViewport;
  const cssVisual = layoutMetrics.cssVisualViewport ?? layoutMetrics.visualViewport;
  const contentSize = layoutMetrics.cssContentSize ?? layoutMetrics.contentSize;
  const browserPageZoom = cssVisual?.zoom;
  const visualViewportScale = cssVisual?.scale;
  const rootFrame = frameTree.frameTree.frame;
  const rootUrl = documentUrl(rootDocument, strings, input.fallbackUrl ?? rootFrame.url);
  const rootTitle = stringAt(strings, rootDocument.title) || input.fallbackTitle || "";

  const scrollContainers: RawSnapshot["scrollContainers"] = [];
  if (finalNodeIds.has(rootCaptureNodeId)) {
    const rootBounds = finalNodes.find((node) => node.captureNodeId === rootCaptureNodeId)?.geometry
      ?.bounds;
    scrollContainers.push({
      sourceNodeId: rootCaptureNodeId,
      scrollWidth: rootDocument.contentWidth ?? contentSize?.width ?? rootBounds?.width ?? 0,
      scrollHeight: rootDocument.contentHeight ?? contentSize?.height ?? rootBounds?.height ?? 0,
      clientWidth: cssLayout?.clientWidth ?? cssVisual?.clientWidth ?? 0,
      clientHeight: cssLayout?.clientHeight ?? cssVisual?.clientHeight ?? 0,
      scrollLeft: rootDocument.scrollOffsetX ?? cssLayout?.pageX ?? 0,
      scrollTop: rootDocument.scrollOffsetY ?? cssLayout?.pageY ?? 0,
      overflowX: "",
      overflowY: "",
      isDocumentScrollRoot: true,
      isPrimaryApplicationScrollRoot: false,
    });
  }

  const snapshot: RawSnapshot = {
    version: "1.0.0",
    adapter: "cdp",
    capturedAt: input.capturedAt,
    url: rootUrl,
    title: rootTitle,
    rootCaptureNodeId,
    captureTarget: input.captureTarget,
    environment: {
      viewportWidth:
        input.evidence.viewportWidth ??
        cssVisual?.clientWidth ??
        cssLayout?.clientWidth ??
        contentSize?.width ??
        0,
      viewportHeight:
        input.evidence.viewportHeight ??
        cssVisual?.clientHeight ??
        cssLayout?.clientHeight ??
        contentSize?.height ??
        0,
      scale: {
        context: {
          devicePixelRatio: input.evidence.devicePixelRatio,
          ...(typeof browserPageZoom === "number" && browserPageZoom > 0
            ? { browserPageZoom }
            : {}),
          ...(typeof visualViewportScale === "number" && visualViewportScale > 0
            ? { visualViewportScale }
            : {}),
        },
        browserPageZoomAvailability:
          typeof browserPageZoom === "number" && browserPageZoom > 0 ? "observed" : "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [
          "CDP Page.getLayoutMetrics supplies CSS visual viewport zoom when available.",
          "Element-scoped CSS zoom remains deferred to CSS capture semantics.",
        ],
      },
      layoutMetrics: {
        ...(contentSize ? { contentSize } : {}),
        ...(cssLayout ? { layoutViewport: cssLayout } : {}),
        ...(cssVisual ? { visualViewport: cssVisual } : {}),
      },
    },
    nodes: finalNodes,
    frames: finalFrames,
    scrollContainers,
    diagnostics,
  };

  return {
    snapshot,
    screenshot: {
      format: "png",
      dataBase64: screenshot.data,
      captureBeyondViewport: true,
    },
  };
}
