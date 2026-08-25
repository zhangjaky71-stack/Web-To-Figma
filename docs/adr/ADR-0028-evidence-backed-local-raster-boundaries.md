# ADR-0028 — Execute Only Evidence-Backed Local Raster Boundaries

## Status

Accepted for NODE-28 implementation.

## Context

Browser rendering contains effects that Figma cannot always reproduce faithfully with editable native primitives: backdrop filters, some masks/filters, canvas/WebGL/video pixels, and compositing relationships that depend on already-painted backdrop pixels.

The project already has two upstream decisions:

- NODE-20 computes the smallest safe compositing fallback boundary and marks its Render Tree root `renderStrategy: "raster"`.
- NODE-14 captures deterministic Pixel Ground Truth PNG tiles for requested source nodes, and NODE-21 packages those bytes into `.wtf`.

The Figma importer therefore does not need a second heuristic fallback engine. Re-deciding fallback during import could enlarge boundaries, create whole-page screenshots, or disagree with capture-time evidence.

## Decision

NODE-28 SHALL execute only explicit, evidence-backed raster boundaries.

### 1. Upstream boundary ownership is authoritative

The Figma importer will not rasterize a node merely because a paint/layout property looks difficult. A raster candidate must already be an outermost Render Tree node with `renderStrategy: "raster"`.

### 2. Reference association is source-addressed

Raster tiles are associated through the capture convention:

```text
node-fallback:<encoded source id>
canvas:<encoded source id>
video-frame:<encoded source id>
```

The importer tests those IDs against the boundary root's `sourceNodeIds` and requires exact tile coverage.

### 3. Complete evidence or no replacement

A boundary is replaced only if the complete tile matrix and every corresponding validated binary payload are available. Missing descriptors/bytes keep the native subtree. Partial rasterization is forbidden.

### 4. Raster is local, not document-wide by default

Only the explicit boundary subtree is replaced. Native siblings, ancestors and unrelated descendants remain editable. A document-root raster is allowed only if upstream compositing analysis already chose the document root as the minimal safe boundary and local source-addressed evidence exists.

### 5. Raster frames are layout leaves

Raster tile rectangles must remain at fixed boundary-local coordinates. NODE-27 may still position/size the raster frame as a child of its parent layout, but it must not reinterpret the tile rectangles as Flex/Grid children. NODE-28 therefore provides a raster-safe shadow Render Tree that neutralizes container layout mode only for successfully rasterized roots.

### 6. Provenance is retained

The replacement frame keeps W2F root pluginData. Tile layers record their reference tile ID and SHA-256 digest; the frame records reference/source IDs.

## Consequences

### Positive

- avoids screenshot-only imports;
- prevents import-time fallback drift;
- preserves maximum editability;
- keeps unsupported browser pixels visually representable;
- fails safely when evidence is missing;
- remains local/offline after `.wtf` parsing;
- gives NODE-29 explicit provenance for QA.

### Tradeoffs

- raster fallback content itself is not semantically editable;
- a missing raster reference leaves a potentially imperfect native approximation rather than exact pixels;
- raster frames represent the captured viewport/state and cannot magically regenerate browser effects at arbitrary later Figma sizes;
- multi-tile boundaries introduce extra Figma rectangle layers.

## Rejected alternatives

### Rasterize every unsupported-looking property during import

Rejected because it duplicates NODE-20, can disagree with capture-time compositing evidence, and risks over-rasterization.

### Always use the full-page Pixel Ground Truth image

Rejected because it destroys hierarchy/editability and violates the product acceptance standard.

### Render partial tile sets

Rejected because gaps/transparent holes are worse than retaining the native subtree and make fidelity failures harder to diagnose.

### Fetch missing images from the original page at import time

Rejected because `.wtf` import must be deterministic, offline-capable and secure; remote content may also have changed.

## Follow-up

NODE-29 must measure intended local raster boundaries separately from native editability and flag accidental boundary enlargement or missing evidence.
