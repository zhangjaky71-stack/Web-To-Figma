# Pixel Ground Truth & Raster Engine V2

## Purpose

NODE-14 turns browser-rendered pixels into first-class, deterministic capture evidence. Pixel Ground Truth is not a temporary QA screenshot: it is a durable sidecar consumed by later fallback planning, `.wtf` packaging and visual validation.

NODE-14 extends the merged NODE-13 pipeline without changing `RawSnapshot 1.0.0`, W2F Schema 2.0 or W2F IR 2.0.

## Sidecar boundary

The Browser capture pipeline adds:

```text
PixelGroundTruth 1.0.0
```

One sidecar is associated with one RawSnapshot through the stable snapshot identity:

```text
snapshot:<RawSnapshot.capturedAt>
```

The sidecar stores:

- viewport reference evidence;
- High Fidelity full-page reference evidence;
- node-level fallback references;
- canvas/WebGL render-surface references;
- video-current-frame references;
- deterministic tile descriptors;
- content-addressed PNG tile bytes;
- explicit capture/coverage diagnostics.

## Frozen W2F compatibility

NODE-14 reuses the already frozen V2 concepts:

```text
feature: pixel-ground-truth
feature: raster-tiles
WtfReferenceTileDescriptor
reference-tiles-index
reference-tile
fallback
entrypoints.referenceTiles
```

No W2F major-version change is required.

## Mandatory reference rules

Every successful PixelGroundTruth capture must contain a complete viewport reference:

```text
viewport:current
```

For High Fidelity document capture, it must additionally contain a complete full-page tiled reference:

```text
full-page:current
```

A reference is complete only when every tile from the deterministic tile plan was accepted and hashed. One successful tile is not enough.

Missing planned tiles produce:

```text
RASTER_TILE_MISSING
```

Mandatory viewport/full-page references with missing tiles fail the Browser capture transaction rather than masquerading as complete ground truth.

## Unified Tile Model

The default tile dimension is:

```text
2048 × 2048 device pixels
```

`2048` is intentionally a device-pixel limit, not CSS pixels.

Example at DPR 2:

```text
2048 device px / 2 DPR = 1024 CSS px
```

A 1200 CSS px wide viewport at DPR 2 therefore plans:

```text
tile 0: 1024 CSS px / 2048 device px
tile 1: 176 CSS px / 352 device px
```

Edge tiles close against the original CSS reference bounds so `ceil(cssSize × dpr)` does not introduce CSS-geometry drift.

The same Tile Model is used for:

- viewport references;
- full-page references;
- node fallbacks;
- canvas/WebGL render surfaces;
- video frames.

## Deterministic tile identity

A reference tile plan uses row-major ids:

```text
<referenceId>:r<row>:c<column>
```

Examples:

```text
viewport:current:r0:c0
full-page:current:r3:c1
canvas:node%3Ahero:r0:c0
```

The tile descriptor retains:

```text
id
path
viewportId
bounds (document CSS coordinates)
dpr
sha256
```

## Content-addressed PNG resources

Each accepted PNG tile is SHA-256 hashed.

Canonical resource path:

```text
references/<sha256>.png
```

Tile bytes are de-duplicated by SHA-256 across references. Reference descriptors are never de-duplicated away, so two different geometry locations may point at the same PNG resource while preserving their own bounds and ids.

This keeps later `.wtf` packaging compact without losing Pixel Ground Truth geometry.

## Standard profile

The Standard Browser profile retains least privilege and does not add debugger or broad host permissions.

Viewport capture flow:

```text
activeTab user action
→ chrome.tabs.captureVisibleTab(PNG)
→ createImageBitmap
→ deterministic Tile Model
→ OffscreenCanvas crop
→ PNG tile bytes
→ SHA-256
```

Standard mode deliberately does not scroll the page to synthesize a High Fidelity full-page image. Automatic scrolling could mutate sticky/fixed/lazy-loaded/animated state and produce a composite that never existed in one browser frame.

Therefore Standard guarantees the current viewport reference. Node fallback capture is available only when the node is fully inside that captured viewport. Off-viewport sources remain explicit diagnostics:

```text
RASTER_UNSUPPORTED_SOURCE
```

## High Fidelity profile

High Fidelity uses the existing explicit Chrome `debugger` permission.

Instead of generating one enormous bitmap and then slicing it, the runtime plans CSS clip bounds first and captures each tile directly:

```text
Page.captureScreenshot
format = png
fromSurface = true
captureBeyondViewport = true
clip = planned CSS bounds
clip.scale = current DPR
```

