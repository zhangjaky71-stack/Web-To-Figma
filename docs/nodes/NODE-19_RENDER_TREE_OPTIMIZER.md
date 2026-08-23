# NODE-19 — Render Tree Optimizer

## Goal

Transform captured Source/Composed Tree evidence into a deterministic, renderer-facing `WtfRenderTree` while preserving every behaviorally meaningful boundary and complete source traceability.

## Delivered scope

- dedicated `@w2f/render-tree-optimizer` workspace package;
- Composed Tree first parent resolution with Source Tree fallback and cycle repair;
- conservative single-child wrapper folding;
- semantic, accessibility, table, flex/grid, absolute, scroll, clip, stacking and paint-boundary preservation;
- folded-source aggregation into `WtfRenderNode.sourceNodeIds`;
- reuse of NODE-04 stable identity for `sourceStableIds` and deterministic RenderNode IDs;
- deterministic StructuralFingerprint generation;
- repeated structural component candidate groups independent from copy changes;
- deterministic revision hashes for content/geometry/layout/paint/hierarchy;
- semantic and conservative visual section outline generation;
- Browser runtime that consumes persisted Raw/CSS/Layout/Table sidecars only;
- dedicated IndexedDB render-tree sidecar;
- capture receipt summary metrics and cleanup integration;
- Standard/High Fidelity package validation;
- permanent foundation guardrail and normative contract documentation.

## Safety boundary

Wrapper removal fails closed. A wrapper remains whenever the optimizer cannot prove that it has no semantic, layout, paint, clip, stacking, scroll, position or table responsibility.

NODE-19 does not decide final raster/compositing fallback. NODE-20 owns that boundary.

## Validation

Required Exit Gate:

```text
pnpm validate:foundation
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The final candidate must pass the normal read-only frozen-lockfile CI on its exact head before merge.
