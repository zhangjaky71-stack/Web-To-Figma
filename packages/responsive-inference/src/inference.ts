import type {
  WtfResponsiveRange,
  WtfResponsiveRule,
  WtfSizingMode,
} from "@w2f/w2f-ir";
import {
  RESPONSIVE_INFERENCE_VERSION,
  type ResponsiveAxis,
  type ResponsiveBreakpointCandidate,
  type ResponsiveInferenceDiagnostic,
  type ResponsiveInferenceInput,
  type ResponsiveInferenceResult,
  type ResponsiveInferenceSummary,
  type ResponsiveNodeObservation,
  type ResponsiveSizingDecision,
} from "./types.js";

interface RuleValue {
  snapshotId: string;
  width: number;
  value: unknown;
  confidence: number;
  reason: string;
}

interface SizingClassification {
  mode: WtfSizingMode;
  confidence: number;
  reason: string;
}

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function stableValueKey(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" && Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

function normalizedStableConfidence(value: number): number {
  return Number.isFinite(value) ? clampConfidence(value) : 0;
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function buildRanges(values: RuleValue[]): WtfResponsiveRange[] {
  const sorted = [...values].sort((left, right) => left.width - right.width || left.snapshotId.localeCompare(right.snapshotId));
  const ranges: WtfResponsiveRange[] = [];
  let run: RuleValue[] = [];
  let runKey = "";

  const flush = (): void => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run.at(-1);
    if (!first || !last) return;
    ranges.push({
      minWidth: first.width,
      maxWidth: last.width,
      value: first.value,
      snapshotIds: run.map((item) => item.snapshotId),
    });
  };

  for (const item of sorted) {
    const key = stableValueKey(item.value);
    if (run.length === 0 || key === runKey) {
      if (run.length === 0) runKey = key;
      run.push(item);
      continue;
    }
    flush();
    run = [item];
    runKey = key;
  }
  flush();
  return ranges;
}

function ruleFromValues(
  targetStableNodeId: string,
  property: string,
  values: RuleValue[],
  includeConstant: boolean,
  extraReasons: string[] = [],
): WtfResponsiveRule | null {
  if (values.length === 0) return null;
  const uniqueValues = new Set(values.map((item) => stableValueKey(item.value)));
  if (!includeConstant && uniqueValues.size < 2) return null;
  const confidence = clampConfidence(Math.min(...values.map((item) => item.confidence)));
  return {
    targetStableNodeId,
    property,
    ranges: buildRanges(values),
    confidence,
    reasons: uniqueSorted([
      ...values.map((item) => item.reason),
      ...extraReasons,
      uniqueValues.size > 1
        ? "value differs across observed viewport snapshots"
        : "value is consistent across observed viewport snapshots",
    ]),
    sourceRefs: uniqueSorted(values.map((item) => item.snapshotId)),
  };
}

function addObservedBreakpointTransitions(
  targetStableNodeId: string,
  property: string,
  values: RuleValue[],
  map: Map<string, ResponsiveBreakpointCandidate>,
): void {
  const sorted = [...values].sort((left, right) => left.width - right.width || left.snapshotId.localeCompare(right.snapshotId));
  for (let index = 1; index < sorted.length; index += 1) {
    const lower = sorted[index - 1];
    const upper = sorted[index];
    if (!lower || !upper || lower.width === upper.width) continue;
    if (stableValueKey(lower.value) === stableValueKey(upper.value)) continue;
    const key = `${lower.snapshotId}\u0000${upper.snapshotId}`;
    const existing = map.get(key);
    const confidence = clampConfidence(Math.min(lower.confidence, upper.confidence) * 0.9);
    if (existing) {
      existing.affectedStableNodeIds = uniqueSorted([...existing.affectedStableNodeIds, targetStableNodeId]);
      existing.properties = uniqueSorted([...existing.properties, property]);
      existing.confidence = Math.min(existing.confidence, confidence);
      continue;
    }
    map.set(key, {
      lowerSnapshotId: lower.snapshotId,
      upperSnapshotId: upper.snapshotId,
      lowerObservedWidth: lower.width,
      upperObservedWidth: upper.width,
      affectedStableNodeIds: [targetStableNodeId],
      properties: [property],
      source: "observed-transition",
      confidence,
      reasons: [
        "responsive value changes between adjacent observed viewport widths",
        "exact breakpoint remains bounded by the two observations unless authored evidence provides it",
      ],
    });
  }
}

function authoredSizing(
  observation: ResponsiveNodeObservation,
  axis: ResponsiveAxis,
): SizingClassification | null {
  const authored = observation.authored;
  if (!authored) return null;
  const raw = (axis === "width" ? authored.width : authored.height)?.trim().toLowerCase();
  const confidence = normalizedStableConfidence(observation.stableConfidence);
  if (raw) {
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)px$/.test(raw)) {
      return {
        mode: "fixed",
        confidence: clampConfidence(confidence * 0.98),
        reason: `${axis} has an authored absolute px value`,
      };
    }
    if (/^(?:fit-content|max-content|min-content)(?:\(.*\))?$/.test(raw)) {
      return {
        mode: "hug",
        confidence: clampConfidence(confidence * 0.96),
        reason: `${axis} uses an authored intrinsic-content sizing keyword`,
      };
    }
    const percent = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(raw);
    if (percent && Number(percent[1]) >= 95) {
      return {
        mode: "fill",
        confidence: clampConfidence(confidence * 0.93),
        reason: `${axis} uses an authored near-full percentage`,
      };
    }
  }
  if (
    axis === "width" &&
    typeof authored.flexGrow === "number" &&
    Number.isFinite(authored.flexGrow) &&
    authored.flexGrow > 0
  ) {
    return {
      mode: "fill",
      confidence: clampConfidence(confidence * 0.9),
      reason: "positive authored flex-grow provides fill evidence on the inline axis",
    };
  }
  return null;
}

