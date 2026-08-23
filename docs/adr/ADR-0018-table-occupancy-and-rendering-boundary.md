# ADR-0018 — Table Occupancy and Rendering Boundary

**Status:** Accepted  
**Date:** 2026-08-23  
**Node:** NODE-18 — Table Layout Engine

## Context

HTML tables combine semantic hierarchy, a browser table-layout algorithm, spanning cells, row groups, captions, collapsed borders and resolved geometry. Flattening the result into generic flex/grid loses important source intent; rasterizing every complex table destroys editability.

## Decision

W2F will preserve tables as a dedicated analysis sidecar before render-tree optimization.

The Table Layout Engine:

1. keeps `table` / row-group / row / cell / caption identity;
2. reconstructs a deterministic occupancy grid from source row order and `rowspan` / `colspan`;
3. retains first ownership for conflicting span slots and emits diagnostics;
4. preserves computed `border-collapse`, `border-spacing`, `table-layout`, and `caption-side` evidence;
5. derives row/column track geometry when Browser cell bounds provide enough boundaries;
6. emits only renderer-neutral strategy hints (`regular-grid`, `span-hybrid`, `absolute-semantic`).

## Rendering boundary

NODE-18 does not pick final Figma APIs. Simple tables can later map to Grid or row stacks. Spanned tables can use a Grid/Absolute hybrid. Incomplete geometry can preserve semantic cells with absolute geometry. Raster fallback remains a downstream decision owned by NODE-20/NODE-28.

## Consequences

- table-heavy admin/product pages retain editable structure;
- malformed tables remain diagnosable rather than silently normalized;
- UA/default table CSS must be captured as computed evidence even when no authored declaration exists;
- the table analyzer remains deterministic and platform-neutral;
- NODE-19 can optimize render wrappers without having to reconstruct HTML table occupancy itself.
