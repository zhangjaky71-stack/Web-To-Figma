# ADR-0019 — Render Tree boundary and wrapper folding

## Status

Accepted for NODE-19.

## Context

Captured DOM/source structure is not a useful 1:1 Figma layer tree. Source pages frequently contain framework wrappers, slots and anonymous layout containers. Removing them aggressively improves editability but can destroy layout, stacking, clipping, scroll and semantic behavior.

## Decision

NODE-19 builds a deterministic renderer-facing `WtfRenderTree` from persisted Source/Composed Tree, CSS, layout and table evidence.

The optimizer prefers valid `composedParentId` over source-parent structure and folds wrappers only when every required safety condition is proven. Unknown or incomplete evidence preserves the wrapper.

Folded nodes are never discarded from traceability: their source IDs and stable source IDs are attached to the surviving RenderNode.

Structural component candidates are grouped by deterministic `StructuralFingerprint` rather than text equality. Content differences remain in revision hashes.

NODE-19 emits only provisional structural render strategies. Compositing, unsupported-effect handling and raster fallback are explicitly deferred to NODE-20.

## Consequences

- Figma-facing hierarchy is shallower and more meaningful without silently changing behavior.
- Semantic, stacking, clip, scroll, position, flex/grid/table boundaries survive optimization.
- Repeated structures can be identified before final renderer capability resolution.
- Conservative fail-closed behavior may retain extra wrappers when evidence is incomplete; this is preferred to destructive flattening.
- NODE-20 can revise render/compositing strategy without rebuilding source hierarchy.
