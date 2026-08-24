# ADR-0025 — Transactional Basic Figma Renderer

- **Status:** Accepted
- **Date:** 2026-08-24
- **Scope:** NODE-25 — Basic Figma Renderer

## Context

NODE-23 establishes a hostile-file trust boundary and NODE-24 resolves Figma capability policy. NODE-25 is the first stage that mutates a real Figma document.

A renderer failure after creating only part of a hierarchy would otherwise leave user files polluted with incomplete nodes. At the same time, binding renderer logic directly to the global `figma` object would make deterministic unit/contract testing difficult and would scatter platform concerns through reconstruction logic.

The frozen V2 scope for NODE-25 is limited to root, frames, hierarchy, geometry, naming, pluginData and z-order. Text/fonts/assets/paint, responsive layout and raster fallback remain NODE-26/27/28.

## Decision

### 1. Split planning from mutation

`packages/figma-renderer` is platform independent.

The planner consumes validated W2F Render Tree / Source Graph evidence and emits deterministic basic scene instructions. It validates hierarchy and geometry before any mutation.

The transaction consumes those instructions through `W2fBasicFigmaAdapter<TNode>`.

The real plugin implements that adapter in `apps/figma-plugin/src/figma-basic-adapter.ts`.

### 2. Use a transactional root

Every real import begins by creating a frame named:

```text
__W2F_IMPORTING__
```

All newly created scene nodes belong to that root. If rendering or final validation fails, the root is removed. On success, the same root is finalized, renamed, marked committed, selected and focused.

This makes rollback proportional to one root deletion and prevents half-imported pages.

### 3. Preserve Render Tree order

`childIds` order is authoritative sibling order. Children are created/appended deterministically in that order so Figma z-order matches the validated Render Tree.

### 4. Convert page coordinates to parent-local coordinates

W2F geometry remains double-precision page geometry. Figma children use coordinates local to their parent.

NODE-25 therefore computes:

```text
localX = childAbsoluteX - parentAbsoluteX
localY = childAbsoluteY - parentAbsoluteY
```

No capture geometry is rounded in the planner. Any platform minimum-size accommodation happens only at the concrete Figma adapter boundary.

### 5. Keep pluginData compact

Created nodes store identity/debug/sync metadata such as render node id, source ids, stable ids, render strategy and revision hashes. The complete W2F IR is not copied into pluginData.

Root metadata additionally carries document/capture/revision identity, token policy, RenderProfile and transaction state.

### 6. Do not re-resolve NODE-24 policy

NODE-25 carries RenderProfile/render-strategy evidence forward but does not duplicate the Capability Registry or choose responsive/paint/raster strategies. Later renderers consume the same policy boundary.

### 7. Basic placeholder nodes are neutral

Frame-like hierarchy nodes become Figma frames. Basic leaf nodes become neutral rectangles with no default fills/strokes. NODE-26 enriches text/assets/paint rather than NODE-25 fabricating visual fidelity.

## Consequences

- Unit tests can run against an in-memory adapter without Figma.
- Malformed trees fail before mutation.
- Runtime adapter failures roll back the whole import root.
- Whole-page imports avoid a permanent extra wrapper by mapping the transaction root to the Render Tree root.
- Selected-section imports may require one synthetic transaction root to safely hold multiple selected roots.
- NODE-26 can build on a deterministic, source-mapped scene graph instead of re-solving hierarchy and geometry.

## Non-goals

NODE-25 does not implement fonts, text runs, images, SVG, fills, gradients, borders, shadows, masks, Auto Layout, Grid, FILL/HUG/FIXED sizing, constraints or raster fallback.
