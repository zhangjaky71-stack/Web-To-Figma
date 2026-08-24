import type { WtfColor } from "@w2f/w2f-ir";

export interface W2fColorPlan {
  r: number;
  g: number;
  b: number;
  a: number;
}

function assertChannel(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`W2F_RENDERER_COLOR: ${label} must be a finite value between 0 and 1`);
  }
  return value;
}

export function createColorPlan(color: WtfColor): W2fColorPlan {
  return {
    r: assertChannel(color.r, "r"),
    g: assertChannel(color.g, "g"),
    b: assertChannel(color.b, "b"),
    a: assertChannel(color.a, "a"),
  };
}

export function sameColor(left: W2fColorPlan, right: W2fColorPlan): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}
