import { RAW_SNAPSHOT_VERSION } from "./types.js";
import type { RawSnapshot, RawSnapshotSummary } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isUnitInterval(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isSafeOffset(value: unknown, length: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= length;
}

function isRect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isNonNegativeFiniteNumber(value.width) &&
    isNonNegativeFiniteNumber(value.height)
  );
}

function rectContains(outer: unknown, inner: unknown): boolean {
  if (!isRecord(outer) || !isRecord(inner) || !isRect(outer) || !isRect(inner)) return false;
  const outerX = outer.x as number;
  const outerY = outer.y as number;
  const outerWidth = outer.width as number;
  const outerHeight = outer.height as number;
  const innerX = inner.x as number;
  const innerY = inner.y as number;
  const innerWidth = inner.width as number;
  const innerHeight = inner.height as number;
  return (
    innerX >= outerX &&
    innerY >= outerY &&
    innerX + innerWidth <= outerX + outerWidth &&
    innerY + innerHeight <= outerY + outerHeight
  );
}

function isFrameContext(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.frameId)) return false;
  for (const field of ["parentFrameId", "origin", "url"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && !isNonEmptyString(candidate)) return false;
  }
  return true;
}

function isScaleContext(value: unknown): boolean {
  if (!isRecord(value) || !isPositiveFiniteNumber(value.devicePixelRatio)) return false;
  for (const field of ["browserPageZoom", "cssZoom", "visualViewportScale"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && !isPositiveFiniteNumber(candidate)) return false;
  }
  return true;
}

function isScaleAvailability(value: unknown): boolean {
  return value === "observed" || value === "unavailable" || value === "not-applicable";
}

function isScaleEvidence(value: unknown): boolean {
  if (!isRecord(value) || !isScaleContext(value.context)) return false;
  return (
    isScaleAvailability(value.browserPageZoomAvailability) &&
    isScaleAvailability(value.cssZoomAvailability) &&
    Array.isArray(value.reasons) &&
    value.reasons.every((reason) => typeof reason === "string")
  );
}

function isLayoutViewport(value: unknown): boolean {
  return (
    isRecord(value) &&
    [value.pageX, value.pageY, value.clientWidth, value.clientHeight].every(isFiniteNumber) &&
    isNonNegativeFiniteNumber(value.clientWidth) &&
    isNonNegativeFiniteNumber(value.clientHeight)
  );
}

function isVisualViewport(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    ![
      value.offsetX,
      value.offsetY,
      value.pageX,
      value.pageY,
      value.clientWidth,
      value.clientHeight,
    ].every(isFiniteNumber) ||
    !isNonNegativeFiniteNumber(value.clientWidth) ||
    !isNonNegativeFiniteNumber(value.clientHeight) ||
    !isPositiveFiniteNumber(value.scale)
  ) {
    return false;
  }
  return value.zoom === undefined || isPositiveFiniteNumber(value.zoom);
}

function isLayoutMetricsEvidence(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.contentSize === undefined || isRect(value.contentSize)) &&
    (value.layoutViewport === undefined || isLayoutViewport(value.layoutViewport)) &&
    (value.visualViewport === undefined || isVisualViewport(value.visualViewport))
  );
}

function isRawCaptureTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "document") return true;
  if (value.type !== "region" || !isRect(value.bounds) || !Array.isArray(value.exclusions)) {
    return false;
  }
  return value.exclusions.every(
    (item) =>
      isRecord(item) &&
      (item.kind === "redact" || item.kind === "exclude") &&
      isRect(item.bounds) &&
      rectContains(value.bounds, item.bounds),
  );
}

function isRawFontEvidence(value: unknown): boolean {
  if (!isRecord(value) || typeof value.family !== "string") return false;
  if (value.style !== undefined && typeof value.style !== "string") return false;
  if (
    value.weight !== undefined &&
    typeof value.weight !== "string" &&
    !isNonNegativeFiniteNumber(value.weight)
  ) {
    return false;
  }
  for (const field of ["stretch", "variationSettings", "featureSettings"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== "string") return false;
  }
  return true;
}

