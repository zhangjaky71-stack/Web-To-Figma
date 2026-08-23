# CSS Cascade & Authored Semantics V2

## Status

Normative implementation contract for NODE-11 under the frozen V2 Baseline + V2.1 Addendum.

## Purpose

NODE-08 through NODE-10 preserve browser-observed DOM, geometry, visibility, text, inline, pseudo and form visual evidence in adapter-neutral `RawSnapshot 1.0.0`.

NODE-11 adds the complementary authored CSS evidence required to explain those browser results without replacing them or attempting to become a second browser CSS engine.

The contract covers:

- authored declarations and provenance;
- computed values paired with authored candidates;
- `!important` evidence;
- inheritance evidence where the acquisition API exposes it;
- deterministic cascade traces;
- CSS Custom Property definitions, usages and aliases;
- V2.1 Token Graph materialization;
- authored media-condition provenance;
- CSS length semantic preservation;
- explicit diagnostics for unavailable or ambiguous evidence.

## Artifact boundary

Authored cascade evidence is a sidecar artifact. It is not embedded into `RawSnapshot`.

```text
RawSnapshot 1.0.0
  = browser-observed capture evidence

CssCascadeCapture 1.0.0
  = authored/computed cascade sidecar
```

This matches the portable V2 entries already reserved by NODE-02/V2.1:

```text
source/cascade.json
tokens.json
styles.json
```

NODE-11 therefore does not change the `.wtf` extension, MIME, schema version, IR version or RawSnapshot version.

## Shared engine

Package:

```text
@w2f/css-cascade
packages/css-cascade
```

Engine version:

```text
1.0.0
```

The shared engine is platform-neutral. It does not read DOM/CSSOM/CDP and does not resolve CSS variables itself.

It receives acquisition evidence and performs deterministic normalization into:

- `CssCascadePayload`;
- `WtfStyleRecord[]`;
- `WtfTokenGraph`;
- unresolved token usages;
- diagnostics.

## Declaration status model

NODE-11 supports four explicit statuses:

```text
winner
overridden
inactive-condition
matched-unresolved
```

### `winner`

Use only when an acquisition source provides trustworthy exact winning-declaration evidence.

### `overridden`

Use only when trustworthy exact losing-declaration evidence is available.

### `inactive-condition`

The authored declaration exists, but its enclosing condition is not active for the current observed environment.

### `matched-unresolved`

The browser/API confirms that the authored rule or inline declaration matches the node, but NODE-11 does not have enough trustworthy evidence to label the exact winner without reimplementing browser cascade behavior.

`matched-unresolved` is intentional. It prevents a false source trace while still preserving authored structure.

When no explicit `winner` exists, `WtfStyleRecord` preserves the browser-computed value but does not fabricate `authoredValue` or a winning source.

## Determinism

The shared engine normalizes and sorts:

- source nodes;
- properties;
- declaration candidates;
- diagnostics;
- token definitions/usages;
- unresolved usages.

A deterministic cascade hash is produced from normalized evidence.

Capture-time browser numeric values are not rounded by NODE-11.

## CSS length semantics

NODE-11 reuses the existing `WtfCssLength` / `WtfCssLengthSemantic` IR model rather than creating a parallel representation.

Supported authored semantic forms include:

```text
px
percent
em
rem
vw/vh/vmin/vmax
keyword
expression
```

The model can preserve both:

```text
authoredValue
resolvedPx
```

Expressions such as `calc()`, `min()`, `max()`, `clamp()` or otherwise non-trivial authored values remain expressions instead of being flattened into invented semantics.

## Token Graph

NODE-11 materializes the V2.1 `WtfTokenGraph` already frozen in `@w2f/w2f-schema`.

Each known custom-property definition can retain:

- deterministic token ID;
- custom-property name;
- raw authored value;
- browser-resolved value when safely observable;
- inferred or explicit token kind;
- source node / stylesheet / selector scope evidence;
- alias/reference edges;
- confidence.

Token usages retain:

- token ID;
- source node;
- consuming property;
- authored `var(...)` expression;
- browser-resolved property value.

### Safe-link rule

NODE-11 does not guess a token definition when multiple candidate definitions with the same custom-property name are present and exact scope resolution is not trustworthy.

A usage is linked into `WtfTokenGraph.usages` only when the acquisition evidence identifies one unambiguous definition.

Otherwise it is preserved in `CssUnresolvedTokenUsage` with:

```text
definition-ambiguous
definition-unavailable
```

and a fail-visible diagnostic.

This preserves information without creating a false design-token graph.

## Browser-resolved values are authoritative

NODE-11 does not implement a full CSS Custom Property resolver.

For cycles, fallbacks, inheritance and browser-specific parsing behavior, the browser-observed computed result remains authoritative.

Example:

```css
--a: var(--b);
--b: var(--a, red);
```

NODE-11 may preserve authored references and the browser result, but it must not replace the browser with a separate speculative resolver.

## Standard acquisition

Standard profile uses browser CSSOM and computed style APIs through:

```text
captureStandardCascadeInPage
```

It runs only after explicit user capture action and reuses RawSnapshot source hints to resolve the already-captured nodes.

Evidence includes:

