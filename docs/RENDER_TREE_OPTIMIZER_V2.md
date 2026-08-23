# Render Tree Optimizer V2

## Purpose

NODE-19 converts captured Source/Composed Tree evidence into the renderer-facing `WtfRenderTree` without changing the frozen W2F IR version.

The optimizer is structural. It does not decide raster fallback, compositing promotion, or final Figma capability mapping. Those decisions remain downstream, beginning with NODE-20.

## Inputs

The optimizer consumes only persisted capture evidence:

- `RawSnapshot` for source/composed hierarchy, geometry, text and scroll roots;
- CSS Cascade evidence for authored/computed paint and stacking boundaries;
- Base Layout Analysis for flow/flex/grid/absolute/table, sizing, padding, clipping and box-model evidence;
- Table Layout Result for explicit table semantic boundaries;
- the existing NODE-04 Stable Identity algorithm for deterministic source identity.

No live DOM, `window`, browser global, network fetch, local storage or random/time-dependent identity is allowed in the core optimizer.

## Parent precedence

Render hierarchy uses this precedence:

1. `relationships.composedParentId` when valid;
2. `relationships.sourceParentId`;
3. captured child-list ownership;
4. capture root as a fail-visible repair.

Cycles or invalid parent references are diagnosed and repaired to a single Render Tree root.

## Wrapper folding

A wrapper may be folded only when safety is proven. Ambiguity fails closed.

A candidate wrapper must be a simple `div`, `span`, slot or shadow-root boundary with exactly one effective child, matching resolved geometry and no independent responsibility.

A wrapper is preserved when it owns or may own any of the following:

- semantic or accessibility boundary;
- table semantics;
- flex/grid/table/absolute layout responsibility;
- flex/grid item responsibility;
- non-static positioning or containing-block behavior;
- padding, border, gap or non-matching geometry;
- scroll-root responsibility;
- overflow/clip boundary;
- background, border, shadow, outline or transform;
- opacity, blend, isolation, filter, backdrop-filter, mask or clip-path;
- z-index / stacking-context evidence.

When folding is safe, all folded source IDs remain in the surviving RenderNode `sourceNodeIds` and stable-source mappings.

## Render node identity

RenderNode IDs are deterministic hashes derived from stable source identities when available, otherwise deterministic source IDs plus structural kind.

No random IDs or capture timestamps participate in RenderNode identity.

## Structural fingerprints

Each meaningful RenderNode receives deterministic structural evidence from:

- semantic kind and source tag/role;
- child render kinds;
- layout mode, sizing modes, padding/gap and flex/grid/absolute evidence;
- paint-boundary evidence that affects structure/stacking.

The resulting `StructuralFingerprint` contains semantic, layout, paint and combined hashes with confidence.

Repeated nodes sharing the same combined structural fingerprint become component candidates only when at least two occurrences exist. Text content is intentionally excluded from structural grouping so repeated cards with different copy can still be recognized as one structural candidate group. Content remains separated in revision hashes.

## Revision hashes

RenderNodes preserve deterministic revision evidence for content, geometry, layout, paint and hierarchy. This enables later incremental/QA workflows without making structural component grouping depend on copy changes.

## Sections

The optimizer builds a meaningful `WtfSectionOutlineItem` list from:

- semantic section tags (`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`);
- conservative large top-level visual sections that contain a heading.

Section inference never removes source mappings.

## Render strategy boundary

NODE-19 may emit only provisional structural strategies such as `native` or `absolute` based on existing layout evidence. This is not a final capability decision.

NODE-20 owns compositing and fallback promotion, including raster boundaries and unsupported native effects. NODE-19 must not rasterize because of visual complexity or mismatch alone.

## Exit criteria

NODE-19 is complete when:

- the core optimizer is deterministic and Browser-global free;
- meaningless wrappers are folded only under strict proof;
- semantic/layout/stacking/clip/scroll/table boundaries are preserved;
- every source node maps to a RenderNode;
- folded source IDs remain traceable;
- StructuralFingerprint candidate groups are deterministic;
- Browser Standard and High Fidelity packages include the optimizer runtime and sidecar;
- exact-head frozen-lockfile CI passes foundation, lint, typecheck, tests, build/package validation and format checks.
