# NODE-11 — CSS Cascade & Authored Semantics

## Status

**IN PROGRESS — implementation and controlled final-shape `pnpm check` passed; formal standard read-only frozen-lockfile documentation/status Exit Gate pending**

## Goal

Implement the frozen V2/V2.1 authored CSS semantics layer on top of the browser-observed RawSnapshot evidence from NODE-08 through NODE-10 without reimplementing Chrome's full cascade/variable engine and without pulling NODE-12 environment capture forward.

## Delivered

### Shared platform-neutral cascade package

Added:

```text
packages/css-cascade
@w2f/css-cascade
```

Engine version:

```text
1.0.0
```

The package provides deterministic:

- authored/computed cascade normalization;
- declaration provenance;
- `!important` preservation;
- cascade hashing;
- W2F style-record generation;
- CSS length semantic parsing;
- V2.1 Token Graph building;
- sidecar validation/summarization.

### Stable RawSnapshot boundary

NODE-11 keeps:

```text
RawSnapshot 1.0.0
```

unchanged.

Authored evidence is stored separately as:

```text
CssCascadeCapture 1.0.0
```

matching the existing portable V2/V2.1 destinations:

```text
source/cascade.json
styles.json
tokens.json
```

### Cascade status model

The evidence contract supports:

```text
winner
overridden
inactive-condition
matched-unresolved
```

`matched-unresolved` is used when the browser confirms an authored rule/inline declaration participates as a match but NODE-11 lacks trustworthy exact winning-source evidence.

The shared engine never converts `matched-unresolved` into a fabricated `authoredValue` winner in the generated W2F style record.

### CSS length semantic model

NODE-11 reuses the existing IR `WtfCssLength` model and preserves authored semantics for:

- px;
- percentages;
- em/rem;
- viewport units;
- keywords;
- expressions;
- optional browser-resolved px values.

### Token Graph

NODE-11 materializes the V2.1 Token Graph contract with:

- custom-property definitions;
- deterministic token IDs;
- raw/authored values;
- browser-resolved values where safely available;
- source node / stylesheet / selector provenance;
- inferred token kind;
- aliases/references;
- usages;
- confidence.

A usage is linked only when one unambiguous known definition exists. Ambiguous or unavailable links remain explicit `CssUnresolvedTokenUsage` records plus diagnostics.

### Standard CSSOM acquisition

Added:

```text
packages/standard-capture-adapter/src/cascade-capture.ts
```

The page-side function is self-contained for `chrome.scripting.executeScript` and uses RawSnapshot source hints to resolve captured nodes.

It supports:

- document CSS stylesheets;
- open Shadow DOM style/adopted sheets;
- same-origin iframe document traversal;
- authored `CSSStyleRule` declarations;
- inline declarations;
- media condition provenance and current participation;
- `@supports` participation where available;
- CSS layer text where available;
- declaration source order;
- `!important`;
- computed property values;
- custom-property definitions/usages.

Cross-origin or otherwise unreadable CSSOM is fail-visible through `CSS_STYLESHEET_INACCESSIBLE`.

### CDP High Fidelity acquisition

Added Browser runtime:

```text
apps/browser-extension/src/runtime/css-cascade-runtime.ts
```

For CDP RawSnapshot nodes with backend node IDs it requests:

```text
DOM.pushNodesByBackendIdsToFrontend
CSS.getMatchedStylesForNode
CSS.getComputedStyleForNode
```

The pure `normalizeCdpMatchedStyleAcquisition` path preserves:

- stylesheet IDs;
- selector text;
- authored declarations;
- disabled/parse-state filtering;
- `!important`;
- inherited rules;
- inline/presentational styles;
- media provenance/activity;
- layer text when exposed;
- computed values;
- token evidence.

The debugger session always detaches via `finally`.

If CSS-domain acquisition fails after a successful CDP RawSnapshot, only the CSS sidecar falls back to Standard CSSOM; the successful CDP DOM/screenshot evidence is retained. The RawSnapshot and CSS receipt adapters remain independently inspectable.

### Capture budgets

Standard rule/declaration scanning is bounded.

CDP per-node authored style acquisition is currently capped at:

```text
2500 source nodes
```

Truncation emits:

```text
CSS_CAPTURE_BUDGET_EXCEEDED
```

### Browser sidecar persistence

Added:

```text
apps/browser-extension/src/runtime/css-cascade-store.ts
```

Storage contract:

```text
IndexedDB DB: w2f-css-cascade
Store: captures
Key: css-cascade:<jobId>
```

Job receipts expose:

