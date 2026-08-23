# ADR-0013 — Content-Addressed Asset Resolution Sidecar

## Status

Accepted for NODE-13 implementation; formal Exit Gate pending.

## Context

The frozen V2 architecture requires the browser capture pipeline to preserve image/SVG resources as portable assets, retain source provenance and de-duplicate repeated bytes. The existing W2F IR V2 already defines `WtfAssetRecord`, while RawSnapshot is a validated structural acquisition boundary that should not be expanded with large binary payloads.

Several constraints shape the implementation:

1. `<picture>` / `srcset` selection is browser behavior; W2F should use `currentSrc` rather than reimplement selection.
2. Different URLs can return identical bytes and should de-duplicate deterministically.
3. One asset can be referenced by many source nodes/properties; de-duplication must not erase provenance.
4. `data:` and `blob:` resources are page-context resources.
5. A browser can render a cross-origin resource while page JavaScript is denied byte access by CORS.
6. The frozen V2 Asset Model explicitly orders missing-resource handling as `native fetch → alternate provider → screenshot fallback → placeholder + diagnostic`.
7. Inline SVG should remain vector source evidence rather than being rasterized prematurely.
8. Large binary bytes should not be pushed into RawSnapshot or `chrome.storage.local`.
9. Later NODE-21 packaging needs stable asset ids/paths and original bytes.

## Decision

Introduce:

```text
AssetCapture 1.0.0
```

as a separate sidecar associated with one RawSnapshot.

### Content identity

Use SHA-256 over resolved resource bytes as canonical content identity:

```text
asset:<sha256>
```

and reserve deterministic package paths:

```text
assets/<sha256>.<extension>
```

URL, filename, DOM identity and browser cache key remain provenance rather than canonical asset identity.

### Browser-selected sources

For `<img>` / `<picture>`, acquire the browser-selected `currentSrc` and retain authored `src` separately. W2F does not implement its own `srcset` candidate algorithm.

### CSS images

Acquire observed `url(...)` resources from computed image-bearing CSS properties while NODE-11 remains the source of authored cascade semantics. Portable discovery may additionally use NODE-11 trace provenance for authored URL/stylesheet context.

### SVG

Serialize inline SVG as source bytes and acquire external SVG as bytes. NODE-13 does not trust or execute those bytes. Import-time sanitization/security remains NODE-23 Secure Parser responsibility.

### Provenance

Store every observed provenance/source reference on the sidecar even when multiple references collapse to one SHA-256 asset. The compact frozen IR provenance field is a projection, not the complete evidence set.

### Acquisition providers

NODE-13 uses two acquisition providers in order:

```text
1. page-context native fetch
2. High Fidelity CDP loaded-resource recovery
```

Page-context native fetch preserves page-owned `data:` / `blob:` behavior and ordinary same-origin/CORS access without broad extension host permissions.

When a High Fidelity RawSnapshot has an `ASSET_FETCH_FAILED` URL, the existing explicit Chrome `debugger` permission may be used to recover resources Chromium has already loaded:

```text
Page.getResourceTree
→ match URL + owning frame
→ Page.getResourceContent
```

This alternate provider is limited to the captured page's resource tree. It is not an arbitrary cross-origin network crawler and does not add host permissions.

A recovered asset removes the original native-fetch failure for that acquisition identity. If recovery fails, the original diagnostic remains.

### Missing-resource boundary

NODE-13 never fabricates bytes and does not fail the whole capture for one missing resource.

If native + alternate providers fail, later frozen stages remain responsible for:

```text
NODE-14 screenshot/pixel fallback
→ later placeholder + diagnostic if still unsupported
```

### Persistence

Persist AssetCapture in dedicated IndexedDB storage. It participates in the same cancellation/failure cleanup semantics as RawSnapshot, CSS Cascade and Environment evidence.

## Alternatives considered

### Store asset bytes directly in RawSnapshot

Rejected. It would version-bump/bloat a validated structural boundary and mix DOM/layout evidence with potentially large binary resources.

### Use URL as the asset id

Rejected. URLs can be aliases, signed, cache-busted, mutable or duplicated. They do not establish content identity.

### De-duplicate by filename

Rejected. Different files can share a filename and identical bytes can use different filenames.

### Reimplement `srcset` selection

Rejected. The browser already selected the rendered candidate and exposes `currentSrc`.

### Fetch every asset from the extension service worker with broad host permissions

Rejected. It weakens least privilege, does not represent page-owned blob semantics cleanly, and changes origin/session behavior.

### Ignore CORS-failed assets until raster fallback

Rejected for High Fidelity. The V2 Asset Model requires an alternate provider before screenshot fallback, and Chromium often already holds the exact loaded bytes.

### Re-fetch inaccessible resources from an external server

Rejected. It violates Local First, changes authentication/origin semantics and creates new privacy/SSRF boundaries.

### Convert all SVG to raster immediately

Rejected. It destroys editability and violates Native First / Minimal Fallback principles.

### Sanitize SVG during acquisition

Rejected as a boundary choice. Capture preserves source evidence; NODE-23 is the untrusted-file security boundary before rendering. NODE-13 never executes captured SVG.

## Consequences

### Positive

- deterministic content-addressed assets;
- stable future `.wtf` embedded paths;
- repeated images de-duplicate without losing source provenance;
- browser-selected responsive image fidelity;
- inline/external SVG remains eligible for native vector rendering;
- many visible cross-origin resources become portable in High Fidelity without broad host permissions;
- missing asset bytes remain explicit and flow into NODE-14 fallback;
- RawSnapshot and W2F IR V2 remain compatible;
- NODE-21 can package acquired bytes without re-fetching the source site.

### Costs

- one additional sidecar/store lifecycle;
- binary evidence can be large and requires explicit budgets;
- High Fidelity may perform a second short debugger attach for resource recovery;
- resources absent from the CDP resource tree can still remain missing;
- Standard mode cannot guarantee byte portability for every cross-origin rendered asset;
- later packaging/import must reconcile sidecar bytes with IR records;
- future direct LocalFolder byte access must remain behind the NODE-06 Source Provider boundary.

## Follow-up

NODE-14 consumes missing-asset diagnostics when producing pixel/raster evidence. NODE-21 consumes resolved bytes during `.wtf` packaging. NODE-23 enforces untrusted archive/SVG security, and NODE-26 creates Figma image/vector assets where supported.
