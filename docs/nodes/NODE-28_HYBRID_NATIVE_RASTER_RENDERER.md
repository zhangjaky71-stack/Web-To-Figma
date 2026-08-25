# NODE-28 — Hybrid Native / Raster Renderer

## Entry baseline

- `main`: `4aef2daaafe338d4677e714d5bcadd26db6b152f`
- NODE-27: merged via PR #32 after exact-head CI #667 PASS
- Working branch: `node-28-hybrid-raster`

## Goal

Execute the fallback decisions already produced by NODE-20 without degrading the rest of the imported page into a screenshot.

NODE-28 keeps every supported text/vector/image/layout layer editable and replaces **only** explicit `renderStrategy: "raster"` compositing boundaries when complete, validated Pixel Ground Truth tiles are present in the `.wtf` package.

## Inputs already owned by earlier nodes

NODE-28 does not re-infer fallback from pixels or CSS.

It consumes:

1. **NODE-20 Compositing & Fallback Boundary**
   - minimal safe fallback boundaries;
   - promoted boundaries for backdrop-dependent effects;
   - `renderStrategy: "raster"` on the owning Render Tree boundary root;
   - source-node evidence on the boundary root.
2. **NODE-14 Pixel Ground Truth**
   - deterministic tile IDs: `<reference-id>:r<row>:c<column>`;
   - exact CSS-space tile bounds and DPR;
   - SHA-256-addressed PNG resources.
3. **NODE-21 `.wtf` Packager / NODE-23 Secure Parser**
   - checksummed local tile descriptors;
   - validated PNG payload bytes in `binaryPayloads`;
   - no runtime network dependency.

## Reference mapping contract

Browser capture creates local fallback references with source-addressable IDs:

```text
node-fallback:<encodeURIComponent(sourceNodeId)>
canvas:<encodeURIComponent(sourceNodeId)>
video-frame:<encodeURIComponent(sourceNodeId)>
```

NODE-20 boundary capture selects a source node that represents the promoted boundary geometry whenever possible. The NODE-28 planner therefore matches each raster Render Tree root against its `sourceNodeIds`, not against names, screenshots, DOM selectors or heuristics.

Viewport/full-page Pixel Ground Truth references are ignored by the local fallback planner unless the Render Tree root itself already has an explicit local raster reference. Whole-page rasterization is never inferred by NODE-28.

## Deterministic planner

`@w2f/figma-renderer` owns a platform-neutral hybrid planner.

For every outermost `renderStrategy: "raster"` node it:

- derives candidate source-addressed reference IDs;
- groups tiles by deterministic reference prefix;
- requires a complete zero-based row/column matrix;
- rejects duplicate cells;
- requires one viewport/DPR per reference;
- requires every tile to stay inside the boundary;
- checks row/column adjacency for gaps/overlaps;
- requires the tile matrix to cover the full boundary width and height;
- emits exact boundary-local tile geometry;
- suppresses nested raster roots already owned by an outer fallback boundary.

Incomplete evidence returns a `missing` plan rather than a partial raster plan.

## Figma execution contract

The main import pipeline becomes:

```text
NODE-25 hierarchy + geometry
        ↓
NODE-26 text / image / SVG / paint
        ↓
NODE-28 local raster-boundary replacement
        ↓
NODE-27 parent Auto Layout / Grid participation
        ↓
commit / rollback
```

For a ready raster boundary:

1. validate that **all** planned tile bytes exist locally before touching the native subtree;
2. create Figma `Image` objects from the validated PNG bytes;
3. create a clipped `FrameNode` at the same boundary geometry/sibling position;
4. reconstruct each tile as an image-filled `RectangleNode` at exact boundary-local coordinates;
5. copy all existing W2F root `pluginData` and add raster reference/tile provenance;
6. swap the new frame into the old boundary position;
7. remove descendant Render Tree mappings now owned by the raster frame;
8. pass a raster-safe shadow Render Tree to NODE-27 so the raster boundary is treated as a layout leaf while its parent can still apply captured FILL/FIXED/placement evidence.

## Missing evidence policy

A raster decision without complete packaged tile evidence is **not** rendered as blank, transparent or placeholder content.

The renderer keeps the NODE-25/26 native subtree intact and reports the boundary as `keptNativeBoundaryCount`.

This is intentionally fail-visible: later QA can report the unsupported effect, but the user still receives editable content instead of a missing region.

## Transaction and security invariants

- no `fetch`, XHR, WebSocket or remote asset resolution in the Figma runtime;
- all raster bytes originate from NODE-23 validated `.wtf` `binaryPayloads`;
- a missing tile is non-fatal and keeps the native subtree;
- a true Figma mutation failure remains inside the existing full-import-root rollback boundary;
- raster replacement preserves name, geometry, sibling position and W2F root metadata;
- raster tile layers store tile ID and SHA-256 provenance;
- native layers outside explicit NODE-20 boundaries are never flattened by NODE-28.

## Editability boundary

A raster fallback frame is intentionally pixel-backed because the source browser effect has no faithful native Figma representation under the current capability contract. Its surrounding page, hierarchy and supported siblings remain editable.

This is different from screenshot import: the page is still a structured Figma document, and rasterization is scoped to the smallest previously computed safe compositing boundary.

## Exit gate

NODE-28 may merge only when the exact branch head passes:

1. foundation validation including the permanent NODE-28 validator;
2. frozen-lockfile install;
3. lint;
4. TypeScript typecheck;
5. planner/runtime tests;
6. build;
7. packaged Figma plugin validation proving the local raster path exists and network access remains forbidden;
8. format check.

NODE-29 begins only after NODE-28 is merged.

## NODE-29 handoff

NODE-29 owns visual/structure/editability QA. It must explicitly distinguish:

- native editable reconstruction;
- intended NODE-28 local raster fallback;
- unsupported/missing raster evidence where NODE-28 deliberately kept the native subtree;
- accidental over-rasterization, which is a failure.
