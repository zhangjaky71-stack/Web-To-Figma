# ADR-0021 — Deterministic WTF Writer

**Status:** Accepted  
**Date:** 2026-08-23

## Context

NODE-21 must turn the frozen V2 logical package contract into physical `.wtf` bytes. A general ZIP library with default compression can produce different archive bytes across library versions, compressor settings or runtimes even when every logical W2F payload is identical. That weakens reproducibility, archive-level hashing and later revision/debug workflows.

Large W2F captures can also contain substantial binary assets and raster evidence, so Browser export must not route package bytes through base64/data URLs or extension runtime messages.

## Decision

Use a small deterministic ZIP32 Store writer owned by `@w2f/wtf-packager`.

The writer:

- canonicalizes JSON with the shared schema serializer;
- inventories every non-reserved payload with SHA-256;
- validates manifest/checksums/container shape before archive encoding;
- sorts ZIP entries lexicographically;
- uses UTF-8 names, Store method and a fixed DOS timestamp;
- writes CRC32, local headers, central headers and EOCD deterministically;
- applies writer ceilings stricter than or equal to the frozen protocol ceilings.

The Browser service worker builds the archive and persists bytes in IndexedDB. The popup reads the package locally, creates a Blob URL and invokes `chrome.downloads.download`.

## Consequences

Positive:

- identical input produces identical `.wtf` bytes;
- archive SHA-256 becomes stable evidence;
- no compression-library dependency is required in the Browser writer;
- no package-size amplification through base64/runtime messaging;
- writer and future reader remain independently evolvable.

Tradeoffs:

- Store mode produces larger archives than Deflate;
- ZIP32 limits physical writer output to classic ZIP count/offset ceilings;
- very large captures may need a future streaming/ZIP64 writer revision.

These tradeoffs are acceptable for V2 because the frozen reader hard ceiling is 1 GiB and deterministic correctness is more important than transport compression at this stage.

## Boundary

This ADR does not authorize NODE-21 to parse untrusted ZIPs. NODE-23 owns secure archive parsing, decompression-ratio checks, migration and sanitization.
