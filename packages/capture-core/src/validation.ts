import { validateRect } from "@w2f/w2f-schema";
import { validateFrameContext } from "@w2f/w2f-schema/frame-context";
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

function isRect(value: unknown): boolean {
  return validateRect(value).ok;
}

function isRawCaptureTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "document") return true;
  return (
    value.type === "region" &&
    isRect(value.bounds) &&
    Array.isArray(value.exclusions) &&
    value.exclusions.every(
      (item) =>
        isRecord(item) &&
        (item.kind === "redact" || item.kind === "exclude") &&
        isRect(item.bounds),
    )
  );
}

function isRawNode(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.captureNodeId)) return false;
  if (
    !["document", "element", "text", "shadow-root", "iframe", "slot", "comment"].includes(
      String(value.kind),
    )
  ) {
    return false;
  }
  if (!isRecord(value.relationships) || !Array.isArray(value.childCaptureNodeIds)) return false;
  if (!value.childCaptureNodeIds.every(isNonEmptyString)) return false;
  if (!validateFrameContext(value.frameContext).ok || !isRecord(value.source)) return false;
  if (value.geometry !== undefined) {
    if (!isRecord(value.geometry) || !isRect(value.geometry.bounds)) return false;
    if (
      value.geometry.clientRects !== undefined &&
      (!Array.isArray(value.geometry.clientRects) || !value.geometry.clientRects.every(isRect))
    ) {
      return false;
    }
  }
  if (value.visibility !== undefined) {
    if (!isRecord(value.visibility)) return false;
    if (
      !isNonEmptyString(value.visibility.display) ||
      !isNonEmptyString(value.visibility.visibility) ||
      !isFiniteNumber(value.visibility.opacity) ||
      typeof value.visibility.hiddenAttribute !== "boolean" ||
      typeof value.visibility.rendered !== "boolean"
    ) {
      return false;
    }
  }
  return value.textContent === undefined || typeof value.textContent === "string";
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
    !isFiniteNumber(value.environment.viewportWidth) ||
    !isFiniteNumber(value.environment.viewportHeight) ||
    !isFiniteNumber(value.environment.devicePixelRatio) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.frames) ||
    !Array.isArray(value.scrollContainers) ||
    !Array.isArray(value.diagnostics)
  ) {
    return false;
  }

  if (!value.nodes.every(isRawNode)) return false;
  const nodeIds = new Set<string>();
  for (const node of value.nodes as RawSnapshot["nodes"]) {
    if (nodeIds.has(node.captureNodeId)) return false;
    nodeIds.add(node.captureNodeId);
  }
  if (!nodeIds.has(value.rootCaptureNodeId)) return false;

  for (const node of value.nodes as RawSnapshot["nodes"]) {
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
    if (!isRecord(frame) || !validateFrameContext(frame.context).ok) return false;
    const context = frame.context as { frameId: string; parentFrameId?: string };
    if (frameIds.has(context.frameId) || typeof frame.accessible !== "boolean") return false;
    frameIds.add(context.frameId);
    if (
      frame.rootCaptureNodeId !== undefined &&
      (!isNonEmptyString(frame.rootCaptureNodeId) || !nodeIds.has(frame.rootCaptureNodeId))
    ) {
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

  for (const node of value.nodes as RawSnapshot["nodes"]) {
    if (!frameIds.has(node.frameContext.frameId)) return false;
  }

  return value.scrollContainers.every(
    (item) =>
      isRecord(item) &&
      isNonEmptyString(item.sourceNodeId) &&
      nodeIds.has(item.sourceNodeId) &&
      [
        item.scrollWidth,
        item.scrollHeight,
        item.clientWidth,
        item.clientHeight,
        item.scrollLeft,
        item.scrollTop,
      ].every(isFiniteNumber) &&
      typeof item.overflowX === "string" &&
      typeof item.overflowY === "string" &&
      typeof item.isDocumentScrollRoot === "boolean" &&
      typeof item.isPrimaryApplicationScrollRoot === "boolean",
  );
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
