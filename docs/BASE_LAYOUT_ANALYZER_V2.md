# Base Layout Analyzer V2

## Status

Normative implementation contract for **NODE-17 — Base Layout Analyzer**.

This document is additive to the frozen V2 Baseline + V2.1 Addendum. It does not change W2F Schema/IR versioning.

## Goal

Convert persisted source geometry and CSS evidence into frozen W2F IR base layout semantics with deterministic decision evidence.

Primary output:

```text
WtfLayoutModel
```

The analyzer preserves editability intent where evidence exists and refuses to fabricate unavailable semantics.

## Inputs

NODE-17 consumes persisted evidence, not the live page:

```text
RawSnapshot
CssCascadeCapture
optional responsive sizing hints
```

The Browser bridge joins capture-local source nodes with winning authored/computed CSS declarations and parent geometry.

## Frozen output vocabulary

NODE-17 reuses W2F IR V2:

```text
WtfLayoutMode
WtfLayoutModel
WtfAxisSizing
WtfSizingDecision
WtfFlexContainerModel
WtfFlexItemModel
WtfGridContainerModel
WtfGridItemModel
WtfAbsoluteConstraints
WtfDecisionEvidence
```

No W2F Schema/IR version bump is permitted.

## Layout mode classification

Active computed `display` and `position` determine the base mode:

- `display:none` -> `none`
- `position:absolute|fixed` -> `absolute`
- `flex|inline-flex` -> `flex`
- `grid|inline-grid` -> `grid`
- `table*` -> `table`
- `contents` -> `contents`
- `inline|inline-block` -> `inline`
- block-like flow displays -> `flow`
- unsupported/ambiguous values -> `unknown`

`position:sticky` remains represented in the `position` field while its active display mode remains flow/flex/grid/etc.

## Sizing evidence precedence

For each axis:

1. authored CSS semantics;
2. high-confidence responsive sizing evidence when compatible;
3. flex item evidence where applicable;
4. parent-relative geometry as a moderate-confidence fallback;
5. `unknown` when insufficient.

Examples:

- authored `320px` -> `fixed`
- authored `100%` -> `fill`
- authored `fit-content` / `min-content` / `max-content` -> `hug`
- authored partial percentage such as `50%` -> **not automatically Fill**
- positive `flex-grow` can provide Fill evidence on the inline axis
- near-parent geometry can provide moderate Fill evidence only

If authored base sizing conflicts with responsive inference, NODE-17 retains authored base semantics, lowers confidence, and emits `LAYOUT_SIZING_CONFLICT`.

## CSS length preservation

Authored length semantics are preserved when possible:

```text
px
%
em
rem
vw/vh/vmin/vmax
keyword
expression
```

Computed pixel values may be attached as `resolvedPx`; they do not replace the authored semantic form.

For example:

```text
authored: calc(100% - 80px)
computed: 1120px
```

remains an expression with `resolvedPx = 1120`.

## Flex semantics

NODE-17 preserves:

```text
flex-direction
flex-wrap
justify-content
align-items
align-content
row-gap
column-gap
flex-grow
flex-shrink
flex-basis
align-self
order
```

Missing evidence is not guessed beyond safe CSS defaults required for a deterministic model.

## Grid semantics

NODE-17 preserves authored grid track expressions rather than flattening them to observed pixels:

```text
grid-template-columns
grid-template-rows
grid-auto-flow
row-gap
column-gap
grid-column-start/end
grid-row-start/end
```

Track syntax such as:

```text
repeat(3, minmax(0, 1fr))
```

is retained as authored structure.

## Absolute constraints

For absolute/fixed nodes NODE-17 preserves authored:

```text
left
right
top
bottom
```

as `WtfAbsoluteConstraints` instead of reducing every node to x/y coordinates.

Geometry remains evidence, not a replacement for constraint semantics.

## Padding / gap / overflow

Computed pixel padding and effective gaps are recorded in `WtfLayoutModel`.

Overflow X/Y are preserved when available.

## Table boundary

NODE-17 may classify table-family display as:

```text
mode = table
```

but **does not reconstruct table row/cell structure**.

It emits:

```text
LAYOUT_TABLE_DEFERRED
```

Detailed table semantics belong to **NODE-18**.

## Determinism

The analyzer:

- has no browser/platform APIs;
- has no network access;
- has no clock/randomness dependency;
- sorts output by source-node id;
- rejects duplicate source-node observations;
- carries confidence/reasons/sourceRefs for decisions.

## Persistence

Browser sidecar:

```text
Database: w2f-layout-analysis
Store: captures
Key: layout-analysis:<jobId>
```

Every persisted RawSnapshot + CssCascadeCapture may produce one BaseLayoutAnalysis sidecar.

Responsive child captures therefore receive their own base-layout sidecars through the same capture path.

## Diagnostics

At minimum:

```text
LAYOUT_DISPLAY_UNKNOWN
LAYOUT_GEOMETRY_MISSING
LAYOUT_TABLE_DEFERRED
LAYOUT_SIZING_CONFLICT
```

Diagnostics remain visible; the analyzer must not silently convert uncertainty into a more confident model.

## Downstream ownership

- **NODE-18** owns table-specific reconstruction.
- **NODE-19** owns render-tree optimization/grouping.
- **NODE-20** owns compositing and fallback boundaries.
- **NODE-21** later serializes the resulting IR/sidecars into `.wtf`.
- **NODE-27** later maps responsive layout semantics into Figma capabilities.

NODE-17 must not absorb these responsibilities.
