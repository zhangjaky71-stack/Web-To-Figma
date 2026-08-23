# NODE-14 — Pixel Ground Truth & Raster Engine

## Status

**IMPLEMENTED IN PROGRESS — guardrail, lockfile and formal Exit Gate pending**

## Entry baseline

NODE-14 starts from merged NODE-13 `main` commit:

```text
07978a586f7eb215f5e5aba0022cc6b02c1e6d28
```

Working branch:

```text
feat/node-14-pixel-ground-truth-raster-engine
```

## Goal

Create durable browser Pixel Ground Truth using one deterministic raster Tile Model for viewport, High Fidelity full-page and fallback visual surfaces while preserving least privilege, bounded memory/storage and frozen W2F V2 compatibility.

## Delivered

### Platform-neutral Pixel Ground Truth Engine

Added:

```text
packages/pixel-ground-truth
@w2f/pixel-ground-truth
```

Sidecar version:

```text
PixelGroundTruth 1.0.0
```

Core capabilities:

- deterministic raster tile planning;
- default 2048×2048 device-pixel tiles;
- DPR-aware CSS bounds;
- exact edge-tile closure;
- SHA-256 tile identity;
- `references/<sha256>.png` portable path reservation;
- unique byte-resource de-duplication;
- frozen `WtfReferenceTileDescriptor` projection;
- mandatory tile-coverage diagnostics;
- bounded tile/byte budgets;
- deterministic summary and structural validation.

### Mandatory Pixel Ground Truth

Every successful capture requires a complete:

```text
viewport:current
```

High Fidelity document capture additionally requires a complete:

```text
full-page:current
```

The deterministic plan is authoritative. Missing planned tiles produce `RASTER_TILE_MISSING`; incomplete mandatory references fail capture.

### Standard viewport capture

Standard mode uses:

```text
chrome.tabs.captureVisibleTab
createImageBitmap
OffscreenCanvas
```

to crop the current visible PNG into the unified Tile Model.

No broad host permission or debugger permission is introduced.

Standard does not scroll-and-stitch full pages. Off-viewport node fallback is fail-visible as `RASTER_UNSUPPORTED_SOURCE`.

### High Fidelity tiled capture

Added CDP tile acquisition:

```text
captureHighFidelityRasterTiles
Page.captureScreenshot
captureBeyondViewport = true
clip.scale = DPR
```

High Fidelity captures viewport and full-page references directly as planned clips instead of creating one unbounded page bitmap first.

### Node fallback bridge

The service worker reads the persisted NODE-13 AssetCapture diagnostics after asset resolution.

Asset failures carrying `sourceNodeId` are converted into NODE-14 fallback requests, including fetch, empty/oversized, budget, unsupported-media, hash and invalid/unsupported-reference cases.

High Fidelity can rasterize those nodes at arbitrary document positions. Standard only rasterizes nodes fully inside the current viewport.

### Canvas / WebGL

Every captured `<canvas>` with positive geometry receives raster evidence using:

```text
kind = canvas
reason = canvas-or-webgl-render-surface
```

The engine preserves current composed visual output without calling `getContext()` solely to classify the context, avoiding page mutation.

### Video current frame

Every captured `<video>` with positive geometry receives:

```text
kind = video-frame
reason = video-current-frame
```

Only current visual pixels are preserved; the full video stream is not packaged.

### Browser persistence

Added:

```text
apps/browser-extension/src/runtime/pixel-ground-truth-runtime.ts
apps/browser-extension/src/runtime/pixel-ground-truth-store.ts
```

IndexedDB contract:

```text
Database: w2f-pixel-ground-truth
Store: captures
Key: pixel-ground-truth:<jobId>
```

### Capture receipt integration

Capture receipts expose:

```text
pixelGroundTruthStorageKey
pixelGroundTruthAdapter
rasterReferenceCount
rasterTileReferenceCount
rasterUniqueTileCount
rasterUniqueByteCount
rasterDiagnosticCount
```

Standard and High Fidelity capture transactions persist PixelGroundTruth after RawSnapshot/CSS/Environment/Assets.

Cancellation/failure cleanup removes PixelGroundTruth together with all earlier capture artifacts.

### Browser packaging

`@w2f/pixel-ground-truth` is included in Browser runtime packaging and workspace imports are rewritten to packaged relative modules.

Added:

```text
apps/browser-extension/scripts/validate-node-14-package.mjs
```

The Standard and High Fidelity build scripts both require this package validator.

### Tests

Shared tests cover:

- DPR-aware 2048 device-pixel tile planning;
- deterministic row-major full-page tiling;
- content-addressed tile byte de-duplication;
- reference descriptor preservation;
- plan-drift rejection.

Browser tests cover:

- stable sidecar snapshot identity;
- viewport document-coordinate anchoring;
- full-page content bounds;
- SHA-256 hashing;
- dedicated Pixel Ground Truth IndexedDB namespace/key behavior.

## Definition of Done

- [x] `@w2f/pixel-ground-truth` package
- [x] `PixelGroundTruth 1.0.0` sidecar
- [x] RawSnapshot 1.0.0 unchanged
- [x] W2F Schema/IR V2 reused
- [x] 2048×2048 device-pixel unified Tile Model
- [x] deterministic row/column tiling
- [x] content-addressed PNG tile resources
- [x] SHA-256 tile de-duplication
- [x] complete viewport reference contract
- [x] High Fidelity full-page tiled reference
- [x] Standard visible viewport capture
- [x] High Fidelity direct CDP clip capture
- [x] node fallback references for unresolved assets
- [x] canvas/WebGL visual surface capture
- [x] video current-frame capture
- [x] explicit unsupported/off-viewport diagnostics
- [x] mandatory missing-tile detection
- [x] raster budgets
- [x] Browser IndexedDB sidecar
- [x] capture receipt integration
- [x] cancellation/failure cleanup
- [x] Browser runtime package integration
- [x] shared core tests
- [x] Browser helper/store tests
- [x] NODE-14 packaged-output validator
- [x] normative implementation document
- [x] ADR-0014
- [ ] dependency-free NODE-14 guardrail
- [ ] guardrail wired into foundation validation
- [ ] authoritative workspace lockfile refreshed
- [ ] complete `pnpm check` PASS
- [ ] Standard package validation PASS
- [ ] High Fidelity package validation PASS
- [ ] temporary bootstrap absent from final tree
- [ ] exact-head read-only frozen-lockfile CI PASS
- [ ] PR ready
- [ ] PR squash merged

## Explicit non-goals

NODE-14 does not choose final compositing-safe fallback ancestors, infer layout/paint semantics, write the final `.wtf`, render Figma nodes or compute final pixel-diff scores.

## Next

After NODE-14 formal Exit Gate and squash merge, continue the frozen roadmap with the next implementation node defined by the baseline.
