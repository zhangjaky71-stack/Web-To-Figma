# ADR-0014 — Pixel Ground Truth as Content-Addressed Raster Tiles

## Status

Accepted for NODE-14 implementation; formal Exit Gate pending.

## Context

The frozen V2 architecture requires browser pixels to be preserved as first-class evidence, including current viewport reference, High Fidelity full-page reference, node fallback capture and canvas/WebGL/video visual surfaces. Large pages and raster fallbacks must use one Tile Model rather than unrelated screenshot formats.

Several constraints shape the design:

1. Pixel Ground Truth is durable product data, not only QA output.
2. Very large pages must not require one unbounded in-memory bitmap.
3. Tile geometry must remain stable across DPR values.
4. Repeated identical raster bytes should not be stored repeatedly.
5. Standard mode must remain least-privilege and must not silently scroll/mutate the page to fake High Fidelity full-page capture.
6. High Fidelity already has an explicit Chrome debugger boundary that can capture off-viewport document clips.
7. NODE-13 asset failures need a visual fallback primitive before NODE-20 compositing-boundary decisions.
8. Canvas/WebGL must be captured without page-mutating context probes.

## Decision

Introduce the additive sidecar:

```text
PixelGroundTruth 1.0.0
```

and use one deterministic Tile Model for all raster evidence.

### Tile size

The default tile dimension is:

```text
2048 × 2048 device pixels
```

The planner converts this into CSS bounds using the captured DPR. The final row/column closes against the original CSS bounds to prevent rounding drift.

### Reference identity and geometry

Every reference has a stable id, kind, viewport id, document-CSS bounds and DPR. Tile descriptors reuse the frozen `WtfReferenceTileDescriptor` contract.

### Resource identity

PNG tile bytes are SHA-256 content-addressed:

```text
references/<sha256>.png
```

Different reference descriptors may point to one identical byte resource. This deduplicates storage without erasing geometry.

### Mandatory completeness

A successful capture must contain a complete current viewport reference. A High Fidelity document capture must additionally contain a complete full-page reference.

The deterministic planner defines the expected tiles. Missing planned tiles are explicit `RASTER_TILE_MISSING` diagnostics, and mandatory incomplete references fail the Browser transaction.

### Standard acquisition

Standard uses `chrome.tabs.captureVisibleTab` under the existing `activeTab` permission and crops the resulting PNG into deterministic tiles via `createImageBitmap` + `OffscreenCanvas`.

Standard does not automatically scroll the page to create a full-page mosaic. Such scrolling can alter sticky/fixed elements, lazy loading, animations and application state.

### High Fidelity acquisition

High Fidelity plans tiles first and captures each CSS clip directly with `Page.captureScreenshot`, `captureBeyondViewport=true` and `clip.scale=DPR`. This avoids producing one huge full-page bitmap before tiling.

### Fallback surfaces

AssetCapture diagnostics with source-node identity flow into NODE-14 node fallback capture. `<canvas>` and `<video>` render surfaces are also captured. Canvas references intentionally cover both 2D and WebGL visual output without calling `getContext()` solely for classification.

NODE-14 creates raster primitives only. NODE-20 remains responsible for deciding the smallest compositing-safe fallback boundary used in the final render model.

### Persistence

Persist the sidecar in dedicated IndexedDB storage and include it in capture cancellation/failure cleanup.

## Alternatives considered

### Store one full-page PNG only

Rejected. It scales poorly for extreme page dimensions, conflicts with the frozen Tile Model, and makes partial/fallback reuse harder.

### Define 2048 as CSS pixels

Rejected. Memory cost would scale quadratically with DPR and violate the intended device-pixel tile bound.

### Scroll-and-stitch in Standard mode

Rejected as a default correctness strategy. It mutates page observation over time and can capture inconsistent application states.

### Reuse NODE-09 legacy screenshot as the final format

Rejected. That early screenshot predates the formal tile/index contract and cannot express viewport/node/canvas/video references consistently.

### Raster every asset proactively

Rejected. It bloats capture data and undermines Native First. NODE-14 rasterizes explicit render surfaces and unresolved asset sources, while NODE-13 portable bytes remain preferred.

### Probe canvas `getContext()` to distinguish WebGL

Rejected. On an uninitialized canvas this can create a context and change the page being observed. NODE-14 preserves current composed pixels without inventing semantic context classification.

## Consequences

### Positive

- one raster model for viewport, full-page and fallbacks;
- bounded device-pixel tiles;
- stable DPR-aware geometry;
- content-addressed PNG deduplication;
- explicit completeness semantics;
- full-page High Fidelity without one giant bitmap;
- Standard remains least privilege and non-scrolling;
- asset failure can flow directly into visual fallback evidence;
- frozen W2F Schema/IR versions remain unchanged.

### Costs

- Pixel Ground Truth can be large and needs explicit budgets;
- High Fidelity large pages require many sequential CDP screenshot calls;
- Standard cannot capture arbitrary off-viewport fallback nodes without changing page state;
- WebGL semantic context type is not inferred by NODE-14;
- later NODE-20/21 must consume sidecar references/resources correctly.

## Follow-up

NODE-20 will promote raster primitives to compositing-safe fallback boundaries. NODE-21 will serialize the reference tile index and PNG resources into `.wtf`. NODE-28 will use Pixel Ground Truth for visual validation and diffing.
