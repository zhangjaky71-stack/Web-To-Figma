# NODE-04 — Stable Identity & Source Mapping

## Status

**IN PROGRESS — implementation and bootstrap validation complete; final frozen-lockfile CI pending**

## Goal

Implement the deterministic stable identity and cross-capture source mapping layer reserved by V2/V2.1 and NODE-03.

NODE-04 must make repeated captures correlatable without treating volatile browser/framework runtime IDs as stable truth.

## Implemented package

```text
packages/stable-identity
```

Shared algorithm version:

```text
1.0.0
```

The package depends on the shared NODE-02/NODE-03 contracts:

```text
@w2f/w2f-schema
@w2f/w2f-ir
```

## Implemented identity layers

### Document identity

Implemented normalized logical source locators for:

```text
http
file
local-folder
unknown/opaque source key
```

HTTP normalization removes credentials, fragments and tracking parameters while sorting retained query parameters.

`documentId` is derived from the normalized locator.

`sourceFingerprint` additionally accepts root structural evidence.

### Capture identity

`captureId` is derived from:

- document ID;
- canonical timestamp;
- capture nonce.

Repeated captures therefore preserve document identity while receiving distinct capture identities.

### Revision identity

Implemented deterministic `revisionId` generation with optional `parentRevisionId`, producing a NODE-02-compatible manifest identity object.

## Stable node signal normalization

Implemented normalized evidence for:

- source/document scope;
- namespace/tag;
- semantic role;
- stable HTML `id` when accepted;
- selected stable `data-*` attributes;
- meaningful class signature;
- bounded semantic ancestry;
- normalized text/content;
- asset fingerprints;
- structural sibling/document position.

## Volatile signal rejection

Implemented rejection/filtering for:

- React/Radix/Headless UI/hydration-style generated IDs;
- UUID-like values;
- long numeric/timestamp-like values;
- hash-like values;
- framework-generated unstable `data-*` values;
- CSS Module hash-like classes;
- generic layout utility classes;
- Tailwind-like utility tokens.

## Confidence and evidence

Every assignment writes:

```text
stableIdentity.id
stableIdentity.confidence
stableIdentity.evidence[]
signatureHash
normalized signals
```

High-value semantic attributes increase confidence.

Structural-only fallback is capped at lower confidence. Same-capture collision disambiguation also lowers confidence and records explicit evidence.

## Collision handling

`assignStableIdentities` detects duplicate base stable IDs within one capture.

Colliding nodes are deterministically separated with semantic ancestry plus structural position.

If candidates still cannot be deterministically separated, the engine throws rather than using input-array order.

## Cross-capture mapping

Implemented:

```text
mapStableNodesAcrossCaptures
```

Statuses:

```text
matched
added
removed
ambiguous
```

Duplicate stable IDs on either side are reported as `ambiguous`; they are never silently zipped by order.

Mapping output includes previous/current capture node IDs and conservative confidence.

## Source Graph integration

Implemented:

```text
applyStableIdentityAssignments
toStableMappedNodes
```

Assignments are applied immutably to NODE-03 `WtfSourceNode.stableIdentity`.

The result explicitly reports:

```text
unmappedCaptureNodeIds
unusedAssignments
```

## Browser integration

Browser Extension now depends on:

```text
@w2f/stable-identity: workspace:*
```

and exposes `STABLE_IDENTITY_ALGORITHM_VERSION` through its foundation integration test.

Later capture nodes must reuse this package rather than duplicate stable identity logic.

## Tests

Implemented:

```text
packages/stable-identity/test/identity.test.ts
packages/stable-identity/test/mapping.test.ts
```

Coverage includes:

- tracking-only URL drift;
- normalized document identity;
- document vs capture identity separation;
- revision identity generation;
- same logical node across different capture IDs;
- volatile numeric text changes;
- hydration ID filtering;
- utility/CSS-module class filtering;
- structural fallback confidence;
- deterministic sibling collision disambiguation;
- matched/added/removed mapping;
- ambiguous duplicate mapping;
- immutable Source Graph assignment;
- unmapped/unused assignment reporting.

## Bootstrap validation

The first real NODE-04 cloud run passed lint and exposed one strict TypeScript `exactOptionalPropertyTypes` incompatibility in normalized optional signal fields.

The internal normalized signal type was made explicit without disabling strict TypeScript settings. Fixtures were also kept exact-optional-safe.

The subsequent bootstrap run passed:

- workspace lockfile update;
- pinned Prettier formatting;
- lint;
- TypeScript 6.0.3 typecheck;
- Vitest;
- build;
- format check.

The push-triggered bootstrap wrote canonical formatting and the authoritative workspace lockfile back to the branch. PR head advanced to:

```text
c94a98c94aa5fe55670fb77653b78f415a1cb4aa
```

## Normative documentation

- `docs/STABLE_IDENTITY_SOURCE_MAPPING_V2.md`
- `docs/adr/ADR-0004-stable-identity-and-source-mapping.md`
- `packages/stable-identity`

## Definition of Done

- [x] shared stable-identity package created
- [x] deterministic document identity implemented
- [x] source fingerprint implemented
- [x] per-capture identity implemented
- [x] revision identity implemented
- [x] stable node evidence model implemented
- [x] volatile runtime ID filtering implemented
- [x] stable data/class/content/asset evidence implemented
- [x] confidence/evidence scoring implemented
- [x] structural fallback implemented
- [x] deterministic collision handling implemented
- [x] cross-capture matched/added/removed mapping implemented
- [x] ambiguous duplicate mapping is fail-visible
- [x] Source Graph assignment implemented
- [x] repeat-capture stability tests implemented
- [x] Browser consumes shared identity package
- [x] authoritative lockfile/format bootstrap completed
- [x] NODE-04 normative docs/ADR written
- [ ] standard read-only frozen-lockfile CI restored
- [ ] final frozen-lockfile CI passes on completed NODE-04 head

## Exit rule

NODE-04 becomes DONE only after the temporary bootstrap workflow is removed, the normal read-only `pnpm install --frozen-lockfile` workflow is restored, and the complete branch passes all formal gates.

## Next

After completion proceed to:

```text
NODE-05 — Browser Extension Shell
```

NODE-05 owns the real browser extension product shell, manifest, runtime entrypoints, permissions, UI surfaces and extension lifecycle. It must consume NODE-02/03/04 shared packages rather than redefine file, IR or identity contracts.