function isRawTextRun(value: unknown, text: string): boolean {
  if (
    !isRecord(value) ||
    !isSafeOffset(value.start, text.length) ||
    !isSafeOffset(value.end, text.length)
  ) {
    return false;
  }
  const start = value.start as number;
  const end = value.end as number;
  if (end < start || typeof value.text !== "string" || value.text !== text.slice(start, end))
    return false;
  if (!isRawFontEvidence(value.font) || !isNonNegativeFiniteNumber(value.fontSize)) return false;
  if (
    value.lineHeight !== undefined &&
    typeof value.lineHeight !== "string" &&
    !isNonNegativeFiniteNumber(value.lineHeight)
  ) {
    return false;
  }
  if (value.letterSpacing !== undefined && !isFiniteNumber(value.letterSpacing)) return false;
  if (value.color !== undefined && typeof value.color !== "string") return false;
  if (value.decoration !== undefined && typeof value.decoration !== "string") return false;
  if (value.baselineShift !== undefined && !isFiniteNumber(value.baselineShift)) return false;
  if (value.direction !== undefined && value.direction !== "ltr" && value.direction !== "rtl")
    return false;
  return true;
}

function isRawTextFragment(value: unknown, textLength: number): boolean {
  if (
    !isRecord(value) ||
    !isSafeOffset(value.start, textLength) ||
    !isSafeOffset(value.end, textLength) ||
    (value.end as number) < (value.start as number) ||
    !isRect(value.bounds) ||
    !isFiniteNumber(value.baseline) ||
    !["font-metrics", "line-box-estimate", "cdp-layout-estimate"].includes(
      String(value.baselineSource),
    ) ||
    !isUnitInterval(value.baselineConfidence) ||
    !Number.isSafeInteger(value.lineIndex) ||
    (value.lineIndex as number) < 0
  ) {
    return false;
  }
  return true;
}

function isRawTextEvidence(value: unknown): boolean {
  if (!isRecord(value) || typeof value.value !== "string") return false;
  const text = value.value;
  if (
    !Array.isArray(value.runs) ||
    !value.runs.every((run) => isRawTextRun(run, text)) ||
    !Array.isArray(value.fragments) ||
    !value.fragments.every((fragment) => isRawTextFragment(fragment, text.length))
  ) {
    return false;
  }
  for (const field of [
    "whiteSpace",
    "wordBreak",
    "overflowWrap",
    "textAlign",
    "writingMode",
  ] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== "string") return false;
  }
  return value.direction === undefined || value.direction === "ltr" || value.direction === "rtl";
}

function isRawInlineEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.display === "string" &&
    typeof value.writingMode === "string" &&
    (value.verticalAlign === undefined || typeof value.verticalAlign === "string") &&
    Array.isArray(value.fragmentBounds) &&
    value.fragmentBounds.every(isRect)
  );
}

function isRawPseudoEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.type) &&
    typeof value.content === "string" &&
    ["none", "text", "complex"].includes(String(value.contentKind)) &&
    (value.generatedText === undefined || typeof value.generatedText === "string")
  );
}

function isRawFormVisualEvidence(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !["input", "textarea", "select", "button", "progress", "meter", "output"].includes(
      String(value.controlKind),
    ) ||
    typeof value.disabled !== "boolean" ||
    !["not-applicable", "omitted-sensitive"].includes(String(value.textValueCapture))
  ) {
    return false;
  }
  for (const field of ["inputType", "placeholder", "appearance", "accentColor"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== "string") return false;
  }
  for (const field of ["readOnly", "required", "checked", "indeterminate", "multiple"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== "boolean") return false;
  }
  return true;
}