function geometrySizing(
  observations: ResponsiveNodeObservation[],
  axis: ResponsiveAxis,
): SizingClassification | null {
  const eligible = observations.filter(
    (item) => item.present && item.visible && item.bounds && item.parentBounds,
  );
  if (eligible.length < 2) return null;
  const nodeSizes = eligible.map((item) => (axis === "width" ? item.bounds!.width : item.bounds!.height));
  const parentSizes = eligible.map((item) =>
    axis === "width" ? item.parentBounds!.width : item.parentBounds!.height,
  );
  if (![...nodeSizes, ...parentSizes].every(validPositive)) return null;
  const parentDelta = Math.max(...parentSizes) - Math.min(...parentSizes);
  if (parentDelta < 16) return null;
  const nodeDelta = Math.max(...nodeSizes) - Math.min(...nodeSizes);
  const ratios = nodeSizes.map((value, index) => value / (parentSizes[index] ?? value));
  const ratioSpan = Math.max(...ratios) - Math.min(...ratios);
  const minRatio = Math.min(...ratios);
  const stableConfidence = Math.min(...eligible.map((item) => normalizedStableConfidence(item.stableConfidence)));

  if (minRatio >= 0.9 && ratioSpan <= 0.08) {
    return {
      mode: "fill",
      confidence: clampConfidence(stableConfidence * 0.8),
      reason: `${axis} closely tracks changing parent ${axis} across multiple viewports`,
    };
  }
  if (nodeDelta <= 2) {
    return {
      mode: "fixed",
      confidence: clampConfidence(stableConfidence * 0.76),
      reason: `${axis} remains effectively constant while parent ${axis} changes materially`,
    };
  }
  return null;
}

function authoredPropertyValues(
  observations: ResponsiveNodeObservation[],
  property: keyof NonNullable<ResponsiveNodeObservation["authored"]>,
): RuleValue[] {
  return observations.flatMap((observation) => {
    const value = observation.authored?.[property];
    if (value === undefined) return [];
    return [
      {
        snapshotId: observation.snapshotId,
        width: observation.viewportWidth,
        value,
        confidence: clampConfidence(normalizedStableConfidence(observation.stableConfidence) * 0.94),
        reason: `authored ${String(property)} differs by captured responsive context`,
      },
    ];
  });
}

