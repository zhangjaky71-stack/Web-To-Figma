# Asset Resolver V2

## Purpose

NODE-13 resolves browser-rendered image resources into deterministic, portable asset evidence for later `.wtf` packaging and Figma rendering. It implements the frozen V2 Asset Resolver scope without changing `RawSnapshot 1.0.0` or the W2F IR V2 asset contract.

Frozen NODE-13 scope:

```text
images
currentSrc
CSS image
SVG
data
blob
hash
dedup
```

The frozen V2 missing-asset sequence is:

```text
native fetch
→ alternate provider
→ screenshot fallback
→ placeholder + diagnostic
```

NODE-13 implements native fetch plus the High Fidelity alternate provider. Screenshot/pixel fallback remains NODE-14 and later fallback work.

## Sidecar boundary

NODE-13 stores resolved resources separately as:

```text
AssetCapture 1.0.0
```

One sidecar is associated with one RawSnapshot through:

```text
snapshot:<RawSnapshot.capturedAt>
```

It contains:

- unique resolved asset records;
- original resource bytes;
- observed Resource Provenance entries;
- source-node references;
- acquisition identities;
- explicit acquisition/resolution diagnostics.

RawSnapshot remains unchanged.

## Supported resource classes

NODE-13 resolves browser-rendered image-like resources from:

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

Canvas pixels, arbitrary video frames, raster fallback and pixel-reference evidence belong to NODE-14.

## Responsive image semantics

For `<img>` / `<picture>`, the browser is authoritative for the rendered resource.

NODE-13 records:

```text
currentSrc      browser-selected resource
authoredSrc     authored `src` when present
intrinsicWidth  naturalWidth when observable
intrinsicHeight naturalHeight when observable
width/height    observed rendered bounds when available
```

`currentSrc` is preferred for byte acquisition. Authored `src` is provenance. NODE-13 does not reimplement `srcset` selection.

## CSS image resources

The Standard page adapter reads observed image-bearing CSS, including:

- `background-image`;
- `mask-image`;
- `-webkit-mask-image`;
- `border-image-source`;
- generated `content` URL images.

The platform-neutral discovery layer can also consume NODE-11 cascade traces to preserve authored URL and stylesheet provenance. Relative authored references use the shared Source Provider URL resolver.

Gradients/cross-fade remain CSS paint semantics rather than binary image assets. They must be recognized downstream instead of disappearing.

## SVG

### Inline SVG

Inline `<svg>` is serialized with `XMLSerializer` and stored as UTF-8 SVG bytes. The resolved W2F asset remains:

```text
kind = svg
mediaType = image/svg+xml
```

### External SVG

External SVG URLs are acquired as bytes and identified through byte/content evidence plus MIME/URL hints.

### Security boundary

NODE-13 captures SVG as untrusted passive evidence and does not execute it. NODE-23 Secure Parser sanitizes untrusted SVG before Figma rendering. Acquisition fidelity and import trust policy remain separate boundaries.

## Data and blob resources

`data:` and `blob:` resources are first acquired in page context because that context owns their browser semantics and blob registry access.

`data:` decoding supports Base64 and percent-encoded payloads. Resulting bytes become normal content-addressed assets while provenance preserves the original resource class.

If blob access has expired or is otherwise unavailable, NODE-13 records the failure and never invents replacement bytes.

## URL resolution

Portable discovery reuses `@w2f/source-providers` URL resolution. This preserves HTTP/HTTPS/file/data/blob semantics, rejects unsupported schemes and strips URL credentials through the existing provider boundary.

Stylesheet-relative authored URLs resolve against observed stylesheet provenance when available.

## Native page acquisition

The Standard adapter reuses the RawSnapshot frame/source-selector model and can resolve resources in:

- current document;
- accessible same-origin iframe documents;
- open Shadow DOM targets;
- pseudo-node host contexts where image-bearing computed style is relevant.

Page-context fetch uses the page's existing browser session but does not serialize cookies, authorization headers or other credentials into W2F evidence.

A browser may render a resource that page JavaScript cannot read because of CORS. Standard mode preserves that as `ASSET_FETCH_FAILED`; it does not add broad host permissions to bypass browser security.

