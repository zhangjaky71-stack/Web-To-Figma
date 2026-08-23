# NODE-13 — Asset Resolver

## Status

**IMPLEMENTED IN PROGRESS — Browser/package integration and formal Exit Gate pending**

## Entry baseline

NODE-13 starts from merged NODE-12 `main` commit:

```text
b9cdca4dc4bc68a3a46571451de7a30c7eb13ad6
```

Working branch:

```text
feat/node-13-asset-resolver
```

## Goal

Resolve browser-rendered image/SVG resources into deterministic, content-addressed, portable evidence while preserving browser-selected sources, full Resource Provenance, explicit missing-resource diagnostics and the frozen W2F IR V2 boundary.

## Delivered

### Platform-neutral Asset Engine

Added:

```text
packages/asset-resolver
@w2f/asset-resolver
```

Sidecar version:

```text
AssetCapture 1.0.0
```

The core package owns:

- resource byte normalization;
- image/SVG MIME identification;
- SHA-256 identity validation;
- deterministic embedded-path selection;
- byte-level de-duplication;
- many-to-one provenance preservation;
- W2F IR asset-record projection;
- summary and structural sidecar validation.

The core remains browser-platform neutral. DOM, fetch, Web Crypto and IndexedDB remain in adapter/runtime layers.

### Supported browser resource evidence

Standard page-side acquisition covers:

- `<img>`;
- `<picture>` selected source through `currentSrc`;
- CSS `background-image` URLs;
- CSS mask URLs;
- CSS border-image URLs;
- generated `content` URLs;
- inline SVG;
- external SVG;
- `<input type=image>`;
- video posters;
- `data:` URLs;
- `blob:` URLs.

### Responsive image evidence

For image elements NODE-13 preserves:

```text
currentSrc
authoredSrc
natural/intrinsic size
rendered bounds
```

The browser remains the authority for `srcset` / `<picture>` selection.

### Frame and Shadow DOM behavior

Asset acquisition reuses RawSnapshot frame/source-selector hints and supports accessible same-origin iframe and open Shadow DOM targets.

Element classification uses local-name/namespace evidence rather than top-window DOM `instanceof` checks, preventing same-origin iframe realm mismatches.

### CSS image evidence

Computed CSS image references are extracted from:

```text
background-image
mask-image
-webkit-mask-image
border-image-source
content
```

NODE-11 authored cascade evidence remains separate and is not duplicated inside AssetCapture.

### Content addressing

The Browser runtime computes SHA-256 with Web Crypto.

Canonical asset identity:

```text
asset:<sha256>
```

Reserved portable package path:

```text
assets/<sha256>.<extension>
```

Identical bytes from different URLs/properties/source nodes resolve to one unique asset while retaining all reference/provenance evidence.

### MIME identification

Current byte/content identification supports:

- PNG;
- JPEG;
- GIF;
- WebP;
- AVIF;
- ICO;
- BMP;
- SVG.

Image Content-Type and SVG URL suffix are fallback hints where appropriate.

### Resource Provenance

The sidecar preserves:

```text
sourceType
sourceNodeId
sourceUrl
originalUrl
frameId
frameOrigin
stylesheetRef
cssProperty
```

The frozen `WtfAssetRecord.provenance` remains a compact projection; the sidecar retains the full many-reference evidence set.

### Explicit failure semantics

NODE-13 records failures instead of inventing resources:

```text
ASSET_FETCH_FAILED
ASSET_EMPTY_RESOURCE
ASSET_TOO_LARGE
ASSET_TOTAL_BUDGET_EXCEEDED
ASSET_COUNT_BUDGET_EXCEEDED
ASSET_UNSUPPORTED_MEDIA_TYPE
ASSET_HASH_FAILED
ASSET_SOURCE_NODE_UNRESOLVED
ASSET_SELECTOR_UNSUPPORTED
```

A resource that rendered successfully but cannot be read as bytes because of CORS/origin policy remains an explicit missing-byte case for later raster fallback planning.

### Acquisition budgets

Browser defaults:

```text
2,000 references
20 MiB per resource
100 MiB total acquired bytes per snapshot
```

The implementation also applies hard caps above the configurable defaults.

### Browser runtime and persistence

