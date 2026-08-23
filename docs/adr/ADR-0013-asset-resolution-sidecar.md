# ADR-0013 — Content-Addressed Asset Resolution Sidecar

## Status

Accepted for NODE-13 implementation; formal Exit Gate pending.

## Context

The frozen V2 architecture requires the browser capture pipeline to preserve image/SVG resources as portable assets, retain source provenance and de-duplicate repeated bytes. The existing W2F IR V2 already defines `WtfAssetRecord`, while RawSnapshot is a validated acquisition boundary that should not be expanded for large binary payloads.

Several constraints shape the implementation:

1. `<picture>` / `srcset` selection is browser behavior; W2F should use `currentSrc` rather than reimplement selection.
2. Different URLs can return identical bytes and should de-duplicate deterministically.
3. One asset can be referenced by many source nodes/properties; de-duplication must not erase provenance.
4. `data:` and `blob:` resources are page-context resources.
5. A browser can render a cross-origin resource while script-level byte access is denied.
6. Inline SVG should remain vector source evidence rather than being rasterized prematurely.
7. Large binary bytes should not be pushed into RawSnapshot or `chrome.storage.local`.
8. Later NODE-21 packaging needs stable asset ids/paths and original bytes.

## Decision

Introduce:

```text
AssetCapture 1.0.0
```

as a separate sidecar associated with one RawSnapshot.

### Content identity

Use SHA-256 over the resolved resource bytes as the canonical content identity:

```text
asset:<sha256>
```

and reserve the deterministic package path:

```text
assets/<sha256>.<extension>
```

No URL, filename, DOM identity or network cache key is sufficient as the canonical asset identity.

### Browser-selected sources

For `<img>` / `<picture>`, acquire the bytes referenced by `currentSrc` and retain authored `src` separately.

W2F does not implement its own `srcset` candidate algorithm.

### CSS images

Acquire rendered `url(...)` resources from computed image-bearing CSS properties while NODE-11 remains the source of authored cascade semantics.

### SVG

Serialize inline SVG as source bytes and fetch external SVG as bytes. NODE-13 does not treat those bytes as trusted. Import-time sanitization/security remains in the Secure Parser boundary.

### Provenance

Store every observed provenance entry on the sidecar even when multiple references collapse to one SHA-256 asset.

The compact frozen IR provenance field is a projection, not the full evidence set.

### Origin/security failures

Do not bypass CORS/origin restrictions and do not fabricate bytes for a resource merely because the browser rendered it.

Byte-acquisition failure becomes explicit diagnostic evidence. Later raster ground-truth/fallback nodes can preserve visual fidelity for unsupported regions.

### Persistence

Persist the AssetCapture sidecar in dedicated IndexedDB storage. It participates in the same transactional cleanup semantics as RawSnapshot, CSS Cascade and Environment evidence.

## Alternatives considered

### Store asset bytes directly in RawSnapshot

Rejected. It would version-bump and bloat a validated structural capture boundary and mix DOM/layout evidence with potentially large binary resources.

### Use URL as the asset id

Rejected. URLs can be aliases, cache-busted, signed, duplicated or mutable. They do not establish content identity.

### De-duplicate by filename

Rejected. Different files can share a filename and identical bytes can use different filenames.

### Reimplement `srcset` selection

Rejected. The browser already selected the rendered candidate and exposes `currentSrc`.

### Fetch every asset from the extension service worker

Rejected as the sole strategy. `blob:` ownership and page execution context make page-side acquisition necessary, and extension host permissions should not be broadened merely for asset capture.

### Convert all SVG to raster immediately

Rejected. It destroys editability and violates Native First / Minimal Fallback principles.

### Ignore inaccessible cross-origin assets

Rejected. Silent loss would make the `.wtf` appear complete when it is not. Missing byte evidence must be diagnosable and available to later fallback planning.

## Consequences

### Positive

- deterministic content-addressed assets;
- stable future `.wtf` embedded paths;
- repeated images de-duplicate without losing source provenance;
- browser-selected responsive image fidelity;
- inline/external SVG remains eligible for native vector rendering;
- missing asset bytes are explicit rather than silently lost;
- RawSnapshot and W2F IR V2 remain compatible;
- NODE-21 can package bytes without re-fetching the source site.

### Costs

- one additional sidecar/store lifecycle;
- page-side byte acquisition can be blocked by CORS even for visible resources;
- binary evidence can be large, requiring explicit budgets;
- later packaging/import must reconcile sidecar bytes with IR records;
- a future direct LocalFolder byte reader must integrate with NODE-06 source-provider selection rather than arbitrary filesystem access.

## Follow-up

NODE-14 may produce pixel/raster evidence when native asset bytes are missing or insufficient. NODE-21 will consume resolved asset bytes during `.wtf` packaging. NODE-23 will enforce untrusted package/SVG security policy before import, and NODE-26 will create Figma image/vector assets where supported.
