# ADR-0004 — Stable Identity and Source Mapping

**Status:** Accepted  
**Date:** 2026-08-22  
**NODE:** 04

## Context

W2F needs stable cross-capture correspondence for responsive evidence, deterministic QA and future incremental update. Browser runtime identifiers alone are insufficient because React/framework hydration IDs, CSS-module hashes, generated timestamps and similar values can change between otherwise equivalent captures.

NODE-03 already reserves `captureNodeId`, `stableIdentity`, revision metadata and Source Graph relationships. NODE-04 must define how those stable identities are generated and compared.

## Decision

W2F uses a deterministic evidence-scored stable identity algorithm implemented once in:

```text
packages/stable-identity
```

Browser capture consumes that package; app-specific identity implementations are prohibited.

### Document identity

`documentId` is derived from a normalized logical source locator. Tracking-only URL drift does not create a new document identity.

`sourceFingerprint` may additionally include structural evidence so material source changes can be detected without changing the document locator identity.

### Node identity

Stable node signatures prioritize semantic evidence:

```text
stable id/data attributes
semantic ancestry
tag/role
meaningful classes
normalized content
asset fingerprints
structural position fallback
```

Known volatile framework/runtime signals are filtered before hashing.

### Confidence

Every stable identity carries `confidence` and `evidence[]`.

Structural fallback and collision disambiguation reduce confidence. Consumers must treat confidence as evidence quality, not a guarantee.

### Collision and ambiguity

Input array order is never an identity signal.

Same-capture signature collisions are deterministically disambiguated with structural position. Cross-capture duplicate stable IDs are reported as `ambiguous` rather than silently paired.

### Hashing

Canonical JSON + SHA-256 is used for document, capture, revision and stable-node signatures. Stable IDs use deterministic shortened canonical hashes with explicit namespaces such as `doc_`, `cap_`, `rev_`, and `sid_`.

## Consequences

Positive:

- repeat captures can preserve source identity;
- responsive snapshots can be correlated later;
- future incremental merge has a stable hook;
- mapping uncertainty is inspectable;
- identity behavior remains deterministic and testable.

Trade-offs:

- anonymous repeated structures may still require lower-confidence structural fallback;
- structural changes can legitimately change stable IDs;
- ambiguous duplicated evidence is reported instead of guessed;
- NODE-04 does not attempt expensive visual/ML matching.

## Rejected alternatives

### Random IDs as stable IDs

Rejected because they cannot correlate repeated captures.

### DOM path/index as the only identity

Rejected because small sibling insertions cause widespread identity churn.

### Raw HTML `id` as the only identity

Rejected because modern frameworks frequently generate volatile IDs.

### Pair duplicate candidates by array order

Rejected because it is nondeterministic with respect to source acquisition order and hides ambiguity.

### Visual similarity matching in NODE-04

Deferred because NODE-04 is the deterministic source-identity layer. Visual evidence belongs to later capture/QA layers and may be used as an explicit future secondary mapper without replacing this contract.
