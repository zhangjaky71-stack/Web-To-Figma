# NODE-28 — Hybrid Native / Raster Renderer

## Status

Implementation node after NODE-27 responsive layout. NODE-29 owns Pixel Ground Truth comparison, fidelity scoring and editability QA.

## Goal

Reconstruct every native-compatible web element as editable Figma content, while materializing PNG pixels only at the smallest upstream boundary explicitly marked `renderStrategy: "raster"`.

A raster fallback is a local compatibility surface, not a shortcut for importing the page as a screenshot.

## Non-negotiable rules

1. **No whole-page screenshot substitution.** `viewport` and `full-page` references are Pixel Ground Truth / QA evidence only and must never be accepted as NODE-28 fallback surfaces.
2. **Minimal safe boundary only.** A render node marked `raster` becomes one Figma Frame; only descendants inside that boundary are suppressed from native reconstruction.
3. **Native siblings remain editable.** Text, image, sanitized SVG, paint, Auto Layout and Grid outside raster boundaries continue through NODE-26/27 reconstruction.
4. **Source-bound evidence only.** A fallback must match one of the raster render node's `sourceNodeIds`; geometry-only guessing is forbidden.
5. **Validated local bytes only.** PNG bytes must come from the already validated `.wtf` archive. NODE-28 performs no network re-fetch.
6. **Fail closed.** Missing reference index, non-covering evidence, missing tile bytes, invalid tile geometry or an invalid Figma target aborts and rolls back the import.
7. **No silent downscale.** Large fallback surfaces stay tiled according to the capture evidence instead of being flattened or reduced in resolution.
8. **Mapping survives.** The raster boundary retains normal W2F render/source/revision pluginData; tile helper layers also record reference/tile provenance.

## Input contract

NODE-28 consumes:

- final `WtfRenderTree` from NODE-20/21 where final fallback roots already carry `renderStrategy: "raster"`;
- `sourceGraph` and normal assets used by NODE-25/26/27;
- `references/index.json` from NODE-14 Pixel Ground Truth capture;
- content-addressed PNG reference-tile payloads already integrity-checked by NODE-23.

Only these reference kinds are eligible for fallback materialization:

- `node-fallback`
- `canvas`
- `webgl`
- `video-frame`

These kinds are explicitly ineligible:

- `viewport`
- `full-page`

## Import pipeline

```text
validated .wtf
  -> basic hierarchy/geometry transaction
  -> stop native descendants below raster boundaries
  -> NODE-26 editable text/assets/paint on native nodes
  -> NODE-27 Flex/Grid/layout reconstruction
  -> NODE-28 local raster materialization
  -> commit result / rollback on any failure
```

### Partial import rule

If a selected section or render node sits inside a raster fallback ancestor, NODE-28 escalates the selection to the nearest raster ancestor. This is the smallest boundary that preserves the upstream compositing decision. It avoids importing an inner subtree whose appearance depends on effects that were intentionally collapsed at the ancestor boundary.

## Figma representation

For each rendered raster boundary:

- the boundary is always a Figma `FRAME`;
- its existing W2F source mapping remains on the Frame;
- internal Auto Layout/Grid is disabled because the frame's interior is pixel evidence rather than editable structure;
- `clipsContent = true` prevents tile overhang;
- native fills/strokes/effects on the boundary are cleared before the raster surface is applied;
- one Figma Rectangle is created per reference tile;
- each tile Rectangle uses `figma.createImage(validatedBytes)` with exact CSS-space tile bounds;
- DPR stays as provenance metadata while Figma geometry remains in CSS coordinate units;
- tile order is deterministic by y/x/id.

The raster Frame itself remains positionable, selectable and traceable; only its internal visual content is rasterized.

## Protocol contract

`W2fBasicRenderRequest` formally carries:

- `assets`
- `assetPayloadsById`
- `sanitizedSvgById`
- `rasterReferences`
- `rasterTilePayloadsByPath`

The protocol validator rejects malformed reference descriptors, invalid hashes, unsupported fallback kinds and raster references whose tile payloads are absent.

The UI extracts only references whose `sourceNodeId` belongs to a render node currently marked `raster`. Full-page and viewport evidence is never forwarded as a fallback candidate.

## Error contract

NODE-28 uses explicit errors:

- `W2F_E_RASTER_REFERENCE_MISSING`
- `W2F_E_RASTER_REFERENCE_BOUNDS`
- `W2F_E_RASTER_TILE_MISSING`
- `W2F_E_RASTER_TILE_INVALID`
- `W2F_E_RASTER_TARGET_INVALID`

Any such error removes the in-progress import root. There is no emergency full-page screenshot fallback.

## Acceptance tests

NODE-28 is accepted only when all of the following hold:

- raster boundaries are emitted as Frames;
- descendants below raster boundaries are not duplicated as native Figma layers;
- native siblings still render normally;
- a raster whole-root suppresses its entire native subtree;
- partial selection inside a raster subtree escalates to the nearest raster boundary;
- native visual reconstruction strips text/SVG asset replacement from raster roots;
- raster references are selected by source mapping and must cover the fallback boundary;
- every tile must have validated local bytes;
- `full-page` evidence is rejected by the protocol fallback type guard;
- the implementation contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `eval` or `new Function` path;
- cancellation/failure still removes the complete import root;
- repository lint, typecheck, test, build and formatting checks pass.

## Boundaries with adjacent nodes

- **NODE-20:** decides and prunes the final minimal compositing fallback boundaries.
- **NODE-23:** validates archive structure, checksums and embedded payload safety.
- **NODE-24:** resolves current Figma capability support.
- **NODE-25:** creates transactional hierarchy/geometry and source mapping.
- **NODE-26:** restores editable text/fonts/assets/paint on native-compatible nodes.
- **NODE-27:** restores responsive Flex/Grid/layout behavior on native-compatible nodes.
- **NODE-28:** executes the final hybrid native/local-raster representation.
- **NODE-29:** measures visual fidelity against Pixel Ground Truth and verifies editability acceptance.

## Definition of done

NODE-28 is done when the exact PR head passes CI and the resulting import never uses a page-level screenshot as a substitute for editable Figma layers. Rasterization is permitted only at explicit, source-bound, minimal fallback boundaries whose PNG evidence is already contained in the validated `.wtf` package.