function cssPropertyName(
  property: keyof NonNullable<ResponsiveNodeObservation["authored"]>,
): string {
  const names: Record<string, string> = {
    width: "width",
    height: "height",
    minWidth: "min-width",
    maxWidth: "max-width",
    minHeight: "min-height",
    maxHeight: "max-height",
    display: "display",
    position: "position",
    flexGrow: "flex-grow",
    flexShrink: "flex-shrink",
    flexBasis: "flex-basis",
  };
  return names[String(property)] ?? String(property);
}

function inferSizingForNode(
  stableNodeId: string,
  observations: ResponsiveNodeObservation[],
  axis: ResponsiveAxis,
  diagnostics: ResponsiveInferenceDiagnostic[],
  breakpointMap: Map<string, ResponsiveBreakpointCandidate>,
): { decisions: ResponsiveSizingDecision[]; rule: WtfResponsiveRule | null } {
  const geometry = geometrySizing(observations, axis);
  const values: RuleValue[] = [];
  const grouped = new Map<WtfSizingMode, { snapshotIds: string[]; confidences: number[]; reasons: string[] }>();
  let sawAuthored = false;
  let conflict = false;

  for (const observation of observations) {
    if (!observation.present) continue;
    const authored = authoredSizing(observation, axis);
    if (authored) sawAuthored = true;
    let selected = authored ?? geometry;
    if (authored && geometry && authored.mode !== geometry.mode) {
      conflict = true;
      diagnostics.push({
        code: "RESPONSIVE_INFERENCE_SIZING_CONFLICT",
        message: `Authored ${axis} sizing evidence conflicts with cross-viewport geometry; authored evidence is retained with reduced confidence.`,
        stableNodeId,
        snapshotId: observation.snapshotId,
        property: `sizing.${axis}.mode`,
      });
      selected = {
        ...authored,
        confidence: clampConfidence(authored.confidence * 0.78),
        reason: `${authored.reason}; conflicting geometry evidence lowered confidence`,
      };
    }
    if (!selected) continue;
    const group = grouped.get(selected.mode) ?? { snapshotIds: [], confidences: [], reasons: [] };
    group.snapshotIds.push(observation.snapshotId);
    group.confidences.push(selected.confidence);
    group.reasons.push(selected.reason);
    grouped.set(selected.mode, group);
    values.push({
      snapshotId: observation.snapshotId,
      width: observation.viewportWidth,
      value: selected.mode,
      confidence: selected.confidence,
      reason: selected.reason,
    });
  }

  const decisions: ResponsiveSizingDecision[] = [...grouped.entries()]
    .map(([mode, evidence]) => ({
      stableNodeId,
      axis,
      mode,
      confidence: clampConfidence(Math.min(...evidence.confidences)),
      reasons: uniqueSorted(evidence.reasons),
      snapshotIds: uniqueSorted(evidence.snapshotIds),
      source: sawAuthored ? (geometry ? "combined" : "authored") : geometry ? "geometry" : "insufficient",
    }))
    .sort((left, right) => left.mode.localeCompare(right.mode));

  if (decisions.length === 0) {
    decisions.push({
      stableNodeId,
      axis,
      mode: "unknown",
      confidence: 0,
      reasons: ["insufficient authored or cross-viewport geometry evidence"],
      snapshotIds: uniqueSorted(observations.map((item) => item.snapshotId)),
      source: "insufficient",
    });
  }

  const rule = ruleFromValues(
    stableNodeId,
    `sizing.${axis}.mode`,
    values,
    true,
    conflict ? ["conflicting evidence is represented by reduced confidence"] : [],
  );
  if (rule) addObservedBreakpointTransitions(stableNodeId, rule.property, values, breakpointMap);
  return { decisions, rule };
}

