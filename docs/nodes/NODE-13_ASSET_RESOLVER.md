# NODE-13 — Asset Resolver

## Status

**IMPLEMENTED — formal read-only frozen-lockfile Exit Gate pending**

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

Resolve browser-rendered image/SVG resources into deterministic, content-addressed portable evidence while preserving browser-selected sources, Resource Provenance, explicit missing-resource diagnostics, least-privilege Browser permissions and the frozen W2F IR V2 boundary.

## Frozen scope

NODE-13 implements:

```text
images
currentSrc
CSS image
SVG
data
blob
hash
dedup
```

The V2 missing-asset chain is respected as:

```text
native fetch
→ alternate provider
→ NODE-14 screenshot fallback
→ later placeholder + diagnostic
```

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

The package owns:

- asset contracts and provenance;
- RawSnapshot/NODE-11 evidence discovery helpers;
- CSS `url(...)` extraction;
- shared URL resolution through Source Providers;
- data URL decoding;
- bounded generic acquisition;
- MIME/content identification;
- SHA-256 content identity validation;
- deterministic embedded-path selection;
- byte-level de-duplication;
- many-reference provenance preservation;
- W2F IR asset-record projection;
- capture summary and structural validation.

DOM traversal/network/IndexedDB/CDP remain Browser adapter/runtime responsibilities.

### Supported browser resource evidence

Standard page-side acquisition covers:

- `<img>`;
- `<picture>` selected source through `currentSrc`;
- CSS `background-image` URLs;
- CSS `mask-image` / `-webkit-mask-image` URLs;
- CSS `border-image-source` URLs;
- generated `content` URL images;
- inline SVG;
- external SVG;
- `<input type=image>`;
- video poster images;
- `data:` URLs;
- `blob:` URLs.

### Responsive image evidence

For image elements NODE-13 preserves browser-selected `currentSrc`, authored `src`, intrinsic/natural dimensions where observable and rendered bounds.

The browser remains authoritative for `srcset` / `<picture>` selection; W2F does not recreate that algorithm.

### Portable discovery layer

Added:

```text
packages/asset-resolver/src/discovery.ts
```

It can combine RawSnapshot, NODE-11 cascade evidence and optional live DOM evidence to discover asset candidates while retaining stylesheet/source provenance.

The CSS URL scanner handles multiple/quoted/unquoted URL references and data URL parentheses without relying on a fragile single regular expression.

### Generic bounded acquisition

Added:

```text
packages/asset-resolver/src/acquisition.ts
```

It provides:

- data URL decoding;
- inline SVG byte conversion;
- locator fetch de-duplication;
- per-asset/count/total byte budgets;
- generic fetcher adapter boundary;
- SHA-256 Web Crypto helper.

### Frame and Shadow DOM behavior

Standard page acquisition reuses RawSnapshot frame/source-selector hints and supports accessible same-origin iframe/open Shadow DOM targets.

Element classification avoids top-window realm-sensitive image/SVG `instanceof` checks so same-origin iframe elements remain discoverable.

### CSS image evidence

Observed image URL resources are extracted from computed CSS. NODE-11 authored cascade evidence stays a separate sidecar but can enrich portable discovery provenance.

Gradients/cross-fade remain paint semantics rather than binary assets and are intentionally not rasterized by NODE-13.

### Content addressing

Browser runtime computes SHA-256 with Web Crypto.

Canonical identity:

```text
asset:<sha256>
```

Reserved future package path:

```text
assets/<sha256>.<extension>
```

Identical bytes from different URLs/properties/source nodes resolve to one unique asset while retaining all reference/provenance evidence.

### MIME/content identification

Current recognition covers:

- PNG;
- JPEG;
- GIF;
- WebP;
- AVIF;
- ICO;
- BMP;
- SVG.

Byte/content evidence is preferred over URL suffix. Unsupported media remains an explicit diagnostic.

### Native fetch provider

Standard acquisition fetches resource bytes in the page context. This preserves page-session, file/data/blob semantics without broad extension host permissions.

Native fetch failures remain explicit rather than being treated as acquired assets.

### High Fidelity alternate provider

High Fidelity now implements the V2 alternate-provider stage for native-fetch failures through existing Chrome debugger permission:

```text
Page.getResourceTree
→ loaded URL/frame match
→ Page.getResourceContent
→ recovered bytes
```

This is limited to resources Chromium already loaded for the captured page. It is not an arbitrary cross-origin crawler and introduces no broad host permission.

