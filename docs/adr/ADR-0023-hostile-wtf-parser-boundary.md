# ADR-0023 — Hostile `.wtf` Parser Trust Boundary

**Status:** Accepted  
**Node:** NODE-23

## Context

The Figma plugin accepts local `.wtf` archives from Choose File, UI Drop and active-plugin Canvas Drop. A portable package can be malformed, tampered, oversized, path-traversing or contain executable SVG/content even when its filename and MIME look valid.

Later Figma capability planning and rendering must never consume unvalidated archive internals.

## Decision

Establish one reusable security boundary in `@w2f/wtf-parser`.

The parser runs in the Figma UI iframe and is the sole component allowed to open archive contents. It validates ZIP structure and budgets before decoding, then validates shared manifest/checksum/container contracts, exact-byte SHA-256, JSON/IR, asset policy, SVG and compatible V2 migration before producing a validated package/preview.

The Figma main sandbox continues to own Figma host APIs and Canvas drop bytes but does not unzip or interpret `.wtf` payloads.

NODE-24+ may consume only the validated parser result, never raw archive entries.

## Security consequences

- fail closed on unsupported ZIP variants and format/schema major versions;
- no nested archive auto-expansion;
- no HTML/JS/extension execution;
- no `eval` / dynamic code construction;
- no network access;
- unsafe SVG is rejected rather than partially trusted;
- CRC32 and SHA-256 have separate roles: transport corruption vs payload integrity.

## Compatibility consequences

The parser safely supports the deterministic Store ZIP emitted by NODE-21 and a bounded raw-Deflate path. ZIP64 is rejected because V2 hard limits do not require it.

Migration is explicit and limited to compatible V2 reader-model normalization; incompatible majors are never guessed into compatibility.

## Rejected alternatives

### Parse in the Figma main sandbox

Rejected because browser binary/decompression APIs belong naturally to the UI iframe and host-only Figma APIs should remain isolated from hostile parsing.

### Let each intake path parse independently

Rejected because three parsers create drift and inconsistent security gates.

### Rely on ZIP CRC only

Rejected because CRC32 is not a cryptographic integrity mechanism. Exact SHA-256 must match both manifest and checksums inventory.

### Sanitize SVG after renderer handoff

Rejected because untrusted XML must not cross the parser trust boundary.
