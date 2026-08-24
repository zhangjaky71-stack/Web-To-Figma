# ADR-0024 — Figma Capability Resolver Boundary

**Status:** Accepted  
**Date:** 2026-08-24  
**NODE:** 24

## Context

The W2F IR can describe web layout/paint behavior that is not valid in every Figma node or parent context. If NODE-25+ renderers directly branch on Figma API support, platform checks, fallback preferences and profile policy will be duplicated across rendering code and will drift as Figma evolves.

The frozen V2 Baseline therefore requires a dedicated Capability Resolver between Secure Parser/Migration and Figma rendering.

## Decision

Create the platform-independent package:

```text
@w2f/figma-capability-resolver
```

The resolver consumes:

```text
IR feature
+ render-node kind
+ parent/target context
+ versioned Figma capability registry
+ RenderProfile
```

and returns one deterministic policy result:

```text
NATIVE
EMULATED
WRAPPER
ABSOLUTE
RASTER
UNSUPPORTED
```

The corresponding W2F render-strategy value is included in the plan for NODE-25+ consumers.

## Capability Registry

The registry stores platform facts separately from W2F policy. The initial frozen snapshot is:

```text
figma-plugin-api-2026-08-24
@figma/plugin-typings 1.134.0
```

The initial V2 registry covers:

```text
autoLayout
fillSizing
hugSizing
grid
gridSpan
minMaxSizing
svgImport
textMixedStyles
absoluteInAutoLayout
imageTransform
```

Current official Plugin API evidence establishes native Grid Auto Layout, grid row/column spans, FILL/HUG sizing, min/max sizing, SVG import, mixed text-range styles and absolute positioning for Auto Layout children. Image transforms remain `partial` because the available transform behavior is mode-dependent.

A future Figma API change updates a registry snapshot and fixtures; it must not require scattering new renderer conditionals.

## RenderProfile policy

Canonical profiles are:

```text
Fidelity
Balanced
Design Friendly
```

Transport/UI id `high-fidelity` normalizes to canonical `fidelity`.

The registry answers what is possible. RenderProfile answers which safe available strategy is preferred. Fidelity may prefer raster over an editable approximation; Balanced favors safe editable emulation before raster; Design Friendly gives editable strategies the same priority while still respecting hard raster/unsupported safety boundaries produced upstream.

## Metadata invariants

Every resolution plan carries forward:

- stable source IDs;
- revision hashes when present;
- Literal Import token policy by default;
- the exact registry snapshot id;
- deterministic reasons and downgrade evidence.

The resolver must not mutate W2F IR or drop source/revision metadata.

## Hard boundaries

NODE-24:

- does not create Figma nodes;
- does not call `figma.create*` APIs;
- does not load fonts/assets;
- does not execute raster fallback;
- does not visually compare output.

NODE-25+ create the Figma scene. NODE-28 executes hybrid/raster plans. NODE-29+ measure visual/editability quality.

## Consequences

Positive:

- renderer code consumes stable plans instead of platform-condition branches;
- Figma capability changes are versionable/testable;
- downgrade reasons are inspectable by diagnostics/QA;
- RenderProfile behavior is deterministic;
- future feature support can be added without changing the frozen W2F V2 schema.

Tradeoff:

- the registry becomes a maintained compatibility artifact and must be updated when the Plugin API changes materially.
