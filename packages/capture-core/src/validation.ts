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

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
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

function isRawNode(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.captureNodeId)) return false;
  if (
    !["document", "element", "text", "shadow-root", "iframe", "slot", "comment"].includes(
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
      !isNonEmptyString(value.visibility.display) ||
      !isNonEmptyString(value.visibility.visibility) ||
      (value.visibility.contentVisibility !== undefined &&
        !isNonEmptyString(value.visibility.contentVisibility)) ||
      !isFiniteNumber(value.visibility.opacity) ||
      typeof value.visibility.hiddenAttribute !== "boolean" ||
      typeof value.visibility.rendered !== "boolean"
    ) {
      return false;
    }
  }

  if (value.textContent !== undefined && typeof value.textContent !== "string") return false;
  if (value.source.attributes !== undefined) {
    if (!isRecord(value.source.attributes)) return false;
    if (!Object.values(value.source.attributes).every((item) => typeof item === "string")) return false;
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
    !isFiniteNumber(value.environment.devicePixelRatio) ||
    value.environment.devicePixelRatio <= 0 ||
    (value.environment.visualViewportScale !== undefined &&
      (!isFiniteNumber(value.environment.visualViewportScale) ||
        value.environment.visualViewportScale <= 0)) ||
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
    if (!isRecord(frame) || !isFrameContext(frame.context) || typeof frame.accessible !== "boolean") {
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
    if (parentFrameId !== undefined && (!isNonEmptyString(parentFrameId) || !frameIds.has(parentFrameId))) {
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
    if (parent !== undefined && (!isNonEmptyString(parent) || !scrollNodeIds.has(parent))) return false;
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
