# CDP High Fidelity Adapter V2

## Status

NODE-09 normative implementation document for the frozen V2 Baseline + V2.1 Addendum.

## Purpose

NODE-09 adds an optional Chrome DevTools Protocol capture path for evidence that the Standard DOM adapter cannot reliably observe from ordinary page APIs. The High Fidelity path does not introduce a second capture model: both Standard and CDP normalize into the same `RawSnapshot` contract defined by `@w2f/capture-core`.

The Standard path remains the least-privilege default and the deterministic fallback when CDP is unavailable or fails.

## Build and permission boundary

Two Browser Extension build profiles are produced from the same source tree:

| Profile | Output | Permissions |
|---|---|---|
| Standard | `apps/browser-extension/dist/` | `activeTab`, `scripting`, `storage` |
| High Fidelity | `apps/browser-extension/dist-high-fidelity/` | `activeTab`, `scripting`, `storage`, `debugger` |

Neither profile adds broad `host_permissions` or static `content_scripts`.

`debugger` is intentionally isolated to the High Fidelity manifest. The Standard manifest must never gain this permission as an implementation shortcut.

Both output directories are generated build artifacts and are excluded from Git and source-format checks.

## Shared capture boundary

The shared capture contract remains:

```text
RawSnapshot 1.0.0
adapter: "standard" | "cdp"
```

NODE-09 extends the shared evidence vocabulary with optional CDP-observable fields while preserving backward-compatible Standard snapshots:

- `RawSourceReference.backendNodeId?`;
- `RawNode.paintOrder?`;
- `RawCaptureEnvironment.layoutMetrics?`.

The CDP adapter may populate these fields. Standard capture is not required to fabricate them.

## CDP evidence acquisition

The Browser platform adapter attaches to the user-selected tab with Chrome `debugger` permission and protocol version `1.3`.

A High Fidelity capture obtains:

- `DOMSnapshot.captureSnapshot`;
- `Page.getLayoutMetrics`;
- `Page.getFrameTree`;
- `Page.captureScreenshot`;
- `Runtime.evaluate` for `window.devicePixelRatio`.

`DOMSnapshot.captureSnapshot` is requested with:

```text
includePaintOrder: true
includeDOMRects: true
```

The computed-style whitelist is intentionally bounded to properties needed by the current RawSnapshot layer. Full authored CSS/cascade semantics remain NODE-11 work.

## Scale and geometry evidence

CDP evidence remains in browser CSS-pixel coordinates and is not rounded during capture.

`Page.getLayoutMetrics` is used to preserve:

- CSS layout viewport;
- CSS visual viewport;
- CSS content size;
- visual viewport scale;
- browser page zoom when Chrome reports it.

`window.devicePixelRatio` is observed separately.

This preserves the V2.1 ScaleContext separation between device pixel ratio, browser page zoom, CSS zoom and visual viewport scale. NODE-09 does not invent element-scoped CSS zoom values; CSS zoom semantics remain deferred to CSS capture work.

## DOMSnapshot normalization

`@w2f/cdp-capture-adapter` is Browser-platform-neutral. It receives already-collected CDP response objects and produces a shared `RawSnapshot` plus a reference screenshot artifact.

Normalization preserves, where available:

- document/element/text node kinds;
- source parent relationships;
- frame-aware `FrameContext`;
- unrounded DOM/layout bounds;
- client rect evidence;
- computed visibility evidence;
- backend node IDs;
- paint order;
- document scroll-root evidence;
- layout metrics;
- CDP-specific diagnostics.

The adapter does not consume live input or textarea runtime values and does not read cookies, local storage or session storage.

## Frame behavior

`Page.getFrameTree` is reconciled with documents present in the root `DOMSnapshot` response.

Frames represented by DOMSnapshot receive normal `RawFrameRecord` entries. A frame present in the Page frame tree but absent from the captured DOMSnapshot is represented as unavailable evidence and receives:

