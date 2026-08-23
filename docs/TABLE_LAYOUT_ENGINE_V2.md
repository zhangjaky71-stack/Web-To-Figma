# Table Layout Engine V2

## Purpose

NODE-18 reconstructs captured HTML table structure into deterministic, renderer-neutral evidence. It consumes persisted `RawSnapshot` and CSS Cascade evidence only; it does not query the live page and it does not choose final Figma nodes.

The V2 baseline explicitly covers:

```text
table
thead
tbody
tfoot
tr
td
th
caption
rowspan
colspan
border-collapse
border-spacing
table-layout
```

## Source hierarchy

The source hierarchy remains authoritative for semantic boundaries:

- `table` is the table root;
- `thead`, `tbody`, and `tfoot` become explicit row groups;
- direct `tr` children of a table become deterministic anonymous row groups;
- `tr` owns the captured `td` / `th` cells;
- `caption` remains an explicit semantic child and preserves `caption-side` evidence;
- malformed cells outside rows remain diagnostics and are not silently invented into a row.

NODE-19 may later optimize wrapper structure, but NODE-18 must not destroy source semantics.

## Occupancy grid

Cells are placed by source row order. Before placing each cell, the engine advances past slots already occupied by a preceding rowspan. A cell origin then reserves the rectangle:

```text
[rowIndex, rowEnd) × [columnIndex, columnEnd)
```

`colspan` is a positive integer. Invalid values degrade to `1` with `TABLE_SPAN_INVALID`.

`rowspan` is a positive integer; HTML `rowspan="0"` is represented as spanning through the remaining captured rows. Invalid negative/non-integer values degrade to `1` with a diagnostic.

If a span footprint collides with an already occupied grid slot, first ownership is retained and `TABLE_SPAN_CONFLICT` is emitted. The engine never silently rewrites unrelated cells to make a malformed table look valid.

## Geometry and tracks

Semantic occupancy is authoritative even when geometry is incomplete. When resolved Browser cell geometry is present, the engine derives candidate row and column boundaries from cell start/end edges and builds deterministic row/column tracks.

A track may remain partially unresolved. This emits `TABLE_GEOMETRY_INCOMPLETE` but does not discard row/cell semantics.

## Table CSS evidence

NODE-18 requires computed evidence for:

```text
border-collapse
border-spacing
table-layout
caption-side
```

The Standard and High Fidelity capture paths preserve those computed properties even when no authored declaration exists, so UA/default behavior is not guessed by the table engine.

Authored values remain attached through the existing CSS Cascade evidence when available.

## Border model

`border-collapse` remains an explicit table-level property. NODE-18 does not flatten the collapsed-border conflict algorithm into a raster result.

`border-spacing` is parsed as horizontal/vertical resolved pixel spacing when available. In collapsed mode downstream renderers may ignore spacing visually, but the captured semantic evidence remains preserved.

## Strategy hints

NODE-18 emits renderer-neutral hints only:

### `regular-grid`

All cells occupy a single grid slot and Browser geometry resolves the table tracks. This is a good downstream candidate for Figma Grid or vertical rows containing horizontal cells.

### `span-hybrid`

At least one cell uses rowspan/colspan while track geometry is resolved. Downstream rendering may combine Grid and absolute positioning while preserving semantic cell hierarchy.

### `absolute-semantic`

Geometry is insufficient to reconstruct all tracks. Downstream rendering may preserve semantic cells with resolved absolute geometry rather than fabricating a regular Grid.

These are hints, not final Figma capability decisions.

## Raster boundary

Complex tables are not rasterized by default. A table with spans should first preserve semantic cell hierarchy and resolved geometry. NODE-20 owns compositing/fallback promotion and NODE-28 owns hybrid native/raster rendering.

## Determinism

For identical `RawSnapshot` + CSS Cascade inputs, NODE-18 must emit identical:

- row group order;
- row indices;
- cell grid coordinates;
- rowspan/colspan extents;
- occupancy slots;
- row/column track evidence;
- diagnostics;
- strategy hint.

The core package must not use live DOM, Chrome APIs, IndexedDB, fetch, random values, or wall-clock time.

## Persistence

Browser capture stores the result in a dedicated IndexedDB sidecar namespace:

```text
DB: w2f-table-layout
store: captures
key: table-layout:<jobId>
```

The capture receipt records table, row, cell, span and diagnostic counts.

## Ownership boundaries

NODE-18 owns table reconstruction only.

- NODE-19 — Render Tree Optimizer: wrapper elimination, semantic boundaries and source mapping.
- NODE-20 — Compositing & Fallback Boundary: raster/fallback promotion decisions.
- NODE-21 — WTF Packager: portable manifest/reference packaging.
- NODE-25/27/28 — final Figma rendering strategy and capability downgrade.
