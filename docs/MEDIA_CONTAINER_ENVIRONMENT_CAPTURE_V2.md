# Media / Container / Environment Capture V2

## Purpose

NODE-12 records the browser environment and responsive-condition evidence required to explain why the captured page rendered as observed. It extends the NODE-08 through NODE-11 browser evidence pipeline without changing the frozen `RawSnapshot 1.0.0` contract and without performing NODE-15 multi-viewport orchestration or NODE-16 responsive inference.

The implementation follows the frozen V2 Baseline + V2.1 Addendum.

## Evidence boundary

NODE-12 stores environment evidence separately as:

```text
EnvironmentCapture 1.0.0
```

The sidecar is associated with one `RawSnapshot` through a deterministic snapshot identity derived from the raw capture timestamp.

The sidecar contains:

- runtime environment evidence;
- media-feature observations;
- `@media` rule evidence;
- container definitions;
- `@container` rule evidence;
- explicit acquisition diagnostics.

This preserves the architectural separation between browser-observed source evidence and later portable IR inference.

## Runtime environment

The captured runtime environment includes:

```text
browserName
browserVersion
platform
language
direction
colorScheme
reducedMotion
viewportWidth
viewportHeight
dpr
pageZoom?
pageZoomAvailability
visualViewportScale?
cssZoom?
cssZoomAvailability
```

### Scale evidence

NODE-12 reuses the scale evidence already captured by RawSnapshot.

High Fidelity capture may expose browser page zoom through CDP layout metrics. Standard capture cannot reliably separate browser page zoom from OS/device scaling, so Standard evidence remains:

```text
pageZoomAvailability = unavailable
```

NODE-12 must never fabricate `pageZoom = 1` merely to satisfy a downstream type. Portable `WtfCaptureEnvironment` conversion therefore returns no portable environment record until required page-zoom evidence is actually available.

## Media-feature state

The Browser runtime captures a bounded, explicit set of environment media features with the browser's `matchMedia` evaluator. The current set includes:

- `prefers-color-scheme: dark`;
- `prefers-reduced-motion: reduce`;
- `prefers-contrast: more`;
- `prefers-contrast: less`;
- `prefers-contrast: custom`;
- `prefers-reduced-transparency: reduce`;
- `forced-colors: active`;
- `hover: hover`;
- `any-hover: hover`;
- `pointer: coarse`;
- `pointer: fine`;
- `any-pointer: coarse`;
- `any-pointer: fine`.

Each feature record contains:

```text
id
query
matches
availability
```

The canonical `colorScheme` and `reducedMotion` fields remain first-class because they are already frozen in the W2F IR environment contract.

## `@media` rule evidence

Accessible CSSOM rules are traversed in source order. Nested rule context is preserved while visiting style rules.

Each media-rule record contains:

```text
id
query
active
activeInSnapshotIds[]
affectedProperties[]
affectedSourceNodeIds[]
stylesheetRef?
ruleIndex?
```

Activity is evaluated by the page's browser using `matchMedia(rule.conditionText)`.

The implementation records both active and inactive media rules. It does not discard inactive authored evidence because later responsive inference needs to know that the rule existed but did not participate in this snapshot.

Cross-origin or otherwise unreadable stylesheets produce explicit diagnostics rather than guessed rules.

## Container definitions

For captured element nodes, NODE-12 reads computed:

```text
container-name
container-type
```

The sidecar can additionally preserve container writing mode and logical size evidence when available.

A container definition is keyed by the RawSnapshot `sourceNodeId`, preserving source-to-snapshot traceability until stable-ID mapping is available downstream.

## `@container` rule evidence

Accessible CSSOM is traversed for `CSSContainerRule` groups. Each rule preserves:

```text
id
containerName?
condition
active?
activeAvailability?
containerSourceNodeId?
affectedProperties[]
affectedSourceNodeIds[]
stylesheetRef?
ruleIndex?
```

Browser CSSOM does not expose a general `matches` primitive equivalent to `MediaQueryList.matches` for arbitrary container queries. Therefore NODE-12 must not infer `active = true/false` from selector matching alone.

When container-query activity cannot be proved, normalization records:

```text
activeAvailability = unavailable
```

and leaves `active` absent. This is an intentional fail-closed boundary. Multi-snapshot and responsive inference remain NODE-15/NODE-16 responsibilities.

## Standard acquisition

The Standard adapter performs bounded page-side acquisition for:

- same-document stylesheets;
- adopted stylesheets;
- open Shadow DOM stylesheets;
- accessible same-origin iframe documents;
- media rules;
- container rules;
- captured-node selector matching;
- container definitions;
- current runtime environment.

Acquisition is bounded by configurable rule and declaration budgets. Budget exhaustion is fail-visible.

## High Fidelity association

High Fidelity RawSnapshots reuse the same environment sidecar acquisition for page CSSOM media/container evidence while carrying the stronger CDP scale evidence already present in the RawSnapshot.

The environment sidecar adapter value records the associated capture profile (`standard` or `cdp`). NODE-12 does not introduce a second debugger attachment solely for media/container capture.

## Browser persistence

Environment sidecars use a dedicated IndexedDB boundary:

```text
Database: w2f-environment
Store: captures
Key: environment:<jobId>
```

Capture receipts expose:

```text
environmentStorageKey
environmentAdapter
mediaRuleCount
activeMediaRuleCount
containerCount
containerQueryCount
environmentDiagnosticCount
```

Cancellation and failure cleanup deletes RawSnapshot/screenshot, CSS Cascade and Environment sidecars together.

## Portable IR mapping

NODE-12 maps evidence to the already frozen W2F IR types:

```text
WtfCaptureEnvironment
WtfMediaRuleTrace
WtfContainerQueryInfo
```

Mapping rules:

1. Browser environment becomes `WtfCaptureEnvironment` only when required page-zoom evidence is observed.
2. Media rule traces preserve query text, active snapshot IDs and affected properties.
3. Container query info resolves affected RawSnapshot source node IDs through a caller-supplied stable-ID resolver.
4. Container type is attached only from an observed matching container definition.
5. No downstream responsive behavior is inferred inside NODE-12.

## Diagnostics

NODE-12 uses explicit diagnostics for incomplete evidence, including:

```text
ENV_STYLESHEET_INACCESSIBLE
ENV_SELECTOR_UNSUPPORTED
ENV_SOURCE_NODE_UNRESOLVED
ENV_CAPTURE_BUDGET_EXCEEDED
ENV_PAGE_ZOOM_UNAVAILABLE
ENV_CONTAINER_QUERY_STATUS_UNAVAILABLE
```

Diagnostics are evidence, not silent fallback instructions.

## Privacy and permissions

NODE-12 does not read:

- cookies;
- localStorage;
- sessionStorage;
- live input/textarea textual values.

The Standard Browser profile keeps:

```text
activeTab
scripting
storage
```

The High Fidelity profile continues to add only the existing `debugger` permission.

NODE-12 introduces no broad host permission and no static content script.

## Determinism

Core sidecar normalization:

- validates non-empty identities;
- validates positive/non-negative numeric evidence;
- de-duplicates and sorts property/source-node collections;
- sorts media features, rules, containers, queries and diagnostics deterministically;
- rejects duplicate identities;
- refuses contradictory availability/value combinations.

## Explicit non-goals

NODE-12 does not implement:

- multi-viewport capture scheduling;
- breakpoint inference;
- responsive behavior classification;
- container-query semantic solving beyond observed evidence;
- asset resolution;
- raster ground truth;
- final `.wtf` packaging;
- Figma rendering.

Those remain assigned to later frozen nodes.
