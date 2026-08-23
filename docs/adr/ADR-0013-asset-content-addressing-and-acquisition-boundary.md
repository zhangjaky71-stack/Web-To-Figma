# ADR-0013 — Asset Content Addressing and Acquisition Boundary

## Status

Accepted for NODE-13 implementation; formal Exit Gate pending.

## Context

The frozen V2 Asset Resolver must preserve browser-selected visual resources as portable offline evidence while remaining Local First and least-privilege. Relevant constraints are:

1. responsive images must follow the browser-selected `currentSrc`, not a home-grown `srcset` evaluator;
2. CSS image resources can originate from computed style and authored stylesheet-relative URLs;
3. identical bytes can be referenced from many nodes/URLs and should not be stored repeatedly;
4. page JavaScript may be unable to read cross-origin image bytes even though Chromium has already rendered them;
5. Standard capture must not acquire broad host permissions merely to bypass CORS;
6. resource failure must remain diagnosable and must not invalidate the whole capture;
7. screenshot/raster fallback belongs to NODE-14 and later fallback planning, not to the asset resolver.

## Decision

Introduce a versioned:

```text
AssetCapture 1.0.0
```

sidecar that stores unique resolved assets, bytes, provenance, source-node/acquisition references and diagnostics.

### Browser authority

For responsive image elements, use the live browser `currentSrc` for byte acquisition and preserve authored `src` separately. Do not reimplement responsive source selection.

### Content addressing

Use SHA-256 of acquired bytes as canonical identity:

```text
asset:<sha256>
```

Future embedded paths are deterministic:

```text
assets/<sha256>.<extension>
```

Deduplicate by content hash, never by URL/name alone. Merge all provenance and source references into the unique asset.

### Acquisition providers

Use a two-stage NODE-13 acquisition policy:

```text
Standard/page native fetch
→ High Fidelity CDP resource-tree fallback when available
```

Standard page fetch runs in the page's own origin/session context and does not add broad host permissions.

For High Fidelity captures, when native fetch reports `ASSET_FETCH_FAILED`, the extension may use the existing explicit `debugger` permission to inspect resources already loaded by Chromium:

```text
Page.getResourceTree
Page.getResourceContent
```

This is an alternate provider for loaded resources, not an arbitrary cross-origin crawler.

### Missing resource behavior

If both NODE-13 providers fail, keep the missing-asset diagnostic. Do not fabricate bytes and do not fail the overall capture.

The next frozen stages remain:

```text
NODE-14 screenshot fallback
→ later placeholder/diagnostic rendering if still missing
```

### SVG trust boundary

NODE-13 captures SVG bytes as untrusted passive evidence. It does not execute them. Secure Parser NODE-23 sanitizes untrusted SVG before Figma rendering.

### Persistence

Persist the sidecar independently in IndexedDB and include summary evidence in the capture job receipt. Asset artifacts participate in the same cancellation/failure cleanup transaction as RawSnapshot, CSS Cascade and Environment artifacts.

## Alternatives considered

### Deduplicate by URL

Rejected. Different URLs can have identical bytes and one URL can change content. URL identity is provenance, not content identity.

### Use authored `src` instead of `currentSrc`

Rejected. It would capture the wrong responsive image on pages using `srcset`/`picture`.

### Give the Standard extension `<all_urls>` or broad host permissions

Rejected. It would weaken the least-privilege architecture and still would not represent all blob/local browser semantics cleanly.

### Ignore CORS-failed assets until raster fallback

Rejected for High Fidelity. Chromium already has the resource bytes in many such cases, and the frozen Asset Model explicitly defines an `alternate provider` before screenshot fallback.

### Re-fetch cross-origin resources from an external server

Rejected. It violates Local First, changes authentication/origin semantics and creates unnecessary privacy/SSRF boundaries.

### Sanitize SVG during capture

Rejected as the trust-policy boundary. Capture should preserve source evidence; untrusted-file parsing/sanitization is a separate NODE-23 responsibility. The captured bytes remain passive and are not executed by NODE-13.

## Consequences

### Positive

- deterministic assets across repeated captures when bytes are stable;
- responsive images match what the browser actually rendered;
- duplicate references collapse without losing provenance;
- High Fidelity can recover many no-CORS resources without broad host permissions;
- missing resources stay explicit and can flow into NODE-14 fallback;
- RawSnapshot and W2F IR V2 remain version-stable.

### Costs

- an additional IndexedDB sidecar lifecycle;
- High Fidelity resource recovery requires a second short debugger attachment after DOM capture;
- resources absent from the CDP Resource Tree can still remain missing;
- Standard mode cannot guarantee byte portability for every cross-origin rendered image;
- later packager/parser stages must consume asset bytes and security policy separately.

## Follow-up

NODE-14 consumes missing-asset diagnostics when selecting pixel fallback. NODE-21 writes content-addressed bytes into `.wtf`. NODE-23 treats all archive assets as untrusted and sanitizes SVG. NODE-26 creates Figma images/vectors from validated assets.
