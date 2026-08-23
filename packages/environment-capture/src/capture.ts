import type {
  WtfCaptureEnvironment,
  WtfContainerQueryInfo,
  WtfMediaRuleTrace,
} from "@w2f/w2f-ir";
import {
  ENVIRONMENT_CAPTURE_VERSION,
  type ContainerDefinitionEvidence,
  type ContainerQueryEvidence,
  type CreateEnvironmentCaptureInput,
  type EnvironmentCapture,
  type EnvironmentCaptureDiagnostic,
  type EnvironmentCaptureSummary,
  type MediaRuleEvidence,
  type RuntimeEnvironmentEvidence,
} from "./types.js";

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be positive`);
  return value;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function normalizeEnvironment(value: RuntimeEnvironmentEvidence): RuntimeEnvironmentEvidence {
  const pageZoom = value.pageZoom === undefined ? undefined : positive(value.pageZoom, "pageZoom");
  const visualViewportScale =
    value.visualViewportScale === undefined
      ? undefined
      : positive(value.visualViewportScale, "visualViewportScale");
  const cssZoom = value.cssZoom === undefined ? undefined : positive(value.cssZoom, "cssZoom");
  if (value.pageZoomAvailability === "observed" && pageZoom === undefined) {
    throw new TypeError("observed page zoom requires a value");
  }
  if (value.cssZoomAvailability === "observed" && cssZoom === undefined) {
    throw new TypeError("observed css zoom requires a value");
  }
  return {
    browserName: nonEmpty(value.browserName, "browserName"),
    browserVersion: nonEmpty(value.browserVersion, "browserVersion"),
    platform: nonEmpty(value.platform, "platform"),
    language: nonEmpty(value.language, "language"),
    direction: value.direction,
    colorScheme: value.colorScheme,
    reducedMotion: value.reducedMotion,
    viewportWidth: positive(value.viewportWidth, "viewportWidth"),
    viewportHeight: positive(value.viewportHeight, "viewportHeight"),
    dpr: positive(value.dpr, "dpr"),
    ...(pageZoom === undefined ? {} : { pageZoom }),
    pageZoomAvailability: value.pageZoomAvailability,
    ...(visualViewportScale === undefined ? {} : { visualViewportScale }),
    ...(cssZoom === undefined ? {} : { cssZoom }),
    cssZoomAvailability: value.cssZoomAvailability,
  };
}

function normalizeMedia(rule: MediaRuleEvidence, snapshotId: string): MediaRuleEvidence {
  const activeInSnapshotIds = rule.active ? [snapshotId] : [];
  return {
    id: nonEmpty(rule.id, "media rule id"),
    query: nonEmpty(rule.query, "media query"),
    active: rule.active,
    activeInSnapshotIds,
    affectedProperties: uniqueSorted(rule.affectedProperties),
    affectedSourceNodeIds: uniqueSorted(rule.affectedSourceNodeIds),
    ...(rule.stylesheetRef ? { stylesheetRef: rule.stylesheetRef } : {}),
    ...(rule.ruleIndex === undefined ? {} : { ruleIndex: rule.ruleIndex }),
  };
}

function normalizeContainer(value: ContainerDefinitionEvidence): ContainerDefinitionEvidence {
  return {
    sourceNodeId: nonEmpty(value.sourceNodeId, "container sourceNodeId"),
    ...(value.containerName?.trim() ? { containerName: value.containerName.trim() } : {}),
    ...(value.containerType?.trim() ? { containerType: value.containerType.trim() } : {}),
  };
}

function normalizeContainerQuery(value: ContainerQueryEvidence): ContainerQueryEvidence {
  return {
    id: nonEmpty(value.id, "container query id"),
    ...(value.containerName?.trim() ? { containerName: value.containerName.trim() } : {}),
    condition: nonEmpty(value.condition, "container query condition"),
    affectedProperties: uniqueSorted(value.affectedProperties),
    affectedSourceNodeIds: uniqueSorted(value.affectedSourceNodeIds),
    ...(value.stylesheetRef ? { stylesheetRef: value.stylesheetRef } : {}),
    ...(value.ruleIndex === undefined ? {} : { ruleIndex: value.ruleIndex }),
  };
}

function normalizeDiagnostic(value: EnvironmentCaptureDiagnostic): EnvironmentCaptureDiagnostic {
  return {
    code: value.code,
    message: nonEmpty(value.message, "diagnostic message"),
    ...(value.sourceNodeId ? { sourceNodeId: value.sourceNodeId } : {}),
    ...(value.stylesheetRef ? { stylesheetRef: value.stylesheetRef } : {}),
  };
}

export function createEnvironmentCapture(input: CreateEnvironmentCaptureInput): EnvironmentCapture {
  const snapshotId = nonEmpty(input.snapshotId, "snapshotId");
  const mediaRules = (input.mediaRules ?? [])
    .map((item) => normalizeMedia(item, snapshotId))
    .sort((a, b) => a.id.localeCompare(b.id));
  const containers = (input.containers ?? [])
    .map(normalizeContainer)
    .sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId));
  const containerQueries = (input.containerQueries ?? [])
    .map(normalizeContainerQuery)
    .sort((a, b) => a.id.localeCompare(b.id));
  const diagnostics = (input.diagnostics ?? [])
    .map(normalizeDiagnostic)
    .sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        (a.sourceNodeId ?? "").localeCompare(b.sourceNodeId ?? "") ||
        a.message.localeCompare(b.message),
    );

  if (new Set(mediaRules.map((item) => item.id)).size !== mediaRules.length) {
    throw new TypeError("duplicate media rule id");
  }
  if (new Set(containers.map((item) => item.sourceNodeId)).size !== containers.length) {
    throw new TypeError("duplicate container sourceNodeId");
  }
  if (new Set(containerQueries.map((item) => item.id)).size !== containerQueries.length) {
    throw new TypeError("duplicate container query id");
  }

  return {
    version: ENVIRONMENT_CAPTURE_VERSION,
    adapter: input.adapter,
    snapshotId,
    environment: normalizeEnvironment(input.environment),
    mediaRules,
    containers,
    containerQueries,
    diagnostics,
  };
}

export function toWtfCaptureEnvironment(capture: EnvironmentCapture): WtfCaptureEnvironment | null {
  const environment = capture.environment;
  if (environment.pageZoomAvailability !== "observed" || environment.pageZoom === undefined) {
    return null;
  }
  return {
    id: `environment:${capture.snapshotId}`,
    browserName: environment.browserName,
    browserVersion: environment.browserVersion,
    platform: environment.platform,
    language: environment.language,
    direction: environment.direction,
    colorScheme: environment.colorScheme,
    reducedMotion: environment.reducedMotion,
    viewportWidth: environment.viewportWidth,
    viewportHeight: environment.viewportHeight,
    dpr: environment.dpr,
    pageZoom: environment.pageZoom,
    ...(environment.cssZoom === undefined ? {} : { cssZoom: environment.cssZoom }),
  };
}

export function toWtfMediaRuleTraces(capture: EnvironmentCapture): WtfMediaRuleTrace[] {
  return capture.mediaRules.map((rule) => ({
    query: rule.query,
    activeInSnapshotIds: [...rule.activeInSnapshotIds],
    affectedProperties: [...rule.affectedProperties],
  }));
}

export function toWtfContainerQueryInfo(
  capture: EnvironmentCapture,
  resolveStableId: (sourceNodeId: string) => string | undefined,
): WtfContainerQueryInfo[] {
  const containerBySource = new Map(capture.containers.map((item) => [item.sourceNodeId, item]));
  return capture.containerQueries.map((query) => {
    const stableIds = uniqueSorted(
      query.affectedSourceNodeIds.flatMap((sourceNodeId) => {
        const stableId = resolveStableId(sourceNodeId);
        return stableId ? [stableId] : [];
      }),
    );
    const matchingContainer = [...containerBySource.values()].find((container) =>
      query.containerName ? container.containerName === query.containerName : false,
    );
    return {
      ...(query.containerName ? { containerName: query.containerName } : {}),
      ...(matchingContainer?.containerType ? { containerType: matchingContainer.containerType } : {}),
      conditions: [query.condition],
      affectedStableNodeIds: stableIds,
    };
  });
}

export function summarizeEnvironmentCapture(capture: EnvironmentCapture): EnvironmentCaptureSummary {
  return {
    version: capture.version,
    adapter: capture.adapter,
    mediaRuleCount: capture.mediaRules.length,
    activeMediaRuleCount: capture.mediaRules.filter((item) => item.active).length,
    containerCount: capture.containers.length,
    containerQueryCount: capture.containerQueries.length,
    diagnosticCount: capture.diagnostics.length,
  };
}

export function isEnvironmentCapture(value: unknown): value is EnvironmentCapture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.version !== ENVIRONMENT_CAPTURE_VERSION ||
    (record.adapter !== "standard" && record.adapter !== "cdp") ||
    typeof record.snapshotId !== "string" ||
    !record.snapshotId ||
    !Array.isArray(record.mediaRules) ||
    !Array.isArray(record.containers) ||
    !Array.isArray(record.containerQueries) ||
    !Array.isArray(record.diagnostics)
  ) {
    return false;
  }
  try {
    createEnvironmentCapture(record as unknown as CreateEnvironmentCaptureInput);
    return true;
  } catch {
    return false;
  }
}