This allows full-page Pixel Ground Truth for very large documents while respecting the unified device-pixel tile limit.

High Fidelity captures:

- current viewport reference;
- full-page tiled reference for document capture;
- off-viewport node-level fallbacks;
- canvas/WebGL render surfaces;
- video-current-frame surfaces.

## Node fallback capture

NODE-13 resolves portable image/SVG bytes first. NODE-14 reads the AssetCapture sidecar and converts asset failures carrying a `sourceNodeId` into raster fallback requests.

Relevant failure classes include fetch failure, unsupported media, empty/oversized resource, budget exhaustion, hash failure and invalid/unsupported references.

Flow:

```text
native asset acquisition
→ NODE-13 High Fidelity alternate provider when available
→ unresolved sourceNodeId
→ NODE-14 node-level raster reference
→ later NODE-20 chooses the final compositing-safe fallback boundary
```

NODE-14 captures fallback primitives; it does not yet decide whether a node, ancestor or larger compositing region must ultimately be rasterized in Figma. That promotion logic belongs to NODE-20.

## Canvas and WebGL

Every captured `<canvas>` is treated as a current render surface and receives a raster reference when positive geometry is available.

The reference reason is:

```text
canvas-or-webgl-render-surface
```

NODE-14 intentionally does not probe `getContext()` solely to classify 2D versus WebGL, because calling `getContext()` on an uninitialized canvas can create a rendering context and mutate the page. Visual pixels are preserved without inventing semantic context evidence.

High Fidelity CDP clipping captures the composed visual surface, including WebGL output. Standard captures a canvas only when it lies fully inside the current viewport screenshot.

## Video current frame

Captured `<video>` nodes receive:

```text
kind = video-frame
reason = video-current-frame
```

NODE-14 preserves the currently rendered frame visually. It does not download or package the entire video media stream.

## Coordinate model

Reference/tile bounds are document CSS coordinates.

Viewport origin prefers:

```text
visualViewport.pageX/pageY
→ layoutViewport.pageX/pageY
→ 0/0 fallback
```

Full-page bounds prefer CDP/RawSnapshot `contentSize`, then root captured geometry, then viewport bounds as a conservative fallback.

DPR is always taken from the RawSnapshot Scale Context.

## Budgets

Current Browser limits:

```text
max tile references: 20,000
max unique raster bytes: 512 MiB
```

Core hard caps prevent accidental unbounded expansion:

```text
max tile references: 100,000
max unique raster bytes: 1 GiB
max tile dimension: 8192 device px
```

Budget exhaustion is fail-visible through diagnostics.

## Diagnostics

NODE-14 diagnostics include:

```text
RASTER_REFERENCE_INVALID
RASTER_TILE_INVALID
RASTER_TILE_MISSING
RASTER_TILE_EMPTY
RASTER_TILE_HASH_FAILED
RASTER_TILE_COUNT_EXCEEDED
RASTER_TOTAL_BYTES_EXCEEDED
RASTER_CAPTURE_FAILED
RASTER_SOURCE_NODE_UNRESOLVED
RASTER_UNSUPPORTED_SOURCE
```

No missing tile or unsupported source is converted into invented pixel evidence.

## Browser persistence

Pixel Ground Truth uses a dedicated IndexedDB sidecar:

```text
Database: w2f-pixel-ground-truth
Store: captures
Key: pixel-ground-truth:<jobId>
```

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

Cancellation/failure cleanup deletes Pixel Ground Truth together with RawSnapshot/reference screenshot, CSS Cascade, Environment and AssetCapture artifacts.

## Privacy and permission boundary

NODE-14 does not read:

- cookies;
- localStorage;
- sessionStorage;
- form text values.

Standard retains `activeTab + scripting + storage`. High Fidelity reuses the already explicit `debugger` permission.

No broad default host permission or static content script is introduced.

## Relationship to the legacy reference screenshot

NODE-09 already persisted one High Fidelity `captureBeyondViewport` PNG as early reference evidence.

NODE-14 does not silently reinterpret that historical record as the final Tile Model. The new PixelGroundTruth sidecar is the authoritative reference/tile source for future NODE-20/21/28 work. The legacy record remains temporarily for compatibility until downstream migration is complete.

## Explicit non-goals

NODE-14 does not implement:

- final compositing-safe fallback boundary promotion;
- layout/paint inference;
- final `.wtf` ZIP writing;
- responsive multi-viewport inference;
- Figma raster/native node rendering;
- pixel-diff scoring itself;
- arbitrary video stream packaging.

Those remain assigned to later frozen nodes.
