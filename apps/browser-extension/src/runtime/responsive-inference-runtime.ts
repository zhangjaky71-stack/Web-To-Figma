import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture, CssNodeCascadeEvidence } from "@w2f/css-cascade";
import type { EnvironmentCapture } from "@w2f/environment-capture";
import type { ResponsiveCapture, ResponsiveSnapshotEvidence } from "@w2f/responsive-capture";
import {
  inferResponsiveBehavior,
  type ResponsiveAuthoredStyleEvidence,
  type ResponsiveInferenceInput,
  type ResponsiveInferenceResult,
  type ResponsiveNodeObservation,
} from "@w2f/responsive-inference";
import type { WtfContainerQueryInfo, WtfMediaRuleTrace } from "@w2f/w2f-ir";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readEnvironmentCapture } from "./environment-store.js";
import { readResponsiveCapture } from "./responsive-capture-store.js";
import { readRawSnapshot } from "./snapshot-store.js";

export interface ResponsiveInferenceChildEvidence {
  artifactId: string;
  snapshot: RawSnapshot;
  cssCascade: CssCascadeCapture;
  environment: EnvironmentCapture;
}

function traceMap(cascade: CssNodeCascadeEvidence | undefined): Map<string, CssNodeCascadeEvidence["traces"][number]> {
  return new Map((cascade?.traces ?? []).map((trace) => [trace.property.toLowerCase(), trace]));
}

function winningAuthoredValue(
  traces: Map<string, CssNodeCascadeEvidence["traces"][number]>,
  property: string,
): string | undefined {
  const trace = traces.get(property);
  const winner = trace?.candidates.find((candidate) => candidate.status === "winner");
  return winner?.authoredValue;
}

function computedValue(
  traces: Map<string, CssNodeCascadeEvidence["traces"][number]>,
  property: string,
): string | undefined {
  return traces.get(property)?.computedValue;
}

function finiteCssNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function authoredEvidence(
  traces: Map<string, CssNodeCascadeEvidence["traces"][number]>,
): ResponsiveAuthoredStyleEvidence | undefined {
  const width = winningAuthoredValue(traces, "width");
  const height = winningAuthoredValue(traces, "height");
  const minWidth = winningAuthoredValue(traces, "min-width");
  const maxWidth = winningAuthoredValue(traces, "max-width");
  const minHeight = winningAuthoredValue(traces, "min-height");
  const maxHeight = winningAuthoredValue(traces, "max-height");
  const display = winningAuthoredValue(traces, "display");
  const position = winningAuthoredValue(traces, "position");
  const flexGrow = finiteCssNumber(winningAuthoredValue(traces, "flex-grow"));
  const flexShrink = finiteCssNumber(winningAuthoredValue(traces, "flex-shrink"));
  const flexBasis = winningAuthoredValue(traces, "flex-basis");
  const evidence: ResponsiveAuthoredStyleEvidence = {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(minWidth === undefined ? {} : { minWidth }),
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(maxHeight === undefined ? {} : { maxHeight }),
    ...(display === undefined ? {} : { display }),
    ...(position === undefined ? {} : { position }),
    ...(flexGrow === undefined ? {} : { flexGrow }),
    ...(flexShrink === undefined ? {} : { flexShrink }),
    ...(flexBasis === undefined ? {} : { flexBasis }),
  };
  return Object.keys(evidence).length > 0 ? evidence : undefined;
}

function positiveGeometry(node: RawNode | undefined): boolean {
  const bounds = node?.geometry?.bounds;
  return Boolean(bounds && bounds.width > 0 && bounds.height > 0);
}

function nodeVisible(node: RawNode | undefined): boolean {
  if (!node) return false;
  if (node.visibility) return node.visibility.rendered;
  return positiveGeometry(node);
}

