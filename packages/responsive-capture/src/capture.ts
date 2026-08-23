import type { WtfResponsiveSnapshotRef } from "@w2f/w2f-schema";
import {
  RESPONSIVE_CAPTURE_VERSION,
  RESPONSIVE_DEFAULT_WIDTHS,
  RESPONSIVE_MAX_VIEWPORTS,
  type ResponsiveCapture,
  type ResponsiveCaptureDiagnostic,
  type ResponsiveCaptureRequest,
  type ResponsiveCaptureSummary,
  type ResponsiveSnapshotInput,
  type ResponsiveViewportContext,
  type ResponsiveViewportPlan,
  type ResponsiveViewportRequest,
} from "./types.js";

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be positive`);
  return value;
}

function normalizeWidth(value: number): number {
  const width = Math.round(finitePositive(value, "viewport width"));
  if (width < 240 || width > 10_000) {
    throw new TypeError("viewport width must be an integer between 240 and 10000");
  }
  return width;
}

function normalizeHeight(value: number): number {
  const height = Math.round(finitePositive(value, "viewport height"));
  if (height < 240 || height > 10_000) {
    throw new TypeError("viewport height must be an integer between 240 and 10000");
  }
  return height;
}

function normalizeDpr(value: number): number {
  const dpr = finitePositive(value, "viewport dpr");
  if (dpr < 0.5 || dpr > 8) throw new TypeError("viewport dpr must be between 0.5 and 8");
  return Math.round(dpr * 1000) / 1000;
}

export function normalizeResponsiveViewportContext(
  value: ResponsiveViewportContext,
): ResponsiveViewportContext {
  return {
    width: normalizeWidth(value.width),
    height: normalizeHeight(value.height),
    dpr: normalizeDpr(value.dpr),
  };
}

function viewportId(viewport: ResponsiveViewportContext): string {
  return `viewport:${viewport.width}x${viewport.height}@${viewport.dpr}`;
}

function requestedViewport(
  value: ResponsiveViewportRequest,
  base: ResponsiveViewportContext,
): ResponsiveViewportContext {
  return normalizeResponsiveViewportContext({
    width: value.width,
    height: value.height ?? base.height,
    dpr: value.dpr ?? base.dpr,
  });
}

function uniqueSortedSynthetic(values: ResponsiveViewportContext[]): ResponsiveViewportPlan[] {
  const dedup = new Map<string, ResponsiveViewportPlan>();
  for (const value of values) {
    const id = viewportId(value);
    if (!dedup.has(id)) dedup.set(id, { id, ...value, source: "synthetic" });
  }
  return [...dedup.values()].sort(
    (left, right) =>
      right.width - left.width ||
      right.height - left.height ||
      right.dpr - left.dpr ||
      left.id.localeCompare(right.id),
  );
}

export function planResponsiveViewports(
  request: ResponsiveCaptureRequest,
  currentViewport: ResponsiveViewportContext,
): ResponsiveViewportPlan[] {
  const base = normalizeResponsiveViewportContext(currentViewport);
  if (request.mode === "current") {
    return [{ id: viewportId(base), ...base, source: "current" }];
  }

  const requested =
    request.mode === "common"
      ? RESPONSIVE_DEFAULT_WIDTHS.map((width) => ({ ...base, width }))
      : request.viewports.map((viewport) => requestedViewport(viewport, base));
  if (requested.length === 0) throw new TypeError("custom responsive capture requires a viewport");

  const planned = uniqueSortedSynthetic(requested);
  if (planned.length > RESPONSIVE_MAX_VIEWPORTS) {
    throw new TypeError(
      `responsive capture supports at most ${RESPONSIVE_MAX_VIEWPORTS} viewports`,
    );
  }
  return planned;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must be non-empty`);
  return normalized;
}

function normalizeRef(
  value: WtfResponsiveSnapshotRef,
  plan: ResponsiveViewportPlan,
): WtfResponsiveSnapshotRef {
  const width = normalizeWidth(value.viewport.width);
  const height = normalizeHeight(value.viewport.height);
  const dpr = normalizeDpr(value.viewport.dpr);
  if (width !== plan.width || height !== plan.height || Math.abs(dpr - plan.dpr) > 0.001) {
    throw new TypeError(`responsive snapshot ${plan.id} viewport does not match its capture plan`);
  }
  return {
    id: nonEmpty(value.id, "responsive snapshot id"),
    viewport: { width, height, dpr },
    rootNodeId: nonEmpty(value.rootNodeId, "responsive rootNodeId"),
    environmentRef: nonEmpty(value.environmentRef, "responsive environmentRef"),
    ...(value.stateRef ? { stateRef: value.stateRef } : {}),
  };
}

