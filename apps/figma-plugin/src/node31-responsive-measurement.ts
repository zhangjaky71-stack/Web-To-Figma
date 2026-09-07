import {
  createAutoLayoutPlan,
  createGridLayoutPlan,
  evaluateResponsiveQa,
  type W2fResponsiveQaCheck,
  type W2fResponsiveQaInput,
  type W2fResponsiveQaReport,
  type W2fResponsiveStructuralChangeEvidence,
} from "@w2f/figma-renderer";
import type {
  WtfRenderNode,
  WtfRenderTree,
  WtfResponsivePayload,
  WtfResponsiveRule,
} from "@w2f/w2f-ir";

export interface W2fNode31ResponsiveSceneObservation {
  snapshotId: string;
  viewportWidth: number;
  renderNodeId: string;
  width: number;
  height: number;
  visible: boolean;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  counterAxisSpacing?: number;
  gridColumnGap?: number;
  gridRowGap?: number;
  layoutPositioning?: string;
  constraintsHorizontal?: string;
  constraintsVertical?: string;
}

const EPSILON = 0.75;

function observationKey(snapshotId: string, renderNodeId: string): string {
  return `${snapshotId}\u0000${renderNodeId}`;
}

function canonicalValue(value: unknown): string {
  if (value === undefined) return "<undefined>";
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalValue(nested)}`)
    .join(",")}}`;
}

function scalarMatches(expected: unknown, actual: unknown, tolerance = EPSILON): boolean {
  if (typeof expected === "number" && Number.isFinite(expected)) {
    return (
      typeof actual === "number" &&
      Number.isFinite(actual) &&
      Math.abs(expected - actual) <= tolerance
    );
  }
  return Object.is(expected, actual);
}

function addCheck(
  checks: W2fResponsiveQaCheck[],
  id: string,
  domain: W2fResponsiveQaCheck["domain"],
  expected: unknown,
  actual: unknown,
  tolerance = EPSILON,
): void {
  checks.push({
    id,
    domain,
    matched: scalarMatches(expected, actual, tolerance) ? 1 : 0,
    total: 1,
    detail: `expected ${String(expected)}, observed ${String(actual)}`,
  });
}

function directChildren(
  node: WtfRenderNode,
  nodes: ReadonlyMap<string, WtfRenderNode>,
): WtfRenderNode[] {
  return node.childIds
    .map((id) => nodes.get(id))
    .filter((child): child is WtfRenderNode => Boolean(child));
}

function expectedConstraints(node: WtfRenderNode): {
  horizontal: string;
  vertical: string;
} | null {
  const constraints = node.layout.absoluteConstraints;
  if (!constraints) return null;
  return {
    horizontal:
      constraints.left && constraints.right ? "STRETCH" : constraints.right ? "MAX" : "MIN",
    vertical:
      constraints.top && constraints.bottom ? "STRETCH" : constraints.bottom ? "MAX" : "MIN",
  };
}

function ruleValue(rule: WtfResponsiveRule, snapshotId: string): unknown {
  return rule.ranges.find((range) => range.snapshotIds.includes(snapshotId))?.value;
}

function distinctRuleValues(rule: WtfResponsiveRule, responsive: WtfResponsivePayload): string[] {
  return [
    ...new Set(
      responsive.snapshots
        .map((snapshot) => ruleValue(rule, snapshot.id))
        .filter((value) => value !== undefined)
        .map(canonicalValue),
    ),
  ];
}

function parsePixelValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[1] ?? "NaN");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function figmaSizingMode(value: unknown): "FILL" | "FIXED" | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "fill":
      return "FILL";
    case "fixed":
      return "FIXED";
    default:
      return undefined;
  }
}

function stableRenderNodeMap(renderTree: WtfRenderTree): ReadonlyMap<string, readonly string[]> {
  const mutable = new Map<string, string[]>();
  for (const node of renderTree.nodes) {
    for (const stableId of node.sourceStableIds ?? []) {
      const ids = mutable.get(stableId) ?? [];
      ids.push(node.id);
      mutable.set(stableId, ids);
    }
  }
  return new Map(
    [...mutable.entries()].map(([stableId, ids]) => [stableId, [...new Set(ids)].sort()] as const),
  );
}

