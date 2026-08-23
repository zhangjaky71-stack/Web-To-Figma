# NODE-17 — Base Layout Analyzer

## Status

**IMPLEMENTATION IN PROGRESS — Browser orchestration and formal Exit Gate pending**

## Entry baseline

Merged NODE-16 `main` commit:

```text
7cfb91fedff68a2e5338c62c0fbd46508bd38ad2
```

Working branch:

```text
feat/node-17-base-layout-analyzer
```

## Goal

Transform persisted RawSnapshot/CSS evidence into deterministic frozen W2F IR base layout models while preserving authored editability intent and keeping later specialized engines separate.

## Delivered so far

### Platform-neutral core

Added:

```text
packages/layout-analyzer
@w2f/layout-analyzer
BaseLayoutAnalysis 1.0.0
```

Core capabilities:

- CSS length semantic preservation + computed `resolvedPx`;
- flow/flex/grid/absolute/table/inline/contents/none/unknown classification;
- width/height sizing decisions;
- authored-first sizing evidence;
- optional responsive sizing corroboration;
- geometry-only moderate Fill fallback;
- partial percentage protection;
- padding/gap/overflow;
- flex container/item semantics;
- grid container/item semantics;
- absolute constraints;
- table deferral diagnostics;
- deterministic source-node ordering and summaries.

### Browser evidence bridge

Added:

```text
apps/browser-extension/src/runtime/layout-analysis-runtime.ts
```

It joins persisted:

```text
RawSnapshot
CssCascadeCapture
```

and never touches the live page.

Winning authored CSS declarations are retained alongside computed values and source references.

### Browser persistence

Added:

```text
apps/browser-extension/src/runtime/layout-analysis-store.ts
```

IndexedDB:

```text
Database: w2f-layout-analysis
Store: captures
Key: layout-analysis:<jobId>
```

### Browser packaging

Browser now depends on and packages:

```text
@w2f/layout-analyzer
```

Both Standard and High Fidelity build paths require:

```text
validate-node-17-package.mjs
```

### Tests

Core tests cover:

- CSS semantic + resolved pixel preservation;
- flex model/padding/gap/overflow;
- authored grid tracks and item placement;
- partial percentage not promoted to Fill;
- absolute constraints;
- table deferral;
- responsive sizing conflict handling;
- deterministic sorting/duplicate rejection/summary.

Browser tests cover:

- RawSnapshot + winning CSS join;
- CSS source reference preservation;
- analyzer invocation without page access;
- dedicated IndexedDB namespace/key.

## Definition of Done

- [x] `@w2f/layout-analyzer` package
- [x] `BaseLayoutAnalysis 1.0.0`
- [x] frozen W2F IR V2 layout vocabulary reused
- [x] layout mode classification
- [x] CSS length semantics/resolvedPx
- [x] FILL/HUG/FIXED/CONTENT/UNKNOWN base sizing decisions
- [x] partial-percentage safety
- [x] responsive sizing corroboration/conflict diagnostic
- [x] padding/gap/overflow
- [x] flex container/item model
- [x] grid container/item model
- [x] absolute constraints
- [x] table classification + NODE-18 deferral
- [x] deterministic analysis/summary
- [x] Browser RawSnapshot/CSS bridge
- [x] Browser IndexedDB store
- [x] Browser package dependency/packager
- [x] Standard/High Fidelity NODE-17 package validator
- [x] core tests
- [x] Browser runtime/store tests
- [x] normative Base Layout Analyzer V2 document
- [x] ADR-0017
- [ ] capture receipt layout metrics
- [ ] service-worker analysis orchestration
- [ ] failure/cancellation layout-sidecar cleanup
- [ ] NODE-17 foundation guardrail
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

## Explicit boundaries

- NODE-18 owns detailed table reconstruction.
- NODE-19 owns render-tree optimization.
- NODE-20 owns compositing/fallback boundaries.
- NODE-21 owns `.wtf` packaging.
- NODE-27 owns Figma responsive layout rendering.

## Next

```text
NODE-18 — Table Layout Engine
```