Added:

```text
apps/browser-extension/src/runtime/asset-runtime.ts
apps/browser-extension/src/runtime/asset-store.ts
```

IndexedDB contract:

```text
Database: w2f-assets
Store: captures
Key: assets:<jobId>
```

The capture receipt exposes:

```text
assetStorageKey
assetAdapter
assetCount
assetReferenceCount
assetDeduplicatedReferenceCount
assetUniqueByteCount
assetDiagnosticCount
```

Standard and High Fidelity paths both resolve/persist assets from their associated RawSnapshot.

Cancellation/failure cleanup removes AssetCapture together with RawSnapshot/reference screenshot, CSS Cascade and Environment sidecars.

### Browser packaging

`@w2f/asset-resolver` is included in Browser runtime packaging and workspace imports are rewritten to packaged relative modules.

Added dedicated NODE-13 packaged-output validation:

```text
apps/browser-extension/scripts/validate-node-13-package.mjs
```

It validates:

- packaged asset runtime/store files;
- packaged Asset Resolver modules;
- packaged Standard asset acquisition;
- service-worker asset lifecycle;
- SHA-256/runtime evidence;
- IndexedDB contract;
- unresolved workspace import absence;
- privacy boundaries.

### Tests

Shared Asset Resolver tests cover:

- byte-based MIME sniffing;
- SVG classification;
- deterministic asset ids/paths;
- byte-level de-duplication;
- provenance preservation;
- unsupported media diagnostics.

Browser tests cover:

- RawSnapshot-to-asset acquisition hints;
- bounded acquisition settings;
- stable asset snapshot identity;
- canonical SHA-256 fixture;
- dedicated asset-store namespace/key behavior.

### Guardrail

Added:

```text
scripts/validate-node-13.mjs
```

The dependency-free guardrail freezes the platform-neutral core boundary, Standard acquisition evidence, browser lifecycle, packaging, W2F IR reuse, privacy/frame-realm constraints and normative docs.

## Security / privacy

NODE-13 does not read cookies, localStorage, sessionStorage or arbitrary form values.

Captured SVG bytes remain untrusted input. Secure parsing/sanitization belongs to NODE-23, not acquisition.

NODE-13 introduces no broad host permission and no static content script.

## Definition of Done

- [x] `@w2f/asset-resolver` package
- [x] `AssetCapture 1.0.0` sidecar
- [x] RawSnapshot 1.0.0 unchanged
- [x] W2F IR V2 asset contract reused
- [x] image/currentSrc evidence
- [x] CSS image URL acquisition
- [x] inline/external SVG evidence
- [x] data/blob acquisition
- [x] SHA-256 identity
- [x] deterministic embedded path
- [x] byte-level de-duplication
- [x] full many-reference Resource Provenance
- [x] explicit missing/unsupported diagnostics
- [x] acquisition budgets
- [x] same-origin iframe/open Shadow DOM targeting
- [x] frame-realm-safe element classification
- [x] Browser Asset IndexedDB sidecar
- [x] capture receipt integration
- [x] cancellation/failure cleanup
- [x] Browser runtime package integration
- [x] shared behavior tests
- [x] Browser runtime/store tests
- [x] dependency-free NODE-13 guardrail
- [x] normative implementation document
- [x] ADR-0013
- [ ] NODE-13 guardrail wired into foundation validation
- [ ] authoritative workspace lockfile refreshed
- [ ] Standard package validation PASS
- [ ] High Fidelity package validation PASS
- [ ] complete `pnpm check` PASS
- [ ] temporary bootstrap absent from final tree
- [ ] exact-head read-only frozen-lockfile CI PASS
- [ ] PR ready
- [ ] PR squash merged

## Normative documents

- `docs/ASSET_RESOLVER_V2.md`;
- `docs/adr/ADR-0013-asset-resolution-sidecar.md`;
- this node record.

## Explicit non-goals

NODE-13 does not implement canvas/video-frame capture, full raster ground truth, compositing/fallback boundary solving, final `.wtf` writing, untrusted package parsing or Figma rendering.

## Next

After NODE-13 formal Exit Gate and squash merge:

```text
NODE-14 — Pixel Ground Truth & Raster Engine
```