```text
CDP_FRAME_DOCUMENT_UNAVAILABLE
```

This is explicit evidence, not a fabricated frame document. Cross-target/OOPIF expansion beyond the root CDP target is not silently invented in NODE-09.

## Region, Redact and Exclude behavior

NODE-09 consumes the same NODE-07 region contract as Standard capture.

Region capture keeps nodes intersecting the selected region plus structural ancestor closure.

The two exclusion kinds remain distinct:

- `exclude`: fully covered nodes are removed from the captured node set;
- `redact`: intersecting captured nodes retain structure but protected content/attributes are masked.

An `exclude` rectangle must not accidentally redact a partially intersecting ancestor needed to preserve hierarchy.

For a region capture, `Page.captureScreenshot` uses the selected document-CSS-pixel rectangle as its CDP clip.

## Reference screenshot artifact

`Page.captureScreenshot` is evidence, not the final NODE-14 Pixel Ground Truth implementation.

The PNG base64 payload is stored separately from the RawSnapshot in IndexedDB:

```text
Database: w2f-capture-snapshots
Store: referenceScreenshots
Key: reference-screenshot:<jobId>
```

RawSnapshot continues to use:

```text
Store: rawSnapshots
Key: raw-snapshot:<jobId>
```

`chrome.storage.local` stores only compact job/receipt metadata and never stores the full screenshot payload.

## Capture orchestration and fallback

High Fidelity build behavior:

```text
user capture request
→ attach debugger
→ collect CDP evidence
→ normalize to RawSnapshot
→ persist RawSnapshot + reference screenshot
→ detach debugger
```

The debugger session is always detached through `finally`, including command, normalization or persistence failures.

If CDP capture fails, Browser orchestration removes partial CDP artifacts and runs Standard capture. The fallback is explicit:

```text
CDP_CAPTURE_FALLBACK_STANDARD
```

The persisted Standard RawSnapshot receipt also records `fallbackFromCdp: true`.

A successful CDP capture completes with phase:

```text
high-fidelity-capture-complete
```

A successful fallback completes with:

```text
standard-fallback-complete
```

The Standard-only build never attempts to attach the debugger.

## Browser package integrity

The Browser packager copies runtime workspace packages into the extension and recursively rewrites runtime `@w2f/*` imports to extension-relative paths.

Package validation recursively rejects unresolved workspace imports. Type-only TypeScript imports may be erased by compilation and are therefore not required to appear as runtime imports.

Both Standard and High Fidelity packages are produced and validated by the normal Browser `build` command.

## Security invariants

NODE-09 freezes these invariants:

1. Standard build remains debugger-free.
2. High Fidelity adds only the explicit `debugger` permission.
3. No broad host permissions are added.
4. No static content script is introduced.
5. CDP failure always detaches before fallback.
6. Partial CDP artifacts are cleaned before fallback/failure completion.
7. Full screenshot evidence stays in IndexedDB, not `chrome.storage.local`.
8. Both adapters use the same validated RawSnapshot boundary.
9. No captured geometry is rounded at acquisition time.
10. Missing CDP/frame evidence is diagnosed rather than fabricated.

## Explicit non-goals

NODE-09 does not implement:

- pseudo-element reconstruction or inline-fragment fidelity beyond the current RawSnapshot fields;
- complete authored CSS cascade extraction;
- asset localization;
- final Pixel Ground Truth/raster tiling;
- multi-viewport responsive capture;
- responsive inference;
- Figma rendering;
- arbitrary cross-target OOPIF auto-attach orchestration.

These remain later NODEs.

## Validation

NODE-09 is guarded by:

- `scripts/validate-node-09.mjs`;
- shared RawSnapshot validation;
- CDP normalization tests;
- Browser protocol/job-state/snapshot-store tests;
- Standard and High Fidelity package validation;
- canonical frozen-lockfile GitHub Actions.
