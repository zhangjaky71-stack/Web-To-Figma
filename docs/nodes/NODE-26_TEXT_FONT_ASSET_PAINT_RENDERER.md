# NODE-26 — Text / Font / Asset / Paint Renderer

**Status:** IMPLEMENTING  
**Entry baseline:** `f46d69a8e13f4fad80b03f26f0dc9acddb6db383`  
**Working branch:** `node-26-text-assets-paint`

## 1. Objective

NODE-26 turns the neutral NODE-25 scene graph into a materially faithful and editable Figma reconstruction. It consumes only data that has already passed NODE-23 secure parsing and keeps the `.wtf` import local-first.

The node is responsible for five concrete outcomes:

1. web text becomes editable Figma `TextNode` content rather than rectangle placeholders;
2. captured font runs are resolved against fonts actually available in Figma and loaded before range mutation;
3. embedded image/canvas/video assets become Figma image paints without network fetches;
4. sanitized embedded SVG assets become editable Figma vector subtrees;
5. captured paint semantics are translated into Figma fills, gradients, borders, corner radii, shadows, opacity and blend modes where the platform has a native representation.

## 2. Inputs

NODE-26 consumes the validated V2 IR already carried by the Figma intake flow:

- `WtfRenderTree` including `paint`, `text`, `assetRefs`, geometry and render strategy;
- `WtfAssetsPayload.assets` metadata;
- parser-owned `binaryPayloads` for validated embedded binary resources;
- parser-owned `sanitizedSvgPayloads` for SVG that has passed the security sanitizer;
- the NODE-25 `nodesByRenderNodeId` map so visual replacement keeps the existing hierarchy, coordinates, z-order and source mapping.

The UI remaps parser payloads from embedded archive path to stable asset ID before handing them to the Figma main runtime. No URL fetch path is introduced.

## 3. Editable text contract

For every Render Tree node with `text`:

- replace its neutral scene node with a real Figma `TextNode` at the same sibling index;
- preserve layer name, local geometry and all `w2f.*` pluginData;
- preserve the full captured character string;
- apply per-run font family/style, font size, line height, letter spacing, text color and text decoration;
- apply horizontal text alignment;
- load a font before mutating text/range properties;
- if an exact captured font is unavailable, choose the closest available style in the same family, then an available local fallback, and count that fallback explicitly.

A font substitution is not silently described as pixel-perfect fidelity. It remains editable and is surfaced in renderer statistics for later QA.

## 4. Asset contract

### 4.1 Raster image assets

Validated embedded image bytes are converted with the Figma image API and used as `IMAGE` paints. CSS/object fit evidence maps conservatively to Figma `FILL`, `FIT`, `CROP` or `TILE` scale modes.

For image/canvas/video-frame Render Tree nodes, the renderer also applies the first matching embedded raster asset when the generic paint model did not already supply it.

### 4.2 SVG assets

Only parser-sanitized SVG strings are eligible. They are converted with Figma's SVG node creation path, which yields an editable Figma subtree instead of flattening the SVG to a screenshot. The replacement preserves hierarchy position, geometry, layer name and source/revision pluginData.

### 4.3 Missing embedded payloads

A missing asset payload does not trigger internet access. The renderer records a missing-asset count and leaves the reconstructable scene structure intact. NODE-29 visual/editability QA is responsible for treating unacceptable omissions as failures.

## 5. Paint contract

NODE-26 currently maps native representable semantics as follows:

| W2F semantic | Figma reconstruction |
|---|---|
| solid fill | `SOLID` paint |
| linear gradient | `GRADIENT_LINEAR` |
| radial gradient | `GRADIENT_RADIAL` |
| conic gradient | `GRADIENT_ANGULAR` |
| image fill | local Figma `IMAGE` paint |
| opacity | scene-node opacity |
| blend mode | mapped Figma blend mode when equivalent exists |
| border | stroke paint + captured width using conservative side selection |
| border radius | four independent corner radii |
| box shadow | `DROP_SHADOW` / `INNER_SHADOW` effect |

Text run fills remain authoritative for text color and are not erased by the generic paint pass.

## 6. Transaction and identity invariants

NODE-25 remains the transaction owner. NODE-26 executes before that import is reported complete. If NODE-26 throws a fatal Figma mutation error, the complete temporary import root is removed so a half-painted document is not left behind.

Every replacement node copies all existing pluginData before the old placeholder is deleted. Stable source IDs, source node IDs, revision hashes, import profile and literal-token policy therefore survive text/SVG replacement.

Sibling insertion occurs at the old node index, preserving Render Tree z-order.

## 7. Security and locality

NODE-26 must not:

- call `fetch`, `XMLHttpRequest`, `WebSocket`, dynamic remote font loading or a CDN;
- trust raw SVG that bypassed NODE-23 sanitization;
- create an asset from a URL when validated embedded bytes exist;
- store raw full IR or full binary assets in Figma pluginData.

The loadable plugin manifest continues to declare no network domains.

## 8. Known representation boundaries

This node deliberately does not pretend that every browser paint primitive has a one-to-one Figma native equivalent. The following remain for capability/fallback and QA treatment:

- different colors/styles on individual border sides;
- exact CSS gradient geometry beyond type/stops where Figma transforms differ;
- CSS filters/backdrop filters, complex masks and arbitrary clip paths;
- font files that are not available to the Figma editor runtime;
- paint semantics already classified for raster fallback by NODE-20/NODE-24.

Those cases must not be hidden by blank placeholders. NODE-28 owns hybrid/raster execution and NODE-29 measures fidelity against Pixel Ground Truth.

## 9. Exit gate

NODE-26 may be marked DONE only when all of the following are true:

- repository-wide frozen-lockfile `pnpm check` passes on the exact candidate head;
- the packaged Figma main bundle contains real text/font/image/SVG/paint execution paths;
- the packaged UI transfers validated embedded assets by asset ID and remains local-only;
- existing NODE-22 through NODE-25 intake/security/transaction invariants still pass;
- a normal read-only CI run passes after temporary bootstrap infrastructure, if any, has been removed;
- the feature branch is merged to `main` through its pull request.

## 10. Next boundary

NODE-27 adds responsive Figma layout semantics: Auto Layout, Grid translation where possible, FILL/HUG/FIXED sizing, constraints and responsive structure. NODE-28 then executes hybrid native/raster fallbacks for browser effects Figma cannot faithfully represent natively.