function range(values: readonly number[]): number {
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

function addStaticNativeChecks(
  renderTree: WtfRenderTree,
  responsive: WtfResponsivePayload,
  observations: ReadonlyMap<string, W2fNode31ResponsiveSceneObservation>,
  checks: W2fResponsiveQaCheck[],
): void {
  const renderNodes = new Map(renderTree.nodes.map((node) => [node.id, node] as const));

  for (const renderNode of renderTree.nodes) {
    const children = directChildren(renderNode, renderNodes);
    const flexPlan = createAutoLayoutPlan({ container: renderNode, children });
    if (flexPlan) {
      if (!flexPlan.container.nativeCompatible) continue;
      for (const snapshot of responsive.snapshots) {
        const prefix = `${snapshot.id}:${renderNode.id}`;
        const container = observations.get(observationKey(snapshot.id, renderNode.id));
        addCheck(
          checks,
          `${prefix}:layout-mode`,
          "layout",
          flexPlan.container.mode,
          container?.layoutMode,
        );
        addCheck(
          checks,
          `${prefix}:padding-top`,
          "spacing",
          flexPlan.container.padding.top,
          container?.paddingTop,
        );
        addCheck(
          checks,
          `${prefix}:padding-right`,
          "spacing",
          flexPlan.container.padding.right,
          container?.paddingRight,
        );
        addCheck(
          checks,
          `${prefix}:padding-bottom`,
          "spacing",
          flexPlan.container.padding.bottom,
          container?.paddingBottom,
        );
        addCheck(
          checks,
          `${prefix}:padding-left`,
          "spacing",
          flexPlan.container.padding.left,
          container?.paddingLeft,
        );
        addCheck(
          checks,
          `${prefix}:item-spacing`,
          "spacing",
          flexPlan.container.itemSpacing,
          container?.itemSpacing,
        );
        if (flexPlan.container.counterAxisSpacing !== undefined) {
          addCheck(
            checks,
            `${prefix}:counter-axis-spacing`,
            "spacing",
            flexPlan.container.counterAxisSpacing,
            container?.counterAxisSpacing,
          );
        }
        if (renderNode.id !== renderTree.rootId) {
          addCheck(
            checks,
            `${prefix}:container-horizontal-sizing`,
            "sizing",
            flexPlan.container.horizontalSizing,
            container?.layoutSizingHorizontal,
          );
          addCheck(
            checks,
            `${prefix}:container-vertical-sizing`,
            "sizing",
            flexPlan.container.verticalSizing,
            container?.layoutSizingVertical,
          );
        }

        for (const childPlan of flexPlan.children) {
          const child = observations.get(observationKey(snapshot.id, childPlan.renderNodeId));
          const childPrefix = `${snapshot.id}:${childPlan.renderNodeId}`;
          if (childPlan.horizontalSizing !== "HUG") {
            addCheck(
              checks,
              `${childPrefix}:horizontal-sizing`,
              "sizing",
              childPlan.horizontalSizing,
              child?.layoutSizingHorizontal,
            );
          }
          if (childPlan.verticalSizing !== "HUG") {
            addCheck(
              checks,
              `${childPrefix}:vertical-sizing`,
              "sizing",
              childPlan.verticalSizing,
              child?.layoutSizingVertical,
            );
          }
          addCheck(
            checks,
            `${childPrefix}:layout-positioning`,
            "layout",
            childPlan.absolutePositioned ? "ABSOLUTE" : "AUTO",
            child?.layoutPositioning,
          );
          for (const [property, expected, actual] of [
            ["min-width", childPlan.minWidth, child?.minWidth],
            ["max-width", childPlan.maxWidth, child?.maxWidth],
            ["min-height", childPlan.minHeight, child?.minHeight],
            ["max-height", childPlan.maxHeight, child?.maxHeight],
          ] as const) {
            if (expected !== undefined) {
              addCheck(checks, `${childPrefix}:${property}`, "min-max", expected, actual);
            }
          }
          if (childPlan.absolutePositioned) {
            const childRenderNode = renderNodes.get(childPlan.renderNodeId);
            const expected = childRenderNode ? expectedConstraints(childRenderNode) : null;
            if (expected) {
              addCheck(
                checks,
                `${childPrefix}:constraint-horizontal`,
                "constraints",
                expected.horizontal,
                child?.constraintsHorizontal,
              );
              addCheck(
                checks,
                `${childPrefix}:constraint-vertical`,
                "constraints",
                expected.vertical,
                child?.constraintsVertical,
              );
            }
          }
        }
      }

      for (const childPlan of flexPlan.children) {
        if (childPlan.horizontalSizing === "HUG") continue;
        const childWidths: number[] = [];
        const parentWidths: number[] = [];
        for (const snapshot of responsive.snapshots) {
          const child = observations.get(observationKey(snapshot.id, childPlan.renderNodeId));
          const parent = observations.get(observationKey(snapshot.id, renderNode.id));
          if (child && parent) {
            childWidths.push(child.width);
            parentWidths.push(parent.width);
          }
        }
        if (childWidths.length < 2 || range(parentWidths) <= EPSILON) continue;
        const childChanged = range(childWidths) > EPSILON;
        const constrainedFill =
          childPlan.horizontalSizing === "FILL" &&
          (childPlan.minWidth !== undefined || childPlan.maxWidth !== undefined);
        if (constrainedFill) continue;
        checks.push({
          id: `cross-viewport:${renderNode.id}:${childPlan.renderNodeId}:horizontal-${childPlan.horizontalSizing.toLowerCase()}`,
          domain: "sizing",
          matched:
            childPlan.horizontalSizing === "FILL" ? (childChanged ? 1 : 0) : childChanged ? 0 : 1,
          total: 1,
          detail: `parent width range ${range(parentWidths).toFixed(2)}, child width range ${range(childWidths).toFixed(2)}`,
        });
      }
      continue;
    }

    const gridPlan = createGridLayoutPlan({ container: renderNode, children });
    if (!gridPlan?.container.nativeCompatible) continue;
    for (const snapshot of responsive.snapshots) {
      const prefix = `${snapshot.id}:${renderNode.id}`;
      const container = observations.get(observationKey(snapshot.id, renderNode.id));
      addCheck(checks, `${prefix}:grid-layout-mode`, "layout", "GRID", container?.layoutMode);
      addCheck(
        checks,
        `${prefix}:grid-column-gap`,
        "spacing",
        gridPlan.container.columnGap,
        container?.gridColumnGap,
      );
      addCheck(
        checks,
        `${prefix}:grid-row-gap`,
        "spacing",
        gridPlan.container.rowGap,
        container?.gridRowGap,
      );
    }
  }
}

function addResponsiveRuleChecks(
  renderTree: WtfRenderTree,
  responsive: WtfResponsivePayload,
  observations: ReadonlyMap<string, W2fNode31ResponsiveSceneObservation>,
  checks: W2fResponsiveQaCheck[],
  structuralChanges: W2fResponsiveStructuralChangeEvidence[],
): void {
  const renderIdsByStableId = stableRenderNodeMap(renderTree);

  for (const rule of responsive.rules) {
    const renderNodeIds = renderIdsByStableId.get(rule.targetStableNodeId) ?? [];
    const values = distinctRuleValues(rule, responsive);
    if (values.length > 1) {
      const mapped = renderNodeIds.length > 0;
      const id = `responsive-rule:${rule.targetStableNodeId}:${rule.property}`;
      checks.push({
        id,
        domain: "breakpoints",
        matched: mapped ? 1 : 0,
        total: 1,
        detail: mapped
          ? "Breakpoint-dependent source behavior is detected and reported as non-executable in native Figma."
          : "Responsive rule target is not mapped to a Figma render node.",
      });
      structuralChanges.push({
        id,
        expected: true,
        detected: true,
        executableInFigma: false,
        reportedWhenNotExecutable: true,
      });
      continue;
    }

    for (const snapshot of responsive.snapshots) {
      const expected = ruleValue(rule, snapshot.id);
      if (expected === undefined) continue;
      for (const renderNodeId of renderNodeIds) {
        const observation = observations.get(observationKey(snapshot.id, renderNodeId));
        const prefix = `${snapshot.id}:${renderNodeId}:rule:${rule.property}`;
        switch (rule.property) {
          case "visibility":
            if (typeof expected === "boolean") {
              addCheck(checks, prefix, "constraints", expected, observation?.visible, 0);
            }
            break;
          case "display":
            if (typeof expected === "string") {
              addCheck(
                checks,
                prefix,
                "constraints",
                expected.trim().toLowerCase() !== "none",
                observation?.visible,
                0,
              );
            }
            break;
          case "sizing.width.mode": {
            const sizing = figmaSizingMode(expected);
            if (sizing) {
              addCheck(checks, prefix, "sizing", sizing, observation?.layoutSizingHorizontal, 0);
            }
            break;
          }
          case "sizing.height.mode": {
            const sizing = figmaSizingMode(expected);
            if (sizing) {
              addCheck(checks, prefix, "sizing", sizing, observation?.layoutSizingVertical, 0);
            }
            break;
          }
          case "width":
          case "height": {
            const pixels = parsePixelValue(expected);
            if (pixels !== undefined) {
              addCheck(
                checks,
                prefix,
                "sizing",
                pixels,
                rule.property === "width" ? observation?.width : observation?.height,
              );
            }
            break;
          }
          case "min-width":
          case "max-width":
          case "min-height":
          case "max-height": {
            const pixels = parsePixelValue(expected);
            if (pixels === undefined) break;
            const actual =
              rule.property === "min-width"
                ? observation?.minWidth
                : rule.property === "max-width"
                  ? observation?.maxWidth
                  : rule.property === "min-height"
                    ? observation?.minHeight
                    : observation?.maxHeight;
            addCheck(checks, prefix, "min-max", pixels, actual);
            break;
          }
        }
      }
      if (renderNodeIds.length === 0) {
        checks.push({
          id: `${prefixMissing(snapshot.id, rule)}`,
          domain:
            rule.property.includes("width") || rule.property.includes("height")
              ? "sizing"
              : "constraints",
          matched: 0,
          total: 1,
          detail: "Responsive stable ID is missing from the canonical render-tree mapping.",
        });
      }
    }
  }

  const snapshotIds = new Set(responsive.snapshots.map((snapshot) => snapshot.id));
  for (const mediaRule of responsive.mediaRules) {
    const active = new Set(mediaRule.activeInSnapshotIds.filter((id) => snapshotIds.has(id)));
    if (active.size === 0 || active.size === snapshotIds.size) continue;
    const id = `media-query:${mediaRule.query}`;
    checks.push({
      id,
      domain: "breakpoints",
      matched: 1,
      total: 1,
      detail: `Authored media query changes across measured snapshots and is reported as non-executable in native Figma: ${mediaRule.affectedProperties.join(", ")}`,
    });
    structuralChanges.push({
      id,
      expected: true,
      detected: true,
      executableInFigma: false,
      reportedWhenNotExecutable: true,
    });
  }
}

function prefixMissing(snapshotId: string, rule: WtfResponsiveRule): string {
  return `${snapshotId}:missing:${rule.targetStableNodeId}:rule:${rule.property}`;
}

export function buildNode31ResponsiveQaInput(
  renderTree: WtfRenderTree,
  responsive: WtfResponsivePayload,
  observations: readonly W2fNode31ResponsiveSceneObservation[],
): W2fResponsiveQaInput {
  const byKey = new Map(
    observations.map((observation) => [
      observationKey(observation.snapshotId, observation.renderNodeId),
      observation,
    ]),
  );
  const checks: W2fResponsiveQaCheck[] = [];
  const structuralChanges: W2fResponsiveStructuralChangeEvidence[] = [];

  if (responsive.snapshots.length > 0) {
    addStaticNativeChecks(renderTree, responsive, byKey, checks);
    addResponsiveRuleChecks(renderTree, responsive, byKey, checks, structuralChanges);
  }

  const requiredDomains = [...new Set(checks.map((check) => check.domain))];
  return { checks, structuralChanges, requiredDomains };
}

export function evaluateNode31DesktopResponsiveQa(
  renderTree: WtfRenderTree,
  responsive: WtfResponsivePayload,
  observations: readonly W2fNode31ResponsiveSceneObservation[],
): W2fResponsiveQaReport {
  return evaluateResponsiveQa(buildNode31ResponsiveQaInput(renderTree, responsive, observations));
}