function parseAuthoredMediaBreakpoints(
  input: ResponsiveInferenceInput,
): ResponsiveBreakpointCandidate[] {
  const sortedSnapshots = [...input.snapshots].sort((left, right) => left.viewport.width - right.viewport.width);
  const candidates: ResponsiveBreakpointCandidate[] = [];
  for (const trace of input.mediaRules ?? []) {
    const matches = [...trace.query.matchAll(/(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/gi)];
    for (const match of matches) {
      const boundary = Number(match[1]);
      if (!Number.isFinite(boundary)) continue;
      const lower = [...sortedSnapshots].reverse().find((item) => item.viewport.width < boundary);
      const upper = sortedSnapshots.find((item) => item.viewport.width >= boundary);
      if (!lower || !upper) continue;
      candidates.push({
        lowerSnapshotId: lower.id,
        upperSnapshotId: upper.id,
        lowerObservedWidth: lower.viewport.width,
        upperObservedWidth: upper.viewport.width,
        boundaryWidth: boundary,
        affectedStableNodeIds: [],
        properties: uniqueSorted(trace.affectedProperties),
        source: "authored-media",
        confidence: 0.99,
        reasons: [`authored media query supplies an explicit ${boundary}px viewport boundary`, trace.query],
      });
    }
  }
  return candidates;
}

export function inferResponsiveBehavior(input: ResponsiveInferenceInput): ResponsiveInferenceResult {
  const diagnostics: ResponsiveInferenceDiagnostic[] = [];
  const snapshotById = new Map(input.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  if (snapshotById.size !== input.snapshots.length) {
    throw new TypeError("responsive inference snapshot ids must be unique");
  }
  for (const snapshot of input.snapshots) {
    if (!snapshot.id.trim() || !validPositive(snapshot.viewport.width) || !validPositive(snapshot.viewport.height)) {
      throw new TypeError("responsive inference snapshots require positive viewport dimensions and non-empty ids");
    }
  }

  const observationKeys = new Set<string>();
  const validObservations: ResponsiveNodeObservation[] = [];
  for (const observation of input.observations) {
    const snapshot = snapshotById.get(observation.snapshotId);
    if (!snapshot) {
      diagnostics.push({
        code: "RESPONSIVE_INFERENCE_SNAPSHOT_MISSING",
        message: "Observation references a snapshot not present in the inference input.",
        stableNodeId: observation.stableNodeId,
        snapshotId: observation.snapshotId,
      });
      continue;
    }
    const key = `${observation.snapshotId}\u0000${observation.stableNodeId}`;
    if (observationKeys.has(key)) {
      diagnostics.push({
        code: "RESPONSIVE_INFERENCE_DUPLICATE_OBSERVATION",
        message: "Only one observation per stable node and responsive snapshot is allowed.",
        stableNodeId: observation.stableNodeId,
        snapshotId: observation.snapshotId,
      });
      continue;
    }
    observationKeys.add(key);
    if (Math.abs(snapshot.viewport.width - observation.viewportWidth) > 1) {
      diagnostics.push({
        code: "RESPONSIVE_INFERENCE_VIEWPORT_MISMATCH",
        message: "Observation viewport width does not match its responsive snapshot reference.",
        stableNodeId: observation.stableNodeId,
        snapshotId: observation.snapshotId,
      });
      continue;
    }
    validObservations.push(observation);
  }

  const byStableNode = new Map<string, ResponsiveNodeObservation[]>();
  for (const observation of validObservations) {
    if (!observation.stableNodeId.trim()) continue;
    const list = byStableNode.get(observation.stableNodeId) ?? [];
    list.push(observation);
    byStableNode.set(observation.stableNodeId, list);
  }

  const rules: WtfResponsiveRule[] = [];
  const sizingDecisions: ResponsiveSizingDecision[] = [];
  const breakpointMap = new Map<string, ResponsiveBreakpointCandidate>();
  const authoredProperties: Array<keyof NonNullable<ResponsiveNodeObservation["authored"]>> = [
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "position",
    "flexGrow",
    "flexShrink",
    "flexBasis",
  ];

  for (const [stableNodeId, observations] of [...byStableNode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...observations].sort(
      (left, right) => left.viewportWidth - right.viewportWidth || left.snapshotId.localeCompare(right.snapshotId),
    );
    if (sorted.length < 2) {
      diagnostics.push({
        code: "RESPONSIVE_INFERENCE_INSUFFICIENT_EVIDENCE",
        message: "Cross-snapshot responsive inference requires at least two observations for this stable node.",
        stableNodeId,
      });
    }

    const visibilityValues: RuleValue[] = sorted.map((observation) => ({
      snapshotId: observation.snapshotId,
      width: observation.viewportWidth,
      value: observation.present && observation.visible,
      confidence: clampConfidence(normalizedStableConfidence(observation.stableConfidence) * 0.96),
      reason: "visibility is observed directly in the captured responsive snapshot",
    }));
    const visibilityRule = ruleFromValues(stableNodeId, "visibility", visibilityValues, false);
    if (visibilityRule) {
      rules.push(visibilityRule);
      addObservedBreakpointTransitions(stableNodeId, "visibility", visibilityValues, breakpointMap);
    }

    const displayValues: RuleValue[] = sorted.flatMap((observation) =>
      observation.present && observation.display
        ? [
            {
              snapshotId: observation.snapshotId,
              width: observation.viewportWidth,
              value: observation.display,
              confidence: clampConfidence(normalizedStableConfidence(observation.stableConfidence) * 0.92),
              reason: "computed display differs across captured responsive snapshots",
            },
          ]
        : [],
    );
    const displayRule = ruleFromValues(stableNodeId, "display", displayValues, false);
    if (displayRule) {
      rules.push(displayRule);
      addObservedBreakpointTransitions(stableNodeId, "display", displayValues, breakpointMap);
    }

    for (const property of authoredProperties) {
      const values = authoredPropertyValues(sorted, property);
      const cssProperty = cssPropertyName(property);
      const rule = ruleFromValues(stableNodeId, cssProperty, values, false);
      if (!rule) continue;
      rules.push(rule);
      addObservedBreakpointTransitions(stableNodeId, cssProperty, values, breakpointMap);
    }

    for (const axis of ["width", "height"] as const) {
      const sizing = inferSizingForNode(stableNodeId, sorted, axis, diagnostics, breakpointMap);
      sizingDecisions.push(...sizing.decisions);
      if (sizing.rule) rules.push(sizing.rule);
    }
  }

  const observedBreakpoints = [...breakpointMap.values()];
  const authoredBreakpoints = parseAuthoredMediaBreakpoints(input);
  const breakpointCandidates = [...observedBreakpoints, ...authoredBreakpoints].sort(
    (left, right) =>
      left.lowerObservedWidth - right.lowerObservedWidth ||
      left.upperObservedWidth - right.upperObservedWidth ||
      left.source.localeCompare(right.source),
  );

  rules.sort(
    (left, right) =>
      left.targetStableNodeId.localeCompare(right.targetStableNodeId) ||
      left.property.localeCompare(right.property),
  );
  sizingDecisions.sort(
    (left, right) =>
      left.stableNodeId.localeCompare(right.stableNodeId) ||
      left.axis.localeCompare(right.axis) ||
      left.mode.localeCompare(right.mode),
  );

  return {
    version: RESPONSIVE_INFERENCE_VERSION,
    payload: {
      snapshots: [...input.snapshots].sort(
        (left, right) => left.viewport.width - right.viewport.width || left.id.localeCompare(right.id),
      ),
      rules,
      mediaRules: [...(input.mediaRules ?? [])],
      containerQueries: [...(input.containerQueries ?? [])],
    },
    breakpointCandidates,
    sizingDecisions,
    diagnostics,
  };
}

export function summarizeResponsiveInference(
  result: ResponsiveInferenceResult,
): ResponsiveInferenceSummary {
  return {
    version: result.version,
    snapshotCount: result.payload.snapshots.length,
    ruleCount: result.payload.rules.length,
    breakpointCandidateCount: result.breakpointCandidates.length,
    sizingDecisionCount: result.sizingDecisions.length,
    diagnosticCount: result.diagnostics.length,
  };
}

export function isResponsiveInferenceResult(value: unknown): value is ResponsiveInferenceResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== RESPONSIVE_INFERENCE_VERSION) return false;
  if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) return false;
  const payload = record.payload as Record<string, unknown>;
  return (
    Array.isArray(payload.snapshots) &&
    Array.isArray(payload.rules) &&
    Array.isArray(payload.mediaRules) &&
    Array.isArray(payload.containerQueries) &&
    Array.isArray(record.breakpointCandidates) &&
    Array.isArray(record.sizingDecisions) &&
    Array.isArray(record.diagnostics)
  );
}
