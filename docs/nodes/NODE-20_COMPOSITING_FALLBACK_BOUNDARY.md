# NODE-20 — Compositing & Fallback Boundary

## Goal

Compute deterministic compositing dependencies and the smallest safe raster fallback subtree over the NODE-19 Render Tree.

## Delivered scope

- dedicated `@w2f/compositing-engine` package;
- blend/backdrop dependency analysis;
- filter/mask/multi-child opacity group flattening promotion;
- isolation stop boundaries;
- local Canvas/video/existing raster/unsupported seeds;
- deterministic nested-boundary merging;
- promotion reasons, trigger IDs, effects, confidence and source references;
- Render Tree strategy update without hierarchy mutation;
- Browser runtime consuming the persisted Render Tree only;
- dedicated IndexedDB compositing sidecar;
- capture receipt metrics and cleanup integration;
- Standard and High Fidelity package validation;
- permanent foundation guardrail.

## Boundaries

NODE-20 is not the Figma Capability Resolver. Filters/masks are not rasterized merely because they exist; they cause promotion when raster/native splitting would change compositing pixels. NODE-24 determines current Figma capability and NODE-28 materializes hybrid output.

## Exit gate

```text
pnpm validate:foundation
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The final exact PR head must pass the normal frozen-lockfile read-only CI before merge.