## High Fidelity alternate provider

For a High Fidelity capture, NODE-13 implements the V2 `alternate provider` stage for native-fetch failures.

If Chromium already loaded the resource, the Browser Extension can use its existing explicit `debugger` permission:

```text
Page.getResourceTree
→ match requested URL to loaded frame/resource
→ Page.getResourceContent
→ recover original resource bytes
```

Rules:

- only URLs already represented in the captured page Resource Tree are considered;
- the extension does not become an arbitrary cross-origin crawler;
- no new broad host permission is introduced;
- debugger attachment is always detached in `finally`;
- one resource failure does not fail the capture;
- a successfully recovered reference removes its original native-fetch failure diagnostic;
- unrecovered references keep `ASSET_FETCH_FAILED` for NODE-14/later fallback.

The alternate provider restores portability for many images that were rendered successfully but were unreadable from page JavaScript due to CORS.

## Resource Provenance

Each acquired reference can preserve:

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

Source types include:

```text
img
picture
css-background
css-mask
css-border
css-content
css-image
svg-inline
svg-external
data-url
blob
video-poster
```

Deduplication never discards provenance.

## Content addressing and SHA-256

The extension computes:

```text
SHA-256(resource bytes)
```

using Web Crypto. Canonical identity:

```text
asset:<sha256>
```

Future package path:

```text
assets/<sha256>.<extension>
```

Actual archive writing belongs to NODE-21.

## Content deduplication

Deduplication is byte/content based, not URL based.

If multiple references resolve to the same SHA-256 bytes:

- one unique `WtfAssetRecord` is produced;
- all provenances are retained;
- source-node IDs remain associated;
- acquisition IDs remain inspectable;
- summary metadata reports deduplicated reference count.

The same locator is fetched only once per acquisition pass when possible, while each logical page reference remains represented.

## MIME identification

NODE-13 prefers byte evidence and supports recognition of common browser image formats including:

- PNG;
- JPEG;
- GIF;
- WebP;
- AVIF;
- BMP;
- ICO;
- SVG text.

Browser Content-Type or URL suffix is only fallback evidence when byte/content evidence is insufficient. Unsupported resources remain explicit diagnostics rather than being mislabeled.

## W2F IR bridge

NODE-13 reuses frozen:

```text
WtfAssetRecord
WtfAssetProvenance
WtfAssetsPayload
```

The resolved record can carry:

```text
id
kind
mediaType
sha256
embeddedPath
byteLength
width / height
intrinsicWidth / intrinsicHeight
currentSrc
authoredSrc
provenance
```

The richer AssetCapture sidecar keeps many-to-one provenance/source evidence for later packager and diagnostics work.

## Acquisition budgets

Browser acquisition is bounded. Current Browser defaults are:

```text
max references: 2,000
max one resource: 20 MiB
max acquired bytes per snapshot: 100 MiB
```

The platform-neutral API also defines explicit maximum asset/count/total byte policies. Budget exhaustion is fail-visible through diagnostics.

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

## Privacy and permissions

NODE-13 remains Local First and does not persist:

- cookies;
- authorization/request headers;
- localStorage;
- sessionStorage;
- passwords/auth tokens.

Standard permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity continues to add only:

```text
debugger
```

NODE-13 introduces no broad host permission and no static content script.

## Determinism

For stable bytes:

```text
same bytes
→ same SHA-256
→ same asset id
→ same embedded path
```

Unique asset ordering and merged source/provenance evidence are normalized deterministically.

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
ASSET_REFERENCE_INVALID
ASSET_REFERENCE_UNSUPPORTED
ASSET_CSS_URL_INVALID
ASSET_INLINE_SVG_INVALID
```

A diagnostic is never silently converted into invented asset bytes.

## Explicit non-goals

NODE-13 does not implement:

- viewport/full-page pixel references;
- canvas/WebGL raster capture;
- arbitrary video-frame capture;
- screenshot fallback capture;
- fallback-boundary inference;
- `.wtf` ZIP writing/download;
- untrusted `.wtf` secure parsing;
- Figma image/vector creation;
- font capture/rendering;
- responsive inference.

Those remain assigned to later frozen nodes.
