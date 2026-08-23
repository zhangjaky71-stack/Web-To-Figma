# Responsive Inference V2

## Purpose

NODE-16 converts NODE-15 multi-viewport capture evidence into deterministic, explainable responsive rules while preserving the frozen W2F Schema/IR V2 contracts.

NODE-16 is an inference node. It does not recapture the page, mutate browser state, build the base render tree, or render Figma nodes.

## Frozen inputs

NODE-16 consumes persisted NODE-15 evidence:

```text
ResponsiveCapture
  ├─ WtfResponsiveSnapshotRef
  ├─ stable-node evidence
  └─ child artifact ids

per child artifact
  ├─ RawSnapshot
  ├─ CssCascadeCapture
  └─ EnvironmentCapture
```

Pixel Ground Truth and AssetCapture remain available downstream but are not required to infer basic responsive rules in NODE-16.

## Frozen output vocabulary

W2F IR V2 already defines:

```text
WtfResponsiveSnapshotRef
WtfResponsiveRange
WtfResponsiveRule
WtfMediaRuleTrace
WtfContainerQueryInfo
WtfResponsivePayload
WtfSizingMode
```

`WtfSizingMode` remains:

```text
fill
hug
fixed
intrinsic
content
unknown
```

NODE-16 does not version-bump W2F Schema or W2F IR.

## Sidecar

NODE-16 adds an additive implementation sidecar:

```text
ResponsiveInferenceResult 1.0.0
```

It contains:

- frozen `WtfResponsivePayload`;
- breakpoint candidates;
- width/height sizing decisions;
- inference diagnostics.

The sidecar is persisted separately from NODE-15 raw capture evidence.

## Stable identity join

Stable Node ID is the primary cross-snapshot join key.

The Browser bridge builds the union of all stable IDs observed across NODE-15 snapshots. For every snapshot and every union stable ID it materializes one observation.

If a stable node is absent from a snapshot, the observation is explicit:

```text
present = false
visible = false
```

This avoids silently dropping evidence needed to infer desktop-only/mobile-only visibility transitions.

Capture-local node ids are never used as the cross-snapshot join key.

## Observation model

Per stable node and snapshot NODE-16 records:

```text
snapshot id
stable id + confidence
viewport width / height
present
visible
bounds
parent stable id
parent bounds
computed display
authored width/height/min/max/display/position/flex sizing evidence
```

The Browser bridge reads persisted child sidecars only. It does not touch the live page.

## Evidence precedence

Responsive inference uses two evidence layers.

### Layer A — authored evidence

Higher-value evidence includes:

- explicit `px` width/height;
- `%` width/height;
- intrinsic sizing keywords such as `fit-content`, `min-content`, `max-content`;
- flex-grow/flex-basis semantics;
- authored media-query boundaries;
- container-query conditions.

### Layer B — cross-viewport geometry

Geometry is used only when at least two comparable observations exist and the relevant parent dimension changes materially.

Geometry may support:

- fill: node dimension closely tracks the changing parent dimension;
- fixed: node dimension stays effectively constant while parent dimension changes materially.

Geometry alone does not prove `hug` because content measurement and base layout semantics belong to later layout analysis.

## FILL / HUG / FIXED

Initial deterministic rules:

### Fixed

Strong authored evidence:

```text
width: Npx
height: Npx
```

Geometry fallback:

```text
parent dimension changes materially
node dimension remains effectively constant
```

### Fill

Strong authored evidence:

```text
near-full percentage sizing
positive flex-grow on the inline axis
```

Geometry fallback:

```text
node dimension remains close to parent dimension
ratio is stable while parent dimension changes
```

### Hug

Strong authored evidence:

```text
fit-content
min-content
max-content
```

### Unknown

When authored evidence is absent and geometry is insufficient or ambiguous:

```text
mode = unknown
confidence = 0
```

NODE-16 never fabricates a sizing mode only to avoid `unknown`.

## Authored / geometry conflicts

When authored evidence and geometry imply different sizing modes:

- authored evidence is retained;
- confidence is reduced;
- `RESPONSIVE_INFERENCE_SIZING_CONFLICT` is emitted;
- reasons explicitly include the conflict.

Conflicting evidence is not silently resolved as high confidence.

## Responsive property rules

NODE-16 emits a `WtfResponsiveRule` only when there is evidence for the property.

Initial properties include:

```text
visibility
display
width
height
min-width
max-width
min-height
max-height
position
flex-grow
flex-shrink
flex-basis
sizing.width.mode
sizing.height.mode
```

Rules contain:

