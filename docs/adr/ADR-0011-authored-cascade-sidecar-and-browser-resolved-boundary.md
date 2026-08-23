# ADR-0011 — Authored Cascade Sidecar and Browser-Resolved Boundary

## Status

Accepted for NODE-11.

## Context

NODE-08 through NODE-10 established `RawSnapshot 1.0.0` as the adapter-neutral contract for browser-observed DOM/layout/text/pseudo evidence. The frozen V2/V2.1 architecture also requires authored CSS semantics, Token Graph preservation, `!important`, media provenance and CSS length semantics.

There are two risks if NODE-11 is implemented carelessly.

First, authored cascade data is structurally different from raw browser capture evidence and already has dedicated portable destinations (`source/cascade.json`, `styles.json`, `tokens.json`). Embedding it directly into RawSnapshot would version-bump and blur the stable capture boundary.

Second, Standard CSSOM and CDP expose different levels of authored evidence. Reimplementing the complete browser cascade/variable resolver to force identical exact winners would create a speculative second CSS engine and could silently disagree with Chrome.

## Decision

### 1. Keep authored cascade as a separate sidecar

NODE-11 introduces:

```text
CssCascadeCapture 1.0.0
```

alongside, not inside:

```text
RawSnapshot 1.0.0
```

The sidecar normalizes into existing V2/V2.1 structures for styles, source cascade and Token Graph.

No `.wtf`, schema, IR or RawSnapshot version bump is required.

### 2. Keep the shared cascade engine platform-neutral

`@w2f/css-cascade` performs deterministic normalization, style-record generation, CSS-length semantic parsing and Token Graph building.

DOM/CSSOM and Chrome debugger access remain in adapter/runtime layers.

### 3. Treat browser-computed values as authoritative

NODE-11 preserves authored values and source relations, but it does not implement a complete CSS variable resolver or replace Chrome's computed result.

Variable cycles, fallbacks, inheritance and browser parsing remain grounded in browser-observed computed values.

### 4. Do not fabricate exact cascade winners

Declaration evidence supports:

```text
winner
overridden
inactive-condition
matched-unresolved
```

`winner` and `overridden` are used only when an acquisition source provides trustworthy exact evidence.

When a rule is known to match but exact winning-source evidence is insufficient, NODE-11 records `matched-unresolved`. The computed value is still preserved; an authored winner is not invented.

### 5. Link Token Graph edges only when safe

Custom-property definitions preserve provenance and aliases where observable.

A `var(--name)` usage is linked to a token definition only when one unambiguous definition is known from the acquisition evidence. Ambiguous/unavailable links remain explicit unresolved usages with diagnostics.

### 6. Standard and CDP acquire evidence differently but normalize identically

Standard profile uses accessible CSSOM/computed-style evidence and remains subject to normal cross-origin CSSOM restrictions.

High Fidelity uses captured backend node IDs with the CDP DOM/CSS domains to request matched/computed styles.

Both produce the same `CssCascadeAcquisition` shape before shared normalization.

### 7. CSS-sidecar fallback does not downgrade successful CDP RawSnapshot capture

If CDP RawSnapshot capture succeeds but later CSS-domain authored acquisition fails, NODE-11 may fall back to Standard CSSOM for the sidecar while retaining the successful CDP RawSnapshot and screenshot.

The receipt exposes the actual CSS sidecar adapter separately from the RawSnapshot adapter.

### 8. Preserve media provenance but defer environment orchestration

NODE-11 records authored media-condition text and current participation because those are cascade provenance.

NODE-12 owns environment snapshots, media/container/environment evaluation across captures and related orchestration.

### 9. Bound expensive acquisition and report truncation

Standard CSSOM scanning and CDP per-node matched-style collection are bounded. Budget truncation produces explicit diagnostics rather than being presented as complete evidence.

## Consequences

### Positive

- RawSnapshot remains stable and adapter-neutral.
- Existing `.wtf` V2/V2.1 reservations are used as intended.
- Standard and High Fidelity share one downstream cascade/token model.
- Computed values remain browser-grounded.
- Ambiguity is inspectable instead of guessed.
- Token relations are retained when safe without corrupting design-system structure.
- NODE-12 remains a separate environment-capture concern.

### Trade-offs

- Standard mode cannot read cross-origin stylesheet rules that CSSOM blocks.
- `matched-unresolved` means some traces intentionally lack an exact authored winner.
- Conservative token linking can leave usable but ambiguous `var()` usages unresolved.
- High Fidelity matched-style acquisition has extra debugger/runtime cost and is bounded.
- Raw and CSS sidecar adapters can differ after CSS-only fallback, which downstream packaging must preserve.

## Rejected alternatives

### Embed authored cascade into RawSnapshot

Rejected because it breaks the established capture boundary and duplicates portable source-cascade/style/token structures.

### Reimplement the browser cascade to infer every winner

Rejected because it would create a large, fragile second CSS engine and could disagree with the browser that produced the visual result.

### Resolve every token usage by custom-property name alone

Rejected because CSS custom properties are scoped/inherited and duplicate names can represent different definitions. Ambiguous graph edges are worse than explicit unresolved evidence.

### Require High Fidelity for all authored CSS

Rejected because Standard mode must remain useful with least-privilege permissions and accessible CSSOM evidence.

### Downgrade a successful CDP RawSnapshot when only CSS sidecar acquisition fails

Rejected because it discards higher-quality independent evidence for an unrelated secondary acquisition failure.

## Validation

This decision is enforced by:

- `scripts/validate-node-11.mjs`;
- `@w2f/css-cascade` behavior tests;
- Browser CDP normalization/hint tests;
- Standard/High Fidelity package validation;
- separate IndexedDB sidecar persistence;
- final frozen-lockfile standard CI.