export function buildResponsiveCapture(input: {
  request: ResponsiveCaptureRequest;
  baseViewport: ResponsiveViewportContext;
  snapshots: ResponsiveSnapshotInput[];
  diagnostics?: ResponsiveCaptureDiagnostic[];
}): ResponsiveCapture {
  const baseViewport = normalizeResponsiveViewportContext(input.baseViewport);
  const plannedViewports = planResponsiveViewports(input.request, baseViewport);
  const planById = new Map(plannedViewports.map((plan) => [plan.id, plan]));
  const seen = new Set<string>();
  const diagnostics = [...(input.diagnostics ?? [])];
  const snapshots = input.snapshots
    .map((snapshot) => {
      const plan = planById.get(snapshot.plan.id);
      if (!plan) {
        diagnostics.push({
          code: "RESPONSIVE_VIEWPORT_UNSUPPORTED",
          message: "Captured responsive snapshot is not part of the deterministic viewport plan.",
          viewportId: snapshot.plan.id,
        });
        return null;
      }
      if (seen.has(plan.id)) {
        diagnostics.push({
          code: "RESPONSIVE_REQUEST_INVALID",
          message: "Responsive snapshot ids must be unique.",
          viewportId: plan.id,
        });
        return null;
      }
      seen.add(plan.id);
      const stableNodes = [...snapshot.stableNodes]
        .map((node) => ({ ...node }))
        .sort((left, right) => left.captureNodeId.localeCompare(right.captureNodeId));
      return {
        plan: { ...plan },
        ref: normalizeRef(snapshot.ref, plan),
        artifactId: nonEmpty(snapshot.artifactId, "responsive artifactId"),
        artifacts: { ...snapshot.artifacts },
        stableNodes,
      };
    })
    .filter((snapshot): snapshot is ResponsiveSnapshotInput => snapshot !== null)
    .sort((left, right) => left.plan.id.localeCompare(right.plan.id));

  for (const plan of plannedViewports) {
    if (seen.has(plan.id)) continue;
    diagnostics.push({
      code: "RESPONSIVE_CAPTURE_FAILED",
      message: "Responsive viewport did not produce a snapshot.",
      viewportId: plan.id,
    });
  }

  return {
    version: RESPONSIVE_CAPTURE_VERSION,
    mode: input.request.mode,
    baseViewport,
    plannedViewports,
    snapshots,
    diagnostics: diagnostics.sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        (left.viewportId ?? "").localeCompare(right.viewportId ?? "") ||
        (left.sourceNodeId ?? "").localeCompare(right.sourceNodeId ?? "") ||
        left.message.localeCompare(right.message),
    ),
  };
}

export function responsiveArtifactId(jobId: string, viewportIdValue: string): string {
  const normalizedJobId = nonEmpty(jobId, "jobId");
  const normalizedViewportId = nonEmpty(viewportIdValue, "viewportId");
  return `${normalizedJobId}:responsive:${encodeURIComponent(normalizedViewportId)}`;
}

export function toWtfResponsiveSnapshotRefs(
  capture: ResponsiveCapture,
): WtfResponsiveSnapshotRef[] {
  return capture.snapshots.map((snapshot) => ({
    ...snapshot.ref,
    viewport: { ...snapshot.ref.viewport },
  }));
}

export function summarizeResponsiveCapture(capture: ResponsiveCapture): ResponsiveCaptureSummary {
  return {
    version: capture.version,
    mode: capture.mode,
    plannedViewportCount: capture.plannedViewports.length,
    capturedSnapshotCount: capture.snapshots.length,
    stableNodeEvidenceCount: capture.snapshots.reduce(
      (total, snapshot) => total + snapshot.stableNodes.length,
      0,
    ),
    diagnosticCount: capture.diagnostics.length,
  };
}

export function isResponsiveCapture(value: unknown): value is ResponsiveCapture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === RESPONSIVE_CAPTURE_VERSION &&
    (record.mode === "current" || record.mode === "common" || record.mode === "custom") &&
    typeof record.baseViewport === "object" &&
    record.baseViewport !== null &&
    Array.isArray(record.plannedViewports) &&
    Array.isArray(record.snapshots) &&
    Array.isArray(record.diagnostics)
  );
}