function isRawNode(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.captureNodeId)) return false;
  if (
    !["document", "element", "text", "pseudo", "shadow-root", "iframe", "slot", "comment"].includes(
      String(value.kind),
    )
  ) {
    return false;
  }
  if (!isRecord(value.relationships) || !Array.isArray(value.childCaptureNodeIds)) return false;
  if (!value.childCaptureNodeIds.every(isNonEmptyString)) return false;
  if (new Set(value.childCaptureNodeIds).size !== value.childCaptureNodeIds.length) return false;
  if (!isFrameContext(value.frameContext) || !isRecord(value.source)) return false;

  if (value.geometry !== undefined) {
    if (!isRecord(value.geometry) || !isRect(value.geometry.bounds)) return false;
    if (
      value.geometry.clientRects !== undefined &&
      (!Array.isArray(value.geometry.clientRects) || !value.geometry.clientRects.every(isRect))
    ) {
      return false;
    }
    if (
      value.geometry.scrollContainerId !== undefined &&
      !isNonEmptyString(value.geometry.scrollContainerId)
    ) {
      return false;
    }
  }

  if (value.visibility !== undefined) {
    if (!isRecord(value.visibility)) return false;
    if (
      typeof value.visibility.display !== "string" ||
      typeof value.visibility.visibility !== "string" ||
      (value.visibility.contentVisibility !== undefined &&
        typeof value.visibility.contentVisibility !== "string") ||
      !isFiniteNumber(value.visibility.opacity) ||
      typeof value.visibility.hiddenAttribute !== "boolean" ||
      typeof value.visibility.rendered !== "boolean"
    ) {
      return false;
    }
  }

  if (value.textContent !== undefined && typeof value.textContent !== "string") return false;
  if (value.text !== undefined && !isRawTextEvidence(value.text)) return false;
  if (
    value.textContent !== undefined &&
    isRecord(value.text) &&
    typeof value.text.value === "string" &&
    value.text.value !== value.textContent
  ) {
    return false;
  }
  if (value.inline !== undefined && !isRawInlineEvidence(value.inline)) return false;
  if (value.pseudo !== undefined && !isRawPseudoEvidence(value.pseudo)) return false;
  if (value.kind === "pseudo" && !isRawPseudoEvidence(value.pseudo)) return false;
  if (value.formVisual !== undefined && !isRawFormVisualEvidence(value.formVisual)) return false;
  if (value.paintOrder !== undefined && !isNonNegativeFiniteNumber(value.paintOrder)) return false;
  if (
    value.source.backendNodeId !== undefined &&
    !isNonNegativeFiniteNumber(value.source.backendNodeId)
  ) {
    return false;
  }
  if (value.source.pseudoType !== undefined && !isNonEmptyString(value.source.pseudoType))
    return false;
  if (
    value.source.pseudoType !== undefined &&
    isRecord(value.pseudo) &&
    typeof value.pseudo.type === "string" &&
    value.pseudo.type !== value.source.pseudoType
  ) {
    return false;
  }
  if (value.source.attributes !== undefined) {
    if (!isRecord(value.source.attributes)) return false;
    if (!Object.values(value.source.attributes).every((item) => typeof item === "string")) {
      return false;
    }
  }
  return true;
}

function isRawDiagnostic(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.code) || !isNonEmptyString(value.message)) {
    return false;
  }
  for (const field of ["frameId", "sourceNodeId"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && !isNonEmptyString(candidate)) return false;
  }
  return true;
}

