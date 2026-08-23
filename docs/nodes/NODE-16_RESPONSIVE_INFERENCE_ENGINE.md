# NODE-16 — Responsive Inference Engine

## Status

**IMPLEMENTATION IN PROGRESS — Browser integration and formal Exit Gate pending**

## Entry baseline

Merged NODE-15 `main` commit:

```text
68cfbeacff1d4dacc958fe0b6bb8a8d797a7efe7
```

Working branch:

```text
feat/node-16-responsive-inference-engine
```

## Goal

Convert NODE-15 multi-viewport evidence into deterministic, confidence-bearing responsive rules while preserving frozen W2F V2 contracts and keeping NODE-17 Base Layout Analyzer ownership intact.

## Delivered so far

### Platform-neutral core

Added:

```text
packages/responsive-inference
@w2f/responsive-inference
```

Sidecar version:

```text
ResponsiveInferenceResult 1.0.0
```

Core capabilities:

- cross-snapshot Stable-ID observation grouping;
- deterministic responsive ranges;
- direct visibility/display transitions;
- authored CSS property transitions;
- FILL/HUG/FIXED/UNKNOWN sizing decisions;
- authored-first, geometry-second evidence precedence;
- visible conflict diagnostics;
- sampled breakpoint intervals;
- explicit authored media breakpoint extraction;
- frozen `WtfResponsivePayload` projection;
- deterministic sorting and summary.

### Breakpoint semantics

Observed changes only produce a lower/upper width interval.

Exact `boundaryWidth` is reserved for authored media-query evidence.

Container-query thresholds are preserved as container-query evidence and are not converted into viewport breakpoints.

### Browser evidence bridge

Added:

```text
apps/browser-extension/src/runtime/responsive-inference-runtime.ts
```

It reads/normalizes persisted NODE-15 child evidence rather than touching the live page.

The bridge creates the union Stable-ID observation matrix. A stable node absent from one viewport is explicitly represented as:

```text
present = false
visible = false
```

It also aggregates:

- winning authored CSS evidence;
- computed display;
- parent Stable-ID/geometry evidence;
- media rule active snapshots/properties;
- container query Stable-ID mappings.

### Browser persistence

Added:

```text
apps/browser-extension/src/runtime/responsive-inference-store.ts
```

IndexedDB contract:

```text
Database: w2f-responsive-inference
Store: captures
Key: responsive-inference:<jobId>
```

### Responsive receipt

Receipt fields prepared:

```text
inferenceStorageKey
responsiveRuleCount
breakpointCandidateCount
responsiveSizingDecisionCount
responsiveInferenceDiagnosticCount
```

### Browser packaging

Browser depends on and packages:

```text
@w2f/responsive-inference
```

Both Standard and High Fidelity builds are configured to require:

```text
validate-node-16-package.mjs
```

### Tests

Core tests cover:

- observed visibility transition without invented exact breakpoint;
- authored fill/fixed/hug classification;
- parent-relative geometry fill/fixed fallback;
- authored/geometry conflict and confidence reduction;
- exact authored media breakpoint preservation;
- malformed/duplicate inference inputs;
- deterministic sorting/summary.

Browser tests cover:

- union Stable-ID missing-node materialization;
- authored CSS evidence extraction;
- media/container aggregation;
- core inference invocation from child evidence;
- dedicated inference store key/namespace.

## Definition of Done

- [x] `@w2f/responsive-inference` package
- [x] `ResponsiveInferenceResult 1.0.0`
- [x] frozen W2F Schema/IR V2 reused
- [x] Stable-ID cross-snapshot join
- [x] explicit absent-node observations
- [x] visibility transition rules
- [x] display/property transition rules
- [x] FILL authored evidence
- [x] HUG authored evidence
- [x] FIXED authored evidence
- [x] geometry fill/fixed fallback
- [x] unknown on insufficient evidence
- [x] authored/geometry conflict diagnostics
- [x] sampled breakpoint intervals
- [x] authored media exact breakpoint preservation
- [x] container query preserved as container semantics
- [x] deterministic responsive ranges
- [x] confidence/reasons/sourceRefs
- [x] Browser child evidence bridge
- [x] Browser inference IndexedDB store
- [x] responsive receipt contract fields
- [x] Browser package dependency
- [x] NODE-16 packaged-output validator
- [x] core tests
- [x] Browser runtime/store tests
- [x] normative Responsive Inference V2 document
- [x] ADR-0016
- [ ] service-worker inference orchestration
- [ ] responsive cleanup includes inference sidecar
- [ ] NODE-16 foundation guardrail
- [ ] guardrail wired into foundation validation
- [ ] authoritative workspace lockfile refreshed
- [ ] canonical formatting PASS
- [ ] complete `pnpm check` PASS
- [ ] Standard package validation PASS
- [ ] High Fidelity package validation PASS
- [ ] temporary bootstrap absent from final tree
- [ ] exact-head read-only frozen-lockfile CI PASS
- [ ] PR ready
- [ ] PR squash merged

## Explicit non-goals

NODE-16 does not build the base layout/render tree, infer table structure, optimize the render tree, choose compositing fallback boundaries, serialize `.wtf`, render Figma nodes, or perform final visual QA.

## Next

```text
NODE-17 — Base Layout Analyzer
```
