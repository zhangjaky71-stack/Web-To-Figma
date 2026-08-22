# ADR-0002 — W2F V2 Compatibility, Integrity, and Security Contract

**Status:** Accepted  
**Date:** 2026-08-22  
**Owners:** NODE-02 — W2F File Spec V2

## Context

The `.wtf` package is the long-lived boundary between browser capture and Figma reconstruction. If producer and reader implementations independently interpret versions, optional data, archive inventory, hashes or security limits, later NODEs can create incompatible files while still compiling locally.

V2.1 also requires several future-facing fields to exist before the capture and renderer implementations are built: token relationships, structural fingerprints, revision metadata, scroll-root information, composed-tree mapping and high-precision geometry.

## Decision

1. `.wtf` uses a single shared TypeScript/runtime contract package: `@w2f/w2f-schema`.
2. Format and schema begin at `2.0.0`.
3. `manifest.json` is authoritative for compatibility, identity, capture target, entrypoints, feature negotiation, payload inventory and declared security limits.
4. `checksums.json` is authoritative for payload SHA-256 integrity and must match the manifest inventory exactly.
5. `manifest.json` and `checksums.json` are reserved container entries; payload files must be explicitly inventoried.
6. Format/schema major mismatches are fail-closed.
7. `minReaderVersion`, required capabilities and required features are fail-closed.
8. Unknown optional features may be ignored when core reconstruction remains valid.
9. Archive paths are normalized relative portable paths only.
10. Reader hard security ceilings are protocol constants; a writer may declare stricter values but cannot relax them.
11. Geometry evidence is stored as finite IEEE-754 doubles and is not rounded during capture serialization.
12. Canonical JSON sorts object keys while preserving array order and numeric precision.
13. Checksums provide integrity only. Optional future signatures, if used, provide authenticity and remain a separate mechanism.
14. `.wtf` is data, never executable content.
15. V2.1 protocol reservations are introduced now even when the generating algorithms are implemented by later NODEs.

## Consequences

### Positive

- Browser and Figma cannot drift into separate schemas without breaking workspace compile/tests.
- Future readers can make explicit compatibility decisions instead of guessing.
- Hidden archive payloads, traversal paths, oversized entries and decompression-ratio attacks have defined rejection rules before the parser is implemented.
- Later deterministic and incremental-update work has stable serialization, revision and identity hooks.
- Token and composed-tree semantics do not need a breaking format revision when those engines arrive.

### Trade-offs

- V2 manifests are more verbose than a minimal export package.
- Some fields are reserved before their full producer/consumer behavior exists.
- Hard security ceilings may require revision in a future format major if real-world evidence proves them fundamentally insufficient.

## Rejected alternatives

### Separate Browser/Figma schema copies

Rejected because drift would be likely and the NODE-02 DoD explicitly requires one shared package.

### Accept unknown required features and attempt best-effort import

Rejected because silent semantic loss is worse than an explicit compatibility failure.

### Use checksums as a signature mechanism

Rejected because integrity does not establish producer authenticity.

### Round geometry during capture

Rejected because repeated fractional geometry introduces cumulative reconstruction error and destroys source evidence.

### Permit arbitrary archive paths and sanitize only during extraction

Rejected because path validity is part of the portable contract and should be rejected before extraction.

## Implementation references

- `docs/WTF_FILE_SPEC_V2.md`
- `packages/w2f-schema/src/index.ts`
- `packages/w2f-schema/test/index.test.ts`
- `apps/browser-extension`
- `apps/figma-plugin`
