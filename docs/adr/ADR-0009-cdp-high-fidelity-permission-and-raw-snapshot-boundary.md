# ADR-0009 — CDP High Fidelity Permission and RawSnapshot Boundary

## Status

Accepted for NODE-09.

## Context

The Standard DOM capture path established in NODE-08 intentionally uses least-privilege Browser Extension permissions and ordinary page APIs. Some browser evidence required by the V2/V2.1 architecture is more reliably available through Chrome DevTools Protocol, including flattened DOMSnapshot layout evidence, paint order, browser-reported layout metrics and full-page screenshot capture.

Chrome exposes CDP to extensions through the `debugger` permission. That permission is materially heavier than the Standard profile's `activeTab`, `scripting` and `storage` permissions.

A second risk is architectural divergence: if CDP produced a parallel document model, every downstream stage would need separate Standard/CDP code paths and long-term determinism would degrade.

## Decision

### 1. Keep Standard and High Fidelity as separate build profiles

The Standard manifest remains:

```text
activeTab
scripting
storage
```

The High Fidelity manifest adds only:

```text
debugger
```

Neither build adds broad host permissions or static content scripts.

### 2. Normalize both capture paths into one RawSnapshot contract

CDP does not define a second capture IR. `@w2f/cdp-capture-adapter` maps CDP responses into the same `RawSnapshot 1.0.0` used by NODE-08 Standard capture.

CDP-only observations are represented as optional evidence fields such as backend node ID, paint order and layout metrics. Standard capture does not fabricate missing values.

### 3. Keep platform access out of the normalizer

`apps/browser-extension/src/runtime/cdp-runtime.ts` owns Chrome `debugger` attach/sendCommand/detach operations.

`@w2f/cdp-capture-adapter` receives plain CDP response data and performs deterministic normalization. It has no direct Chrome API dependency.

### 4. Detach is mandatory on every attached execution path

Debugger attachment is protected by `finally`. Capture command failures, normalization failures, persistence failures and fallback transitions must not leave an attached debugger session behind.

### 5. CDP failure explicitly falls back to Standard

When CDP is available but capture fails, partial CDP artifacts are removed and Standard capture runs against the same capture target.

Fallback must be observable through:

```text
CDP_CAPTURE_FALLBACK_STANDARD
fallbackFromCdp: true
```

Silent downgrade is not allowed.

### 6. Persist screenshot evidence separately

`Page.captureScreenshot` output is stored in IndexedDB `referenceScreenshots`, not inside RawSnapshot and not in `chrome.storage.local`.

This preserves a clean semantic RawSnapshot while retaining pixel reference evidence for later NODE-14 work.

### 7. Missing frame evidence is explicit

A frame in `Page.getFrameTree` that is absent from the root DOMSnapshot is recorded as unavailable with `CDP_FRAME_DOCUMENT_UNAVAILABLE`. NODE-09 does not fabricate cross-target documents or silently auto-attach unrelated targets.

## Consequences

### Positive

- Standard users do not pay the security cost of `debugger` permission.
- High Fidelity obtains richer browser-native evidence.
- All downstream engines consume one RawSnapshot model.
- Failure behavior is deterministic and inspectable.
- Pixel reference evidence is retained without contaminating semantic capture storage.
- Browser packaging can independently validate each permission profile.

### Trade-offs

- Two Browser extension output profiles must be built and tested.
- CDP availability depends on the High Fidelity manifest and Chrome debugger attach success.
- Some OOPIF/cross-target frame documents may remain unavailable at NODE-09 and are explicitly diagnosed.
- NODE-09 screenshot evidence is not yet a complete Pixel Ground Truth engine.

## Rejected alternatives

### Add `debugger` to the only/default manifest

Rejected because it violates the least-privilege Standard boundary and makes heavy permission consent unavoidable.

### Create a CDP-specific downstream IR

Rejected because it duplicates the capture pipeline and conflicts with the adapter-neutral RawSnapshot architecture frozen by NODE-08.

### Silently fall back to Standard

Rejected because quality/capability changes must remain inspectable in diagnostics and job receipts.

### Store screenshots in `chrome.storage.local`

Rejected because full screenshot payloads are large binary evidence and do not belong in compact job-state storage.

### Treat absent frame documents as captured

Rejected because missing evidence must never be fabricated.

## Validation

The decision is enforced by:

- Standard/High Fidelity manifest assertions;
- `scripts/validate-node-09.mjs`;
- CDP adapter tests;
- Browser package/runtime validation for both profiles;
- full frozen-lockfile CI.
