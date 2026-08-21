# ADR-0000 — Freeze V2 + V2.1 as the Implementation Baseline

**Status:** Accepted  
**Date:** 2026-08-21  
**Decision owner:** Web-To-Figma project  
**Applies from:** NODE-00

## Context

The project has completed a V2 architecture baseline and a V2.1 addendum covering the schema-sensitive gaps discovered before implementation: Source/Render dual trees, stable identity, responsive snapshots, CSS cascade evidence, Figma capability resolution, Token Graph, Structural Fingerprint, revision metadata, Scroll Root Model, Composed Tree Mapping and geometry precision.

Continuing to redesign the architecture before code exists would increase planning churn without proportional reduction of implementation risk.

The portable export/import package has also been standardized as `.wtf` with MIME `application/x-wtf`.

## Decision

The implementation baseline is frozen as:

`V2 Baseline + V2.1 Addendum + NODE-00 Product/Acceptance Contracts`

Development proceeds through NODE-01 to NODE-31 using that baseline.

A new V3 architecture is not created unless at least one of the following is demonstrated:

1. an implementation blocker that cannot be solved compatibly;
2. a material Chrome/Figma platform or API change;
3. a security requirement incompatible with the existing design;
4. a schema requirement that cannot be introduced through backward-compatible optional/versioned evolution.

Any such change requires a new ADR describing evidence, impact, migration and alternatives.

## Consequences

### Positive

- implementation can start without further architecture churn;
- NODE completion can be judged against stable acceptance contracts;
- Browser and Figma implementations share one `.wtf`/IR contract;
- future improvements default to compatible extensions rather than redesigns.

### Tradeoffs

- some later implementation details may require adapters or compatibility layers;
- not every future convenience feature is incorporated into the initial schema as a first-class P0 feature;
- known limitations must remain visible rather than triggering repeated baseline redesign.

## Related documents

- `docs/PRODUCT_BASELINE_V2.md`
- `docs/ACCEPTANCE_CONTRACT_V2.md`
- `docs/CAPTURE_SEMANTICS.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md`

## Package naming decision

The file extension is `.wtf`.

`W2F` remains an internal/product namespace and may continue to be used in package/module/diagnostic names.
