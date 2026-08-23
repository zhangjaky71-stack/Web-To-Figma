# Asset Resolver V2

## Purpose

NODE-13 resolves browser-rendered image resources into deterministic, portable asset evidence for later `.wtf` packaging and Figma rendering. It extends the NODE-08 through NODE-12 capture pipeline without changing the frozen `RawSnapshot 1.0.0` or W2F IR V2 asset contract.

The implementation follows the frozen V2 Baseline + V2.1 Addendum.

## Sidecar boundary

NODE-13 stores resolved resources separately as:

```text
AssetCapture 1.0.0
```

One sidecar is associated with one RawSnapshot through the deterministic snapshot identity derived from the raw capture timestamp.

The sidecar contains:

- resolved unique asset records;
- original resource bytes;
- all observed Resource Provenance entries;
- source-node references;
- acquisition identities;
- explicit acquisition/resolution diagnostics.

`RawSnapshot 1.0.0` remains unchanged.

## Supported resource classes

NODE-13 currently resolves browser-rendered image-like resources from:

```text
<img>
<picture> selected image via currentSrc
CSS background-image url(...)
CSS mask-image / -webkit-mask-image url(...)
CSS border-image-source url(...)
generated content url(...)
inline SVG
external SVG
<input type=image>
video poster
data: URL
blob: URL
```

Gradients remain CSS paint semantics and are not converted into image assets by NODE-13.

Canvas pixels, video-frame extraction, final raster fallback and pixel-reference evidence belong to later raster/compositing nodes.

## Responsive image semantics

For `<img>` / `<picture>`, the browser is the authority for the actually rendered resource.

NODE-13 therefore stores:

```text
currentSrc     = browser-selected rendered resource
authoredSrc    = source `src` when present
intrinsicWidth = naturalWidth
intrinsicHeight = naturalHeight
width/height   = observed rendered bounds when available
```

`currentSrc` is used for byte acquisition. `authoredSrc` is retained as provenance/semantic evidence.

NODE-13 does not reimplement `srcset` selection.

## CSS image resources

NODE-13 reads computed CSS for captured source nodes, including captured pseudo nodes, and extracts `url(...)` references from:

- `background-image`;
- `mask-image`;
- `-webkit-mask-image`;
- `border-image-source`;
- `content`.

Using computed CSS ensures the current rendered resource is captured while NODE-11 continues to preserve authored cascade semantics separately.

## SVG

### Inline SVG

An inline `<svg>` element is serialized with `XMLSerializer` and stored as UTF-8 SVG bytes.

The asset record remains:

```text
kind = svg
mediaType = image/svg+xml
```

so later Figma rendering can preserve vector editability where safe and supported.

### External SVG

External SVG references are fetched as bytes and identified through byte/content evidence plus MIME/URL hints.

### Security boundary

NODE-13 captures bytes; it does not execute captured asset payloads and does not treat captured SVG as trusted input.

Untrusted `.wtf` parsing, SVG safety enforcement and migration/security policy remain part of the later Secure Parser boundary (NODE-23). This keeps acquisition fidelity separate from import-time trust decisions.

## `data:` and `blob:` resources

`data:` and `blob:` URLs are acquired inside the current page execution context because that context owns their browser semantics and blob registry access.

The resulting bytes are converted to normal content-addressed assets. Their original URL type remains in Resource Provenance.

## Resource Provenance

Each acquired reference preserves evidence such as:

```text
sourceType
sourceNodeId
sourceUrl
originalUrl
frameId
frameOrigin
stylesheetRef
cssProperty
```

Supported source types include:

```text
img
picture
css-background
css-mask
css-border
css-content
svg-inline
svg-external
data-url
blob
video-poster
```

Deduplication never discards provenance. When multiple page references resolve to identical bytes, one unique asset stores all provenances and source-node/acquisition references.

## Content addressing and SHA-256

The extension runtime computes:

```text
SHA-256(resource bytes)
```

using Web Crypto.

The canonical identity is:

```text
asset:<sha256>
```

and the future package path is deterministic:

```text
assets/<sha256>.<extension>
```

Examples:

```text
assets/abc...123.png
assets/def...456.svg
```

Two different URLs with identical bytes produce one unique asset. Two URLs with different bytes never deduplicate merely because their names match.

## MIME identification

NODE-13 prefers byte evidence for common formats:

