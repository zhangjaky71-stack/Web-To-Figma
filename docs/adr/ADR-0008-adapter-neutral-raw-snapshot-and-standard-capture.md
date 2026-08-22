# ADR-0008 — Adapter-Neutral RawSnapshot and Standard Capture Boundary

**Status:** Accepted  
**Date:** 2026-08-22  
**Applies to:** NODE-08 onward

## Context

W2F requires two browser capture paths:

- Standard browser DOM APIs;
- NODE-09 CDP high-fidelity APIs.

If these paths emit independent models, every downstream normalization/layout/render stage must branch on adapter source. That would duplicate logic and make Standard/CDP fidelity differences leak across the whole system.

V2.1 also requires frame isolation, composed-tree mapping, scroll-root evidence and unrounded geometry to survive capture.

Large semantic snapshots are additionally unsuitable for routine storage in `chrome.storage.local`.

## Decision

Introduce a shared adapter-neutral `RawSnapshot` contract in `@w2f/capture-core`.

```text
Standard DOM APIs ─┐
                   ├→ RawSnapshot → later normalization/IR
CDP (NODE-09) ─────┘
```

`RawSnapshot` carries:

- source nodes and relationships;
- frame context;
- unrounded geometry;
- visibility;
- scroll containers;
- diagnostics;
- capture target;
- scale evidence.

Standard capture is implemented in `@w2f/standard-capture-adapter` and must emit only a structurally valid `RawSnapshot`.

The Browser service worker invokes the Standard page function through `chrome.scripting.executeScript({ func, args })` and validates the returned snapshot before persistence.

Large RawSnapshots are stored in IndexedDB. The normal job state contains only a compact receipt/reference.

## Frame decision

`FrameContext` is a shared schema contract and is carried by Raw nodes. W2F IR SourceNode reserves the same evidence so iframe origin identity cannot disappear during normalization.

Standard capture traverses accessible same-origin iframe documents and records inaccessible boundaries as diagnostics. It never bypasses origin/sandbox security.

## Scale decision

DPR, browser page zoom, CSS zoom and visual viewport scale remain distinct schema dimensions.

Standard page APIs do not reliably reveal browser page zoom separately from OS display scaling. Therefore Standard capture records the value as unavailable when it cannot observe it rather than fabricating a number.

NODE-09 may enrich the same scale contract using platform/CDP evidence.

## Privacy decision

Standard semantic capture must not read cookies, local/session storage or runtime form values. Sensitive attributes/query parameters are removed before RawSnapshot persistence.

Manual Redact is not the security boundary; automatic privacy filtering always applies.

## Packaging decision

The Chrome package embeds only the shared runtime packages needed by Browser execution and rewrites their top-level imports to extension-relative paths. The final package validator rejects unresolved workspace imports.

`debugger` permission is not introduced in NODE-08.

## Consequences

Positive:

- NODE-09 can target the same RawSnapshot boundary;
- downstream code does not need Standard/CDP-specific trees;
- frame/scale/scroll evidence remains explicit;
- Browser storage remains resilient to large captures;
- permissions remain least-privilege for Standard mode.

Trade-offs:

- RawSnapshot requires its own structural validation layer;
- Standard capture honestly reports evidence that is unavailable rather than pretending to reach CDP fidelity;
- IndexedDB lifecycle must be managed alongside job state.

## Rejected alternatives

### Standard adapter writes W2F IR directly

Rejected because it couples browser extraction to semantic normalization and forces NODE-09 either to duplicate IR construction or imitate Standard limitations.

### Put the full RawSnapshot in chrome.storage.local

Rejected because large DOM snapshots can exceed practical storage limits and make job-state updates expensive.

### Request debugger permission now

Rejected because NODE-08 is the Standard path. CDP capability and permission boundaries belong to NODE-09.

### Guess browserPageZoom

Rejected because DPR combines multiple scaling influences and page JS cannot reliably separate them across environments.
