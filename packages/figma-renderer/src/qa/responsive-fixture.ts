import type { W2fResponsiveQaCheck, W2fResponsiveQaInput } from "./node30-types.js";

export type W2fResponsiveFixtureSizing = "FILL" | "HUG" | "FIXED";
export type W2fResponsiveFixtureLayoutMode = "HORIZONTAL" | "VERTICAL" | "GRID" | "NONE";

export interface W2fResponsiveFixtureNodeState {
  viewportId: string;
  nodeId: string;
  visible: boolean;
  horizontalSizing?: W2fResponsiveFixtureSizing;
  verticalSizing?: W2fResponsiveFixtureSizing;
  layoutMode?: W2fResponsiveFixtureLayoutMode;
  rowGap?: number;
  columnGap?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  order?: number;
  gridColumnCount?: number;
  constraintSignature?: string;
  containerQuerySignature?: string;
}

export interface W2fResponsiveFixtureComparisonInput {
  expected: readonly W2fResponsiveFixtureNodeState[];
  observed: readonly W2fResponsiveFixtureNodeState[];
}

function key(state: W2fResponsiveFixtureNodeState): string {
  return `${state.viewportId}\u0000${state.nodeId}`;
}

function equalNumber(expected: number | undefined, observed: number | undefined): boolean {
  if (expected === undefined) return true;
  return observed !== undefined && Math.abs(expected - observed) <= 0.001;
}

function addCheck(
  checks: W2fResponsiveQaCheck[],
  id: string,
  domain: W2fResponsiveQaCheck["domain"],
  expected: unknown,
  observed: unknown,
): void {
  if (expected === undefined) return;
  checks.push({ id, domain, matched: Object.is(expected, observed) ? 1 : 0, total: 1 });
}

function addNumberCheck(
  checks: W2fResponsiveQaCheck[],
  id: string,
  domain: W2fResponsiveQaCheck["domain"],
  expected: number | undefined,
  observed: number | undefined,
): void {
  if (expected === undefined) return;
  checks.push({ id, domain, matched: equalNumber(expected, observed) ? 1 : 0, total: 1 });
}

export function responsiveChecksFromFixture(
  input: W2fResponsiveFixtureComparisonInput,
): W2fResponsiveQaInput {
  const observedByKey = new Map(input.observed.map((state) => [key(state), state]));
  const checks: W2fResponsiveQaCheck[] = [];

  for (const expected of input.expected) {
    const observed = observedByKey.get(key(expected));
    const prefix = `${expected.viewportId}/${expected.nodeId}`;
    if (!observed) {
      checks.push({ id: `${prefix}/missing`, domain: "layout", matched: 0, total: 1 });
      continue;
    }

    addCheck(checks, `${prefix}/visible`, "breakpoints", expected.visible, observed.visible);
    addCheck(
      checks,
      `${prefix}/horizontal-sizing`,
      "sizing",
      expected.horizontalSizing,
      observed.horizontalSizing,
    );
    addCheck(
      checks,
      `${prefix}/vertical-sizing`,
      "sizing",
      expected.verticalSizing,
      observed.verticalSizing,
    );
    addCheck(checks, `${prefix}/layout-mode`, "layout", expected.layoutMode, observed.layoutMode);
    addNumberCheck(checks, `${prefix}/row-gap`, "spacing", expected.rowGap, observed.rowGap);
    addNumberCheck(checks, `${prefix}/column-gap`, "spacing", expected.columnGap, observed.columnGap);
    addNumberCheck(checks, `${prefix}/padding-top`, "spacing", expected.paddingTop, observed.paddingTop);
    addNumberCheck(checks, `${prefix}/padding-right`, "spacing", expected.paddingRight, observed.paddingRight);
    addNumberCheck(checks, `${prefix}/padding-bottom`, "spacing", expected.paddingBottom, observed.paddingBottom);
    addNumberCheck(checks, `${prefix}/padding-left`, "spacing", expected.paddingLeft, observed.paddingLeft);
    addNumberCheck(checks, `${prefix}/min-width`, "min-max", expected.minWidth, observed.minWidth);
    addNumberCheck(checks, `${prefix}/max-width`, "min-max", expected.maxWidth, observed.maxWidth);
    addNumberCheck(checks, `${prefix}/min-height`, "min-max", expected.minHeight, observed.minHeight);
    addNumberCheck(checks, `${prefix}/max-height`, "min-max", expected.maxHeight, observed.maxHeight);
    addNumberCheck(checks, `${prefix}/order`, "layout", expected.order, observed.order);
    addNumberCheck(
      checks,
      `${prefix}/grid-columns`,
      "layout",
      expected.gridColumnCount,
      observed.gridColumnCount,
    );
    addCheck(
      checks,
      `${prefix}/constraints`,
      "constraints",
      expected.constraintSignature,
      observed.constraintSignature,
    );
    addCheck(
      checks,
      `${prefix}/container-query`,
      "breakpoints",
      expected.containerQuerySignature,
      observed.containerQuerySignature,
    );
  }

  return { checks };
}
