# ADR-0020 — Minimal safe fallback boundary

## Status

Accepted for NODE-20.

## Context

Rasterizing the smallest unsupported DOM node is unsafe when CSS compositing makes its final pixels depend on siblings, ancestor backgrounds, masks, filters or group opacity. Rasterizing a large ancestor by default destroys editability.

## Decision

NODE-20 separates local fallback detection from compositing promotion.

Independent raster seeds stay local. Backdrop-dependent blend/backdrop effects promote to the nearest subtree containing the required backdrop. A descendant fallback inside a filter, mask or multi-child opacity group promotes to that effect owner because split rendering would change final pixels. Promotion repeats until stable, and nested candidates merge under the outer required boundary.

`isolation:isolate` is a backdrop dependency stop boundary.

Every promotion is explainable through trigger node IDs, effects, reasons, confidence and source references. Only the fallback root receives `renderStrategy = raster`; NODE-19 hierarchy is preserved.

NODE-20 does not decide whether current Figma supports a particular filter or mask. Capability resolution remains NODE-24.

## Consequences

- unsupported Canvas/WebGL-like regions can remain small and editable surroundings remain native;
- blending and backdrop effects cannot be incorrectly separated from required background pixels;
- nested filter/mask/opacity groups preserve browser compositing semantics;
- downstream packager and renderer receive explicit deterministic fallback boundaries.
