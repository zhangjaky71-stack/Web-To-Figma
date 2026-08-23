# NODE-11 — CSS Cascade & Authored Semantics

## Status

**DONE / PASS — implementation, controlled final-shape validation and formal standard read-only frozen-lockfile documentation/status Exit Gate passed; PR #15 ready to squash merge**

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

The package provides deterministic authored/computed cascade normalization, declaration provenance, `!important`, cascade hashing, W2F style-record generation, CSS length semantics, V2.1 Token Graph building and sidecar validation.

### Stable evidence boundary

NODE-11 keeps:

```text
RawSnapshot 1.0.0
```

unchanged and stores authored evidence separately as:

```text
CssCascadeCapture 1.0.0
```

This maps onto the already frozen V2/V2.1 portable destinations:

```text
source/cascade.json
styles.json
tokens.json
```

No `.wtf`, schema, IR or RawSnapshot version bump was introduced.

### Cascade status model

The evidence contract supports:

```text
winner
overridden
inactive-condition
matched-unresolved
```

`matched-unresolved` preserves browser-confirmed matched authored evidence when exact winning-source evidence is unavailable. The engine preserves the browser-computed result without fabricating an authored winner.

### CSS length semantics

NODE-11 reuses the existing IR `WtfCssLength` model for px, percentage, em/rem, viewport units, keywords, expressions and optional browser-resolved px values.

### Token Graph

NODE-11 materializes V2.1 Token Graph definitions, deterministic IDs, raw/resolved values, provenance, inferred kinds, aliases and usages.

A usage is linked only when one unambiguous definition is known. Ambiguous or unavailable links remain explicit unresolved usage evidence plus diagnostics rather than guessed edges.

### Standard CSSOM acquisition

Added:

```text
packages/standard-capture-adapter/src/cascade-capture.ts
```

The self-contained page-side acquisition supports accessible document stylesheets, open Shadow DOM style/adopted sheets, same-origin iframe traversal, authored rules, inline declarations, media provenance/current participation, `@supports` participation where available, layer evidence, source order, `!important`, computed values and custom properties.

Unreadable cross-origin CSSOM produces explicit `CSS_STYLESHEET_INACCESSIBLE` diagnostics.

### CDP High Fidelity acquisition

Added:

```text
apps/browser-extension/src/runtime/css-cascade-runtime.ts
```

For captured nodes with backend node IDs it requests:

```text
DOM.pushNodesByBackendIdsToFrontend
CSS.getMatchedStylesForNode
CSS.getComputedStyleForNode
```

The shared acquisition model preserves stylesheet IDs, selectors, authored declarations, parse/disabled filtering, `!important`, inherited rules, inline/presentational styles, media/layer provenance, computed values and token evidence.

Debugger attachment is detached through `finally`.

If CSS-domain acquisition fails after a successful CDP RawSnapshot, only the CSS sidecar falls back to Standard CSSOM. Successful CDP DOM/screenshot evidence remains intact; RawSnapshot and CSS adapters remain independently inspectable.

### Budgets and diagnostics

Standard rule/declaration scanning is bounded. CDP authored style collection is currently capped at:

```text
2500 source nodes
```

Budget truncation is fail-visible through:

```text
CSS_CAPTURE_BUDGET_EXCEEDED
```

Additional diagnostics cover inaccessible stylesheets, unsupported selectors, unresolved source nodes, unavailable CDP nodes/styles and unresolved token usages.

### Browser persistence and lifecycle

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

Capture receipts expose the sidecar key, actual CSS adapter, style count, token count and diagnostic count. Cancellation/failure cleanup removes the CSS sidecar together with RawSnapshot/screenshot artifacts.

### Browser package integration

Both Standard and High Fidelity Browser builds package and validate:

- CSS cascade runtime;
- CSS sidecar store;
- compiled `@w2f/css-cascade` runtime;
- Standard authored CSS acquisition runtime.

Recursive package validation continues to reject unresolved `@w2f/*` runtime imports.

### Privacy and permissions

NODE-11 does not read cookies, local/session storage or live input/textarea textual values.

Standard permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity continues to add only the existing explicit:

```text
debugger
```

No broad host permissions or static content scripts were introduced.

## Behavior coverage

Shared tests cover authored/computed normalization, deterministic ordering/hash, exact winner handling, multiple-winner rejection, `!important`, media provenance, CSS length semantics, Token Graph definitions/usages/aliases, unknown-definition rejection, sidecar validation and `matched-unresolved` behavior.

Browser tests cover RawSnapshot-to-Standard iframe/shadow/pseudo hints plus CDP matched-style normalization, importance, media activity, safe token linking and ambiguous token preservation.

## Validation

Controlled authored acquisition/browser integration run:

```text
32617158205
```

removed its temporary write-enabled workflow from the working tree before running the complete repository `pnpm check`. All gates passed, and the validated resulting bot head was:

```text
0473fb18586e458062317a718835d8d7a7eb4b10
```

The temporary workflow is absent from the resulting branch.

Formal standard read-only frozen-lockfile documentation/status Exit Gate:

```text
32617337130
```

validated head:

```text
21fa12cad809c573a0ea3c43b7284de9b2ef6c23
```

Every formal gate passed:

- NODE-08/NODE-09/NODE-10/NODE-11/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- strict TypeScript typecheck;
- complete Vitest suite;
- Standard Browser build/package validation;
- High Fidelity Browser build/package validation;
- pinned Prettier 3.9.6 format check.

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
- [x] same-origin iframe/open Shadow DOM integration
- [x] Standard media provenance
- [x] CDP matched/computed style acquisition
- [x] CDP backend-node source linkage
- [x] inherited CDP authored evidence
- [x] CSS-only Standard fallback without RawSnapshot downgrade
- [x] acquisition budgets and diagnostics
- [x] Browser IndexedDB CSS sidecar persistence
- [x] job receipt integration and cleanup
- [x] Standard/High Fidelity runtime packaging
- [x] dependency-free NODE-11 guardrail
- [x] shared and Browser behavior tests
- [x] authoritative workspace lockfile refreshed
- [x] temporary write-enabled workflows removed from resulting tree
- [x] controlled complete `pnpm check` passed
- [x] normative implementation document added
- [x] ADR-0011 added
- [x] formal standard read-only frozen-lockfile docs/status CI passed
- [x] PR #15 ready for review
- [ ] PR #15 squash merged

## Normative documents

- `docs/CSS_CASCADE_AUTHORED_SEMANTICS_V2.md`;
- `docs/adr/ADR-0011-authored-cascade-sidecar-and-browser-resolved-boundary.md`;
- this node record.

## Explicit non-goals

NODE-11 does not implement the complete browser cascade or custom-property resolver, NODE-12 environment/container capture, multi-viewport responsive inference, asset resolution, final `.wtf` packaging or Figma rendering.

## Next

After PR #15 squash merge:

```text
NODE-12 — Media / Container / Environment Capture
```
