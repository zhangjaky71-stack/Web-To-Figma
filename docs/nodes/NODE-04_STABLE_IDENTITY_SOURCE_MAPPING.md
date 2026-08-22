# NODE-04 — Stable Identity & Source Mapping

## Status

**DONE — PASS**

## Goal

Implement the deterministic stable identity and cross-capture source mapping layer reserved by V2/V2.1 and NODE-03.

NODE-04 makes repeated captures correlatable without treating volatile browser/framework runtime IDs as stable truth.

## Implemented package

```text
packages/stable-identity
```

Shared algorithm version:

```text
1.0.0
```

Dependencies:

```text
@w2f/w2f-schema
@w2f/w2f-ir
```

## Implemented identity layers

### Document identity

Normalized logical source locators are implemented for HTTP, file, local-folder and opaque source keys.

HTTP normalization removes credentials, fragments and tracking parameters while deterministically sorting retained query parameters.

`documentId` is derived from the normalized locator. `sourceFingerprint` additionally accepts root structural evidence.

### Capture identity

`captureId` is derived from document ID, canonical timestamp and capture nonce. Repeated captures preserve document identity while receiving distinct capture identities.

### Revision identity

Deterministic `revisionId` generation supports optional `parentRevisionId` and produces a NODE-02-compatible manifest identity object.

## Stable node signal normalization

Normalized evidence includes:

- source/document scope;
- namespace/tag and semantic role;
- stable HTML `id` when accepted;
- selected stable `data-*` attributes;
- meaningful class signature;
- bounded semantic ancestry;
- normalized text/content;
- asset fingerprints;
- structural sibling/document position.

Volatile React/Radix/Headless UI/hydration IDs, UUID-like values, timestamps/long digits, hash-like values, unstable framework data attributes, CSS Module hashes, generic utility classes and Tailwind-like utility tokens are filtered before hashing.

## Confidence and collision handling

Every assignment writes:

```text
stableIdentity.id
stableIdentity.confidence
stableIdentity.evidence[]
signatureHash
normalized signals
```

High-value semantic evidence increases confidence. Structural-only fallback is capped at lower confidence.

`assignStableIdentities` detects duplicate base stable IDs within one capture. Colliding nodes are deterministically separated with semantic ancestry plus structural position and their confidence is reduced. If candidates still cannot be separated deterministically, the engine throws rather than using input-array order.

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

## Source Graph integration

Implemented:

```text
applyStableIdentityAssignments
toStableMappedNodes
```

Assignments are applied immutably to NODE-03 `WtfSourceNode.stableIdentity` and explicitly report unmapped capture IDs plus unused assignments.

## Browser integration

Browser Extension depends on:

```text
@w2f/stable-identity: workspace:*
```

and exposes `STABLE_IDENTITY_ALGORITHM_VERSION` through its integration test. Later capture nodes must reuse this package rather than duplicate stable identity logic.

## Tests

`packages/stable-identity/test/identity.test.ts` and `mapping.test.ts` cover:

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

The first cloud run exposed one strict TypeScript `exactOptionalPropertyTypes` incompatibility. The normalized signal type was corrected without weakening strict TypeScript settings.

The subsequent bootstrap passed workspace lockfile update, pinned Prettier formatting, lint, TypeScript 6.0.3 typecheck, Vitest, build and format check. The push-triggered bootstrap committed canonical formatting and the authoritative workspace lockfile; the generated branch head was:

```text
c94a98c94aa5fe55670fb77653b78f415a1cb4aa
```

## Formal frozen-lockfile validation

The temporary bootstrap workflow was removed and the standard read-only workflow restored with:

```text
pnpm install --frozen-lockfile
```

GitHub Actions run `32566068160` completed successfully on commit `d7882c58deecfdfffa6b6d2187dddcee58c5e5b9`.

Passed gates:

- foundation validation: **PASS**;
- Node.js 24 / pnpm 11.22.0: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Vitest: **PASS**;
- build: **PASS**;
- Prettier format check: **PASS**.

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
- [x] standard read-only frozen-lockfile CI restored
- [x] frozen-lockfile CI passes

## Exit rule

Satisfied. NODE-04 is complete.

## Next

Proceed to:

```text
NODE-05 — Browser Extension Shell
```

NODE-05 owns the real browser extension product shell, manifest, runtime entrypoints, permissions, UI surfaces and extension lifecycle. It must consume NODE-02/03/04 shared packages rather than redefine file, IR or identity contracts.