function observationFor(
  responsiveSnapshot: ResponsiveSnapshotEvidence,
  child: ResponsiveInferenceChildEvidence,
  stableNodeId: string,
): ResponsiveNodeObservation {
  const stableEvidence = responsiveSnapshot.stableNodes.find(
    (evidence) => evidence.stableNodeId === stableNodeId,
  );
  if (!stableEvidence) {
    return {
      snapshotId: responsiveSnapshot.ref.id,
      stableNodeId,
      stableConfidence: 0,
      viewportWidth: responsiveSnapshot.ref.viewport.width,
      viewportHeight: responsiveSnapshot.ref.viewport.height,
      present: false,
      visible: false,
    };
  }

  const nodeById = new Map(child.snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const node = nodeById.get(stableEvidence.captureNodeId);
  const cascadeById = new Map(
    child.cssCascade.cascade.nodes.map((cascade) => [cascade.sourceNodeId, cascade]),
  );
  const traces = traceMap(cascadeById.get(stableEvidence.captureNodeId));
  const parent = stableEvidence.sourceParentCaptureNodeId
    ? nodeById.get(stableEvidence.sourceParentCaptureNodeId)
    : undefined;
  const display = node?.visibility?.display ?? computedValue(traces, "display");
  const authored = authoredEvidence(traces);

  return {
    snapshotId: responsiveSnapshot.ref.id,
    stableNodeId,
    stableConfidence: stableEvidence.confidence,
    viewportWidth: responsiveSnapshot.ref.viewport.width,
    viewportHeight: responsiveSnapshot.ref.viewport.height,
    present: Boolean(node),
    visible: nodeVisible(node),
    ...(node?.geometry?.bounds ? { bounds: { ...node.geometry.bounds } } : {}),
    ...(stableEvidence.sourceParentStableNodeId
      ? { parentStableNodeId: stableEvidence.sourceParentStableNodeId }
      : {}),
    ...(parent?.geometry?.bounds ? { parentBounds: { ...parent.geometry.bounds } } : {}),
    ...(display === undefined ? {} : { display }),
    ...(authored === undefined ? {} : { authored }),
  };
}

function aggregateMediaRules(
  capture: ResponsiveCapture,
  childByArtifactId: Map<string, ResponsiveInferenceChildEvidence>,
): WtfMediaRuleTrace[] {
  const aggregate = new Map<string, { active: Set<string>; properties: Set<string> }>();
  for (const responsiveSnapshot of capture.snapshots) {
    const environment = childByArtifactId.get(responsiveSnapshot.artifactId)?.environment;
    if (!environment) continue;
    for (const rule of environment.mediaRules) {
      const item = aggregate.get(rule.query) ?? {
        active: new Set<string>(),
        properties: new Set<string>(),
      };
      if (rule.active) item.active.add(responsiveSnapshot.ref.id);
      for (const property of rule.affectedProperties) item.properties.add(property);
      aggregate.set(rule.query, item);
    }
  }
  return [...aggregate.entries()]
    .map(([query, evidence]) => ({
      query,
      activeInSnapshotIds: [...evidence.active].sort(),
      affectedProperties: [...evidence.properties].sort(),
    }))
    .sort((left, right) => left.query.localeCompare(right.query));
}

function aggregateContainerQueries(
  capture: ResponsiveCapture,
  childByArtifactId: Map<string, ResponsiveInferenceChildEvidence>,
): WtfContainerQueryInfo[] {
  const aggregate = new Map<
    string,
    {
      containerName?: string;
      containerType?: string;
      conditions: Set<string>;
      affectedStableNodeIds: Set<string>;
    }
  >();

  for (const responsiveSnapshot of capture.snapshots) {
    const child = childByArtifactId.get(responsiveSnapshot.artifactId);
    if (!child) continue;
    const stableByCaptureNodeId = new Map(
      responsiveSnapshot.stableNodes.map((evidence) => [evidence.captureNodeId, evidence.stableNodeId]),
    );
    for (const query of child.environment.containerQueries) {
      const container = query.containerSourceNodeId
        ? child.environment.containers.find(
            (candidate) => candidate.sourceNodeId === query.containerSourceNodeId,
          )
        : child.environment.containers.find(
            (candidate) => candidate.containerName && candidate.containerName === query.containerName,
          );
      const key = `${query.containerName ?? ""}\u0000${container?.containerType ?? ""}\u0000${query.condition}`;
      const current = aggregate.get(key) ?? {
        ...(query.containerName ? { containerName: query.containerName } : {}),
        ...(container?.containerType ? { containerType: container.containerType } : {}),
        conditions: new Set<string>(),
        affectedStableNodeIds: new Set<string>(),
      };
      current.conditions.add(query.condition);
      for (const sourceNodeId of query.affectedSourceNodeIds) {
        const stableNodeId = stableByCaptureNodeId.get(sourceNodeId);
        if (stableNodeId) current.affectedStableNodeIds.add(stableNodeId);
      }
      aggregate.set(key, current);
    }
  }

  return [...aggregate.values()]
    .map((item) => ({
      ...(item.containerName ? { containerName: item.containerName } : {}),
      ...(item.containerType ? { containerType: item.containerType } : {}),
      conditions: [...item.conditions].sort(),
      affectedStableNodeIds: [...item.affectedStableNodeIds].sort(),
    }))
    .sort(
      (left, right) =>
        (left.containerName ?? "").localeCompare(right.containerName ?? "") ||
        left.conditions.join("\u0000").localeCompare(right.conditions.join("\u0000")),
    );
}

export function buildResponsiveInferenceInput(
  capture: ResponsiveCapture,
  children: ResponsiveInferenceChildEvidence[],
): ResponsiveInferenceInput {
  const childByArtifactId = new Map(children.map((child) => [child.artifactId, child]));
  const stableNodeIds = new Set<string>();
  for (const responsiveSnapshot of capture.snapshots) {
    for (const evidence of responsiveSnapshot.stableNodes) stableNodeIds.add(evidence.stableNodeId);
  }

  const observations: ResponsiveNodeObservation[] = [];
  for (const responsiveSnapshot of capture.snapshots) {
    const child = childByArtifactId.get(responsiveSnapshot.artifactId);
    if (!child) {
      throw new Error(`Responsive inference child artifact is unavailable: ${responsiveSnapshot.artifactId}`);
    }
    for (const stableNodeId of [...stableNodeIds].sort()) {
      observations.push(observationFor(responsiveSnapshot, child, stableNodeId));
    }
  }

  return {
    snapshots: capture.snapshots.map((snapshot) => snapshot.ref),
    observations,
    mediaRules: aggregateMediaRules(capture, childByArtifactId),
    containerQueries: aggregateContainerQueries(capture, childByArtifactId),
  };
}

export function inferResponsiveCaptureEvidence(
  capture: ResponsiveCapture,
  children: ResponsiveInferenceChildEvidence[],
): ResponsiveInferenceResult {
  return inferResponsiveBehavior(buildResponsiveInferenceInput(capture, children));
}

export async function loadResponsiveInferenceEvidence(
  jobId: string,
): Promise<{ capture: ResponsiveCapture; children: ResponsiveInferenceChildEvidence[] }> {
  const capture = await readResponsiveCapture(jobId);
  if (!capture) throw new Error(`ResponsiveCapture unavailable for inference: ${jobId}`);
  const children: ResponsiveInferenceChildEvidence[] = [];
  for (const responsiveSnapshot of capture.snapshots) {
    const [snapshot, cssCascade, environment] = await Promise.all([
      readRawSnapshot(responsiveSnapshot.artifactId),
      readCssCascadeCapture(responsiveSnapshot.artifactId),
      readEnvironmentCapture(responsiveSnapshot.artifactId),
    ]);
    if (!snapshot || !cssCascade || !environment) {
      throw new Error(
        `Responsive child evidence incomplete for inference: ${responsiveSnapshot.artifactId}`,
      );
    }
    children.push({
      artifactId: responsiveSnapshot.artifactId,
      snapshot,
      cssCascade,
      environment,
    });
  }
  return { capture, children };
}