export function isRawSnapshot(value: unknown): value is RawSnapshot {
  if (!isRecord(value)) return false;
  if (
    value.version !== RAW_SNAPSHOT_VERSION ||
    (value.adapter !== "standard" && value.adapter !== "cdp") ||
    !isNonEmptyString(value.capturedAt) ||
    Number.isNaN(Date.parse(value.capturedAt)) ||
    typeof value.url !== "string" ||
    typeof value.title !== "string" ||
    !isNonEmptyString(value.rootCaptureNodeId) ||
    !isRawCaptureTarget(value.captureTarget) ||
    !isRecord(value.environment) ||
    !isNonNegativeFiniteNumber(value.environment.viewportWidth) ||
    !isNonNegativeFiniteNumber(value.environment.viewportHeight) ||
    !isScaleEvidence(value.environment.scale) ||
    (value.environment.layoutMetrics !== undefined &&
      !isLayoutMetricsEvidence(value.environment.layoutMetrics)) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.frames) ||
    !Array.isArray(value.scrollContainers) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isRawDiagnostic)
  ) {
    return false;
  }

  if (!value.nodes.every(isRawNode)) return false;
  const nodes = value.nodes as RawSnapshot["nodes"];
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.captureNodeId)) return false;
    nodeIds.add(node.captureNodeId);
  }
  if (!nodeIds.has(value.rootCaptureNodeId)) return false;

  for (const node of nodes) {
    for (const childId of node.childCaptureNodeIds) {
      if (!nodeIds.has(childId)) return false;
    }
    for (const field of [
      "sourceParentId",
      "composedParentId",
      "renderParentId",
      "assignedSlotId",
      "shadowHostId",
    ] as const) {
      const reference = node.relationships[field];
      if (reference !== undefined && !nodeIds.has(reference)) return false;
    }
  }

  const frameIds = new Set<string>();
  for (const frame of value.frames) {
    if (
      !isRecord(frame) ||
      !isFrameContext(frame.context) ||
      typeof frame.accessible !== "boolean"
    ) {
      return false;
    }
    const context = frame.context as { frameId: string; parentFrameId?: string };
    if (frameIds.has(context.frameId)) return false;
    frameIds.add(context.frameId);
    if (
      frame.rootCaptureNodeId !== undefined &&
      (!isNonEmptyString(frame.rootCaptureNodeId) || !nodeIds.has(frame.rootCaptureNodeId))
    ) {
      return false;
    }
    if (frame.inaccessibleReason !== undefined && !isNonEmptyString(frame.inaccessibleReason)) {
      return false;
    }
  }

  for (const frame of value.frames) {
    if (!isRecord(frame) || !isRecord(frame.context)) return false;
    const parentFrameId = frame.context.parentFrameId;
    if (
      parentFrameId !== undefined &&
      (!isNonEmptyString(parentFrameId) || !frameIds.has(parentFrameId))
    ) {
      return false;
    }
  }

  for (const node of nodes) {
    if (!frameIds.has(node.frameContext.frameId)) return false;
  }

  const scrollNodeIds = new Set<string>();
  for (const item of value.scrollContainers) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.sourceNodeId) ||
      !nodeIds.has(item.sourceNodeId) ||
      scrollNodeIds.has(item.sourceNodeId) ||
      ![
        item.scrollWidth,
        item.scrollHeight,
        item.clientWidth,
        item.clientHeight,
        item.scrollLeft,
        item.scrollTop,
      ].every(isFiniteNumber) ||
      typeof item.overflowX !== "string" ||
      typeof item.overflowY !== "string" ||
      typeof item.isDocumentScrollRoot !== "boolean" ||
      typeof item.isPrimaryApplicationScrollRoot !== "boolean"
    ) {
      return false;
    }
    scrollNodeIds.add(item.sourceNodeId);
  }
  for (const item of value.scrollContainers) {
    if (!isRecord(item)) return false;
    const parent = item.parentScrollContainerId;
    if (parent !== undefined && (!isNonEmptyString(parent) || !scrollNodeIds.has(parent))) {
      return false;
    }
  }

  for (const diagnostic of value.diagnostics) {
    if (!isRecord(diagnostic)) return false;
    if (diagnostic.frameId !== undefined && !frameIds.has(String(diagnostic.frameId))) return false;
    if (diagnostic.sourceNodeId !== undefined && !nodeIds.has(String(diagnostic.sourceNodeId))) {
      return false;
    }
  }

  return true;
}

export function summarizeRawSnapshot(snapshot: RawSnapshot): RawSnapshotSummary {
  if (!isRawSnapshot(snapshot)) throw new TypeError("invalid RawSnapshot");
  return {
    version: snapshot.version,
    adapter: snapshot.adapter,
    nodeCount: snapshot.nodes.length,
    frameCount: snapshot.frames.length,
    scrollContainerCount: snapshot.scrollContainers.length,
    diagnosticCount: snapshot.diagnostics.length,
  };
}