- PNG;
- JPEG;
- GIF;
- WebP;
- AVIF;
- BMP;
- ICO;
- SVG text.

A browser-provided `image/*` Content-Type may be used as a fallback hint. SVG URL suffix is an additional fallback only when byte/content evidence does not already identify the format.

Unsupported resources produce explicit diagnostics rather than being mislabeled as images.

## IR bridge

NODE-13 reuses the already frozen:

```text
WtfAssetRecord
WtfAssetProvenance
WtfAssetsPayload
```

The sidecar maps unique resolved assets into `WtfAssetRecord` without changing IR V2.

The sidecar intentionally preserves richer many-to-one provenance because the frozen IR record currently exposes a compact provenance view. NODE-21 packaging can consume the sidecar bytes and IR records together.

## Browser acquisition model

The Standard page-side acquisition reuses RawSnapshot frame/source-selector hints established by NODE-11.

It supports:

- current document;
- accessible same-origin iframe documents;
- open Shadow DOM targets;
- pseudo-node host targeting.

Element detection is tag/namespace based rather than relying on top-level-window `instanceof`, so nodes created in same-origin iframe realms remain discoverable.

## Network and origin behavior

A browser may render an image that page JavaScript is not allowed to read as bytes because of CORS/origin policy.

NODE-13 does not bypass that boundary and does not fabricate offline bytes.

When byte acquisition fails, it records:

```text
ASSET_FETCH_FAILED
```

with source-node and URL evidence when available.

This is important because:

```text
rendered successfully in browser
!=
portable bytes were acquired successfully
```

NODE-14 Pixel Ground Truth / Raster Engine can later preserve the minimum affected visual region when native asset bytes are unavailable.

High Fidelity capture does not silently disable browser security policy merely to acquire asset bytes.

## Offline sources

`file:` resources are fetched from the page context when browser file access is already authorized by the Source Provider capability boundary. Status-0 non-network responses are accepted when bytes are readable.

`LocalFolderProvider` remains the canonical path/locator model for selected local sites. NODE-13 does not weaken root/path traversal protections established by NODE-06. Any future direct local-folder byte reader must resolve through that provider rather than accepting arbitrary filesystem paths.

## Budgets

Asset acquisition is explicitly bounded.

Current Browser defaults are:

```text
max references: 2,000
max one resource: 20 MiB
max acquired bytes per snapshot: 100 MiB
```

Hard implementation caps prevent accidental unbounded expansion.

Diagnostics include:

```text
ASSET_TOO_LARGE
ASSET_TOTAL_BUDGET_EXCEEDED
ASSET_COUNT_BUDGET_EXCEEDED
```

Budget exhaustion is fail-visible.

## Browser persistence

Asset sidecars use dedicated IndexedDB storage:

```text
Database: w2f-assets
Store: captures
Key: assets:<jobId>
```

Capture receipts expose:

```text
assetStorageKey
assetAdapter
assetCount
assetReferenceCount
assetDeduplicatedReferenceCount
assetUniqueByteCount
assetDiagnosticCount
```

Cancellation/failure cleanup removes RawSnapshot/reference screenshot, CSS Cascade, Environment and Asset artifacts together.

## Privacy

NODE-13 does not read:

- cookies;
- localStorage;
- sessionStorage;
- arbitrary form textual values.

Fetching a page-owned asset may naturally use the page's existing credential context, but NODE-13 never serializes cookie values into W2F evidence.

The Browser profiles retain the existing least-privilege permissions. NODE-13 introduces no broad host permission and no static content script.

## Determinism

For stable input bytes:

```text
same bytes
→ same SHA-256
→ same asset id
→ same embedded path
```

Unique assets are deterministically ordered by asset id. Provenance, source-node IDs and acquisition IDs are also de-duplicated/sorted where the contract requires stable ordering.

## Diagnostics

NODE-13 records explicit failure evidence including:

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
```

A diagnostic is not silently converted into an invented asset.

## Explicit non-goals

NODE-13 does not implement:

- full page raster ground truth;
- canvas raster capture;
- arbitrary video-frame extraction;
- compositing fallback boundary selection;
- final `.wtf` ZIP/container writing;
- untrusted `.wtf` secure parsing;
- Figma image/vector node creation;
- responsive inference.

Those remain assigned to NODE-14, NODE-20/21 and NODE-23+ according to the frozen roadmap.