- CSS sidecar storage key;
- CSS acquisition adapter;
- style count;
- token count;
- CSS diagnostic count.

Cancellation/failure cleanup removes CSS sidecars together with RawSnapshot/screenshot artifacts.

### Browser package integration

`@w2f/css-cascade` is now a Browser runtime package.

Both Standard and High Fidelity extension builds package and validate:

- CSS cascade runtime;
- CSS cascade IndexedDB store;
- compiled shared css-cascade package;
- Standard authored CSS acquisition runtime.

The recursive package validator continues to reject unresolved `@w2f/*` runtime imports.

### Privacy and permissions

NODE-11 does not read:

```text
document.cookie
localStorage
sessionStorage
live input/textarea textual values
```

Standard permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity continues to add only the existing:

```text
debugger
```

No broad host permissions or static content scripts are introduced.

## Behavior tests

Shared package tests cover:

- authored/computed normalization;
- deterministic ordering/hash;
- explicit winner handling;
- multiple-winner rejection;
- `!important` evidence;
- media provenance;
- CSS length semantics;
- Token Graph definitions/usages/aliases;
- unknown token-definition rejection;
- sidecar validation;
- `matched-unresolved` without fabricated winner.

Browser tests cover:

- RawSnapshot to Standard iframe/shadow/pseudo source hints;
- CDP matched-style normalization;
- `!important` preservation;
- media provenance/activity;
- safe token usage linking;
- ambiguous token usage preservation.

## Controlled validation

Initial NODE-11 core bootstrap passed complete `pnpm check` and established the new workspace/lockfile baseline.

The authored acquisition/browser integration bootstrap run:

```text
32617158205
```

ran with the temporary workflow removed from its working tree before validation.

It passed:

- NODE-08/NODE-09/NODE-10/NODE-11/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- workspace lockfile refresh under controlled bootstrap;
- ESLint;
- strict TypeScript typecheck;
- complete Vitest suite;
- Standard Browser build/package validation;
- High Fidelity Browser build/package validation;
- pinned Prettier 3.9.6 format check.

The resulting bot commit after successful validation was:

```text
0473fb18586e458062317a718835d8d7a7eb4b10
```

The temporary NODE-11 runtime bootstrap workflow is absent from that resulting tree.

A standard read-only frozen-lockfile Exit Gate on the complete normative documentation/status head is still required before DONE.

## Definition of Done

- [x] platform-neutral `@w2f/css-cascade` package
- [x] adapter-neutral acquisition/sidecar contracts
- [x] RawSnapshot remains version `1.0.0`
- [x] authored/computed declaration traces
- [x] `!important` preservation
- [x] explicit `matched-unresolved` status
- [x] deterministic cascade hash
- [x] existing IR CSS length semantic model reused
- [x] V2.1 Token Graph materialized
- [x] token alias/reference preservation
- [x] ambiguous token links fail closed
- [x] Standard CSSOM acquisition
- [x] same-origin iframe source-hint integration
- [x] open Shadow DOM authored style acquisition
- [x] Standard media provenance
- [x] CDP matched/computed style acquisition
- [x] CDP backend-node source linkage
- [x] inherited CDP authored evidence
- [x] CSS-only Standard fallback without RawSnapshot downgrade
- [x] acquisition budgets and diagnostics
- [x] Browser IndexedDB CSS sidecar persistence
- [x] job receipt integration
- [x] cancellation/failure sidecar cleanup
- [x] Standard/High Fidelity runtime packaging
- [x] dependency-free NODE-11 guardrail
- [x] shared and Browser behavior tests
- [x] authoritative workspace lockfile refreshed
- [x] temporary write-enabled workflows removed from resulting tree
- [x] controlled final-shape complete `pnpm check` passed
- [x] normative implementation document added
- [x] ADR added
- [ ] formal standard read-only frozen-lockfile docs/status CI passed
- [ ] PR #15 ready for review
- [ ] PR #15 squash merged

## Normative documents

- `docs/CSS_CASCADE_AUTHORED_SEMANTICS_V2.md`;
- `docs/adr/ADR-0011-authored-cascade-sidecar-and-browser-resolved-boundary.md`;
- this node record.

## Explicit non-goals

NODE-11 does not implement:

- complete browser CSS cascade reimplementation;
- complete custom-property resolver reimplementation;
- NODE-12 environment snapshots;
- NODE-12 container/environment query capture;
- multi-viewport responsive orchestration/inference;
- asset resolution;
- final `.wtf` archive packaging;
- Figma rendering.

## Next

After PR #15 squash merge:

```text
NODE-12 — Media / Container / Environment Capture
```