```text
targetStableNodeId
property
ranges
confidence
reasons
sourceRefs
```

Repeated equal values across adjacent observed widths are coalesced into deterministic ranges.

## Breakpoint semantics

### Observed transition interval

When two adjacent captured widths differ for a property, NODE-16 can only prove:

```text
change occurred somewhere between lowerObservedWidth and upperObservedWidth
```

Example:

```text
390 snapshot: nav hidden
768 snapshot: nav visible
```

The result is an observed interval:

```text
390 < breakpoint <= 768
```

The engine does **not** invent `579`, `580`, the midpoint, or any other exact breakpoint.

Observed candidates therefore omit `boundaryWidth`.

### Authored media breakpoint

If EnvironmentCapture preserves an authored query such as:

```text
(max-width: 640px)
```

NODE-16 can preserve:

```text
boundaryWidth = 640
source = authored-media
```

This exact boundary is separate from sampled transition evidence.

## Container queries

Container-query evidence remains `WtfContainerQueryInfo` and is mapped from capture-local affected source nodes to Stable Node IDs where available.

Container query conditions are **not** converted into viewport breakpoint widths.

A condition such as:

```text
(min-width: 600px)
```

may refer to a named/implicit container, not the browser viewport. Treating it as a viewport breakpoint would be semantically incorrect.

## Media rule aggregation

EnvironmentCapture media evidence is aggregated by query across responsive snapshots:

```text
query
activeInSnapshotIds
affectedProperties
```

The original query text is preserved.

## Confidence

Confidence is bounded to `0..1` and derives from evidence quality.

General ordering:

```text
explicit authored boundary > authored sizing > direct observed visibility > geometry fallback > insufficient evidence
```

Stable Identity confidence limits the maximum confidence of node-level inferred behavior.

## Diagnostics

NODE-16 uses fail-visible diagnostics including:

```text
RESPONSIVE_INFERENCE_INPUT_INVALID
RESPONSIVE_INFERENCE_SNAPSHOT_MISSING
RESPONSIVE_INFERENCE_VIEWPORT_MISMATCH
RESPONSIVE_INFERENCE_DUPLICATE_OBSERVATION
RESPONSIVE_INFERENCE_INSUFFICIENT_EVIDENCE
RESPONSIVE_INFERENCE_SIZING_CONFLICT
RESPONSIVE_INFERENCE_PARENT_EVIDENCE_MISSING
RESPONSIVE_INFERENCE_RULE_CONFLICT
```

## Persistence

Browser sidecar persistence:

```text
Database: w2f-responsive-inference
Store: captures
Key: responsive-inference:<jobId>
```

The responsive job receipt exposes:

```text
inferenceStorageKey
responsiveRuleCount
breakpointCandidateCount
responsiveSizingDecisionCount
responsiveInferenceDiagnosticCount
```

## Transaction boundary

Responsive capture remains the parent transaction.

After NODE-15 finishes writing `ResponsiveCapture`, NODE-16:

1. reads the persisted parent capture;
2. reads each child RawSnapshot/CSS/Environment sidecar;
3. builds the union Stable-ID observation matrix;
4. runs pure inference;
5. persists `ResponsiveInferenceResult`;
6. completes the responsive job receipt.

If inference fails, responsive transaction cleanup removes the inference sidecar and all parent/child responsive capture artifacts.

## Privacy and non-mutation

NODE-16 does not read:

- cookies;
- localStorage;
- sessionStorage;
- form runtime text values.

NODE-16 does not:

- resize the browser window;
- change device metrics;
- scroll the page;
- execute page scripts for inference;
- make network requests.

It works from already captured evidence.

## Determinism

Given the same normalized input evidence, NODE-16 produces deterministically ordered:

- snapshots;
- responsive rules;
- rule ranges;
- breakpoint candidates;
- sizing decisions.

No random values, current timestamps, sampling jitter or midpoint breakpoint guesses participate in inference.

## Downstream ownership

`NODE-17` owns Base Layout Analyzer decisions and the base render/layout tree. NODE-16 must not replace that analyzer with cross-snapshot geometry heuristics.

`NODE-21` serializes the frozen responsive payload and related evidence into the final `.wtf` package.

`NODE-27` consumes responsive rules/sizing evidence to implement Figma responsive layout behavior.

## Explicit non-goals

NODE-16 does not implement:

- base flex/grid/table/flow render-tree analysis;
- table semantics;
- render-tree optimization;
- compositing fallback boundaries;
- `.wtf` archive serialization;
- Figma layout rendering;
- final pixel-diff QA.
