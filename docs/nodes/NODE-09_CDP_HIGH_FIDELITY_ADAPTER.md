# NODE-09 — CDP High Fidelity Adapter

## Status

**DONE / PASS — implementation and standard read-only frozen-lockfile Exit Gate passed; PR #13 pending final docs CI/merge**

## Goal

Implement the frozen V2/V2.1 High Fidelity Browser capture path using Chrome DevTools Protocol while preserving the adapter-neutral `RawSnapshot` contract established by NODE-08.

## Delivered

### Shared CDP adapter

Added:

```text
packages/cdp-capture-adapter
```

Contract version:

```text
1.0.0
```

The package is platform-neutral and normalizes plain CDP evidence into:

```text
RawSnapshot 1.0.0
adapter: "cdp"
```

plus a PNG reference screenshot artifact.

### CDP acquisition

Browser High Fidelity runtime collects:

- `DOMSnapshot.captureSnapshot`;
- `Page.getLayoutMetrics`;
- `Page.getFrameTree`;
- `Page.captureScreenshot`;
- `Runtime.evaluate(window.devicePixelRatio)`.

DOMSnapshot enables paint-order and DOM-rect evidence.

### RawSnapshot evidence extensions

NODE-09 adds optional shared evidence for:

- backend node ID;
- paint order;
- layout/content/visual viewport metrics.

Standard capture remains valid without these optional fields.

### ScaleContext

CDP preserves separately observable:

- device pixel ratio;
- browser page zoom when reported;
- visual viewport scale.

Element-scoped CSS zoom is not fabricated.

### Frame handling

DOMSnapshot documents retain frame-aware context.

Frames visible to `Page.getFrameTree` but absent from the root DOMSnapshot produce explicit unavailable records/diagnostics:

```text
CDP_FRAME_DOCUMENT_UNAVAILABLE
```

### Region and privacy semantics

NODE-09 reuses NODE-07 document-CSS-pixel region evidence.

- region intersection retains structural ancestor closure;
- fully covered `exclude` nodes are removed;
- `redact` masks protected content/attributes for intersecting nodes;
- `exclude` does not incorrectly redact a partially intersecting structural ancestor.

CDP normalization does not consume live input/textarea runtime-value fields and does not read cookie/local/session storage.

### Dual Browser profiles

Standard build remains:

```text
activeTab
scripting
storage
```

High Fidelity adds only:

```text
debugger
```

Outputs:

```text
apps/browser-extension/dist/
apps/browser-extension/dist-high-fidelity/
```

Both are generated artifacts and are ignored by Git.

Both profiles are built and validated by the normal Browser build gate.

### Safe attach/detach and fallback

High Fidelity capture attaches to the current tab, collects evidence and always detaches through `finally`.

If CDP capture fails:

1. partial CDP artifacts are removed;
2. Standard capture runs against the same target;
3. the RawSnapshot receives `CDP_CAPTURE_FALLBACK_STANDARD`;
4. the receipt records `fallbackFromCdp: true`.

No silent downgrade is allowed.

### Screenshot persistence

CDP Page screenshot evidence is stored separately in IndexedDB:

```text
DB: w2f-capture-snapshots
Store: referenceScreenshots
Key: reference-screenshot:<jobId>
```

RawSnapshot remains in `rawSnapshots`.

`chrome.storage.local` stores compact state/receipt metadata only.

### Browser protocol

Browser shell protocol advanced to:

```text
1.3.0
```

Shell info exposes the current capture profile and CDP availability.

## Validation coverage

Added/updated:

- CDP normalizer unit tests;
- shared RawSnapshot validation for NODE-09 optional evidence;
- Browser protocol tests;
- Browser job receipt tests;
- screenshot storage-key/persistence contract tests;
- dependency-free `scripts/validate-node-09.mjs`;
- Standard package validation;
- High Fidelity package validation;
- recursive unresolved `@w2f/*` runtime import rejection.

Historical NODE-08 validators were adjusted so they continue to guard NODE-08 invariants without pinning later Browser protocol versions.

## Controlled bootstrap findings

Real GitHub Runner validation exposed and resolved:

- illegal TypeScript ambient `namespace debugger` syntax;
- stale NODE-08 protocol `1.2.0` hard pins in historical foundation validation;
- an unused CDP type import;
- `exactOptionalPropertyTypes` parent-frame assignment;
- incorrect conflation of `exclude` and `redact` region semantics;
- an invalid package-validator assumption about a type-only runtime import;
- missing generated-output ignore rules for `dist-high-fidelity/`.

The temporary write-enabled NODE-09 bootstrap workflow was removed before the formal Exit Gate.

## Formal Exit Gate

Final code/security/build standard read-only GitHub Actions run before docs-only completion update:

```text
32586474296
```

validated commit:

```text
ef953d3a72f8a070c194423b7d22dd30e1f97737
```

All formal gates passed:

- dependency-free NODE-08/NODE-09/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint across all workspaces;
- TypeScript 6.0.3 strict typecheck;
- complete Vitest suite;
- Standard Browser package build/validation;
- High Fidelity Browser package build/validation;
- pinned Prettier 3.9.6 format check.

## Definition of Done

- [x] independent shared CDP adapter package
- [x] same adapter-neutral RawSnapshot as Standard capture
- [x] debugger attach/detach platform runtime
- [x] detach protected by `finally`
- [x] DOMSnapshot capture
- [x] layout metrics capture
- [x] frame-tree evidence
- [x] Page screenshot evidence
- [x] DPR observation
- [x] paint-order evidence
- [x] backend-node evidence
- [x] browser page zoom / visual viewport evidence
- [x] FrameContext preservation
- [x] explicit unavailable-frame diagnostics
- [x] Region integration
- [x] Redact/Exclude semantics preserved
- [x] Standard fallback with explicit diagnostics
- [x] screenshot IndexedDB persistence
- [x] Standard/High Fidelity permission isolation
- [x] dual profile package validation
- [x] authoritative 11-workspace lockfile
- [x] generated High Fidelity output excluded from Git
- [x] temporary write-enabled bootstrap removed
- [x] final standard read-only frozen-lockfile code Exit Gate passed
- [x] normative implementation document added
- [x] ADR added
- [ ] final docs/status-only CI passed
- [ ] PR #13 merged

## Normative documents

- `docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md`;
- `docs/adr/ADR-0009-cdp-high-fidelity-permission-and-raw-snapshot-boundary.md`;
- this node record.

## Explicit non-goals

NODE-09 does not implement:

- NODE-10 text/inline/pseudo reconstruction;
- NODE-11 authored cascade semantics;
- asset localization;
- final Pixel Ground Truth/raster tiling;
- responsive multi-viewport capture/inference;
- Figma rendering;
- fabricated OOPIF document capture beyond available root-target evidence.

## Next

After final docs/status CI and PR #13 merge:

```text
NODE-10 — Text / Inline / Pseudo Capture
```