- accessible `document.styleSheets`;
- open-shadow-root `<style>` sheets;
- `adoptedStyleSheets`;
- authored `CSSStyleRule` declarations;
- inline declarations;
- current `CSSMediaRule` condition text and participation;
- `CSSSupportsRule` participation where available;
- CSS layer name where exposed;
- declaration source order;
- `!important`;
- computed property values;
- custom-property authored/computed evidence.

### Standard limitations are explicit

Cross-origin or otherwise unreadable CSSOM produces:

```text
CSS_STYLESHEET_INACCESSIBLE
```

Unsupported/unresolvable selectors and source nodes produce explicit diagnostics.

Standard acquisition does not broaden extension permissions to read inaccessible stylesheets.

## High Fidelity CDP acquisition

When the RawSnapshot adapter is `cdp`, NODE-11 first attempts a short-lived CSS-domain debugger session.

The Browser runtime uses captured `backendNodeId` evidence and requests:

```text
DOM.pushNodesByBackendIdsToFrontend
CSS.getMatchedStylesForNode
CSS.getComputedStyleForNode
```

The CDP evidence is normalized into the same `CssCascadeAcquisition` contract used by Standard capture.

CDP preserves browser-native matched-rule evidence including:

- stylesheet IDs;
- selector text;
- authored declarations;
- disabled/parse state filtering;
- `!important`;
- inherited matched rules;
- inline/presentational styles;
- media-rule provenance/activity;
- layer text when exposed;
- computed values.

Debugger attachment is always detached through `finally`.

### CSS-sidecar fallback is independent of RawSnapshot fallback

A successful CDP RawSnapshot remains a CDP RawSnapshot even if the later CSS-domain sidecar acquisition cannot complete.

In that case the CSS sidecar falls back to Standard CSSOM acquisition.

The result is inspectable through the receipt:

```text
RawSnapshot adapter: cdp
cssCascadeAdapter: standard
```

NODE-11 CSS-sidecar fallback therefore does not discard an already successful NODE-09 high-fidelity DOM/screenshot capture.

## Acquisition budgets

Standard authored acquisition defaults to bounded rule/declaration scanning and has hard upper caps.

CDP authored acquisition currently caps per-capture source-node style inspection at 2500 nodes.

Budget truncation is fail-visible through:

```text
CSS_CAPTURE_BUDGET_EXCEEDED
```

No truncation is presented as complete evidence.

## Media boundary with NODE-12

NODE-11 records media conditions because they are part of authored rule provenance and are necessary to explain current cascade participation.

NODE-11 does not implement:

- multi-environment media evaluation;
- environment snapshots;
- container-query environment capture;
- cross-viewport responsive inference.

Those remain NODE-12 and later responsibilities.

## Browser persistence

CSS sidecars are persisted separately from RawSnapshot and screenshot evidence.

```text
IndexedDB database: w2f-css-cascade
Object store: captures
Key: css-cascade:<jobId>
```

The compact job receipt records:

- CSS sidecar storage key;
- actual CSS acquisition adapter;
- style count;
- token count;
- CSS diagnostic count.

Cancellation and failure cleanup delete the CSS sidecar together with the existing capture artifacts.

## Privacy and permission boundary

NODE-11 does not read:

```text
document.cookie
localStorage
sessionStorage
live input/textarea textual values
```

Standard manifest permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity continues to add only the existing explicit:

```text
debugger
```

NODE-11 introduces no broad host permissions and no static content scripts.

## Packaging

`@w2f/css-cascade` is compiled and copied into the loadable Browser package.

Runtime workspace imports are rewritten to packaged relative imports, and the Browser package validator recursively rejects unresolved `@w2f/*` runtime imports.

Both Standard and High Fidelity packages must contain and validate:

```text
runtime/css-cascade-runtime.js
runtime/css-cascade-store.js
runtime/css-cascade/*
runtime/standard-capture-adapter/cascade-capture.js
```

## Diagnostics

NODE-11 defines fail-visible diagnostics for:

```text
CSS_STYLESHEET_INACCESSIBLE
CSS_SELECTOR_UNSUPPORTED
CSS_SOURCE_NODE_UNRESOLVED
CSS_CDP_NODE_UNAVAILABLE
CSS_CDP_MATCHED_STYLES_UNAVAILABLE
CSS_TOKEN_USAGE_UNRESOLVED
CSS_CAPTURE_BUDGET_EXCEEDED
```

## Non-goals

NODE-11 does not:

- reimplement the complete CSS cascade algorithm;
- reimplement the complete CSS variable resolver;
- fabricate unavailable exact winners;
- bypass cross-origin CSSOM restrictions;
- capture NODE-12 environment snapshots;
- infer responsive rules;
- resolve assets;
- render Figma nodes;
- package the final `.wtf` archive.

## Exit requirements

NODE-11 is complete only when:

- shared cascade/length/token behavior tests pass;
- Standard acquisition integration is validated;
- CDP matched-style normalization is behavior-tested;
- CSS sidecar Browser persistence is wired;
- both Browser profiles package and validate;
- authoritative lockfile is frozen;
- temporary write-enabled workflows are absent;
- standard read-only frozen-lockfile GitHub Actions passes on the completed documentation/status head.
