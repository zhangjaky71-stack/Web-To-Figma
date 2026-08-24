import type { WtfRenderNode } from "@w2f/w2f-ir";
import { createPaintRenderPlan, type W2fPaintRenderPlan } from "./paint/index.js";
import { createTextRenderPlan, type W2fTextRenderPlan } from "./text/index.js";

export const W2F_VISUAL_RENDER_PLAN_VERSION = "1.0.0" as const;

export interface W2fVisualRenderPlan {
  version: typeof W2F_VISUAL_RENDER_PLAN_VERSION;
  renderNodeId: string;
  text: W2fTextRenderPlan | null;
  paint: W2fPaintRenderPlan;
}

export function createVisualRenderPlan(node: WtfRenderNode): W2fVisualRenderPlan {
  return {
    version: W2F_VISUAL_RENDER_PLAN_VERSION,
    renderNodeId: node.id,
    text: createTextRenderPlan(node),
    paint: createPaintRenderPlan(node),
  };
}