Recovered acquisition references remove their original `ASSET_FETCH_FAILED` diagnostics. Unrecoverable resources remain explicit for NODE-14 pixel fallback.

Debugger attach/detach is `try/finally` guarded.

### Resource Provenance

Asset evidence preserves source type/node/URL/original URL/frame/origin/stylesheet/property information where available. Content deduplication never discards logical references.

### Explicit failure semantics

NODE-13 records failures instead of inventing resources, including:

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
ASSET_REFERENCE_INVALID
ASSET_REFERENCE_UNSUPPORTED
ASSET_CSS_URL_INVALID
ASSET_INLINE_SVG_INVALID
```

Missing asset bytes do not fail the overall capture.

### Acquisition budgets

Browser defaults:

```text
2,000 references
20 MiB per resource
100 MiB total per snapshot
```

Budget exhaustion is fail-visible.

### Browser runtime and persistence

Added:

```text
apps/browser-extension/src/runtime/asset-runtime.ts
apps/browser-extension/src/runtime/asset-store.ts
```

IndexedDB:

```text
Database: w2f-assets
Store: captures
Key: assets:<jobId>
```

Capture receipt fields:

```text
assetStorageKey
assetAdapter
assetCount
assetReferenceCount
assetDeduplicatedReferenceCount
assetUniqueByteCount
assetDiagnosticCount
```

Standard and High Fidelity capture paths persist assets from their associated RawSnapshot.

Cancellation/failure cleanup removes AssetCapture together with RawSnapshot/reference screenshot, CSS Cascade and Environment sidecars.

### Browser packaging

`@w2f/asset-resolver` is a Browser runtime package and workspace imports are rewritten to packaged relative modules.

Standard and High Fidelity builds both run:

```text
validate-extension-package.mjs
validate-node-13-package.mjs
```

The NODE-13 validator verifies asset runtime/store, resolver/discovery/acquisition modules, Standard acquisition, service-worker lifecycle, CDP alternate provider, no unresolved workspace imports and privacy boundaries.

### Tests

Asset Resolver tests cover:

- MIME/content identification;
- SVG classification;
- deterministic IDs/paths;
- SHA-256 content de-duplication;
- provenance preservation;
- `currentSrc` vs authored source discovery;
- CSS URL discovery/provenance;
- inline SVG discovery;
- data URL decoding;
- known SHA-256 fixture;
- one-fetch/many-reference behavior;
- acquisition budgets;
- unsupported media diagnostics.

Browser tests cover:

- RawSnapshot-to-asset acquisition hints;
- bounded acquisition settings;
- stable asset snapshot identity;
- canonical SHA-256 fixture;
- dedicated asset-store namespace/key behavior.

### Guardrail

`validate-node-13.mjs` freezes the AssetCapture contract, portable core/adapters, Standard acquisition, High Fidelity alternate provider, Browser lifecycle/packaging, W2F IR reuse, privacy/permission boundary and normative docs.

## Security / privacy

NODE-13 does not persist cookies, authorization/request headers, localStorage, sessionStorage, passwords or arbitrary form values.

Captured SVG remains untrusted passive evidence. NODE-23 owns secure archive parsing/SVG sanitization before Figma rendering.

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
- [x] portable RawSnapshot/Cascade discovery
- [x] shared URL resolution
- [x] SHA-256 identity
- [x] deterministic embedded path
- [x] byte-level de-duplication
- [x] many-reference Resource Provenance
- [x] explicit missing/unsupported diagnostics
- [x] acquisition budgets
- [x] same-origin iframe/open Shadow DOM targeting
- [x] frame-realm-safe element classification
- [x] Standard native page fetch
- [x] High Fidelity CDP alternate provider
- [x] CDP resource-tree/content recovery
- [x] Browser Asset IndexedDB sidecar
- [x] capture receipt integration
- [x] cancellation/failure cleanup
- [x] Browser runtime package integration
- [x] shared behavior tests
- [x] Browser runtime/store tests
- [x] NODE-13 package validator
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

NODE-13 does not implement canvas/WebGL/video-frame capture, pixel ground truth, screenshot fallback capture, compositing/fallback-boundary solving, final `.wtf` archive writing, untrusted package parsing, Figma asset rendering, fonts or responsive inference.

## Next

After NODE-13 formal Exit Gate and squash merge:

```text
NODE-14 — Pixel Ground Truth & Raster Engine
```
