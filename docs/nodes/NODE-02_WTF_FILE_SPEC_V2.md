# NODE-02 — W2F File Spec V2

## Status

**IN PROGRESS — implementation complete, final frozen-lockfile CI pending**

## Goal

Freeze the `.wtf` V2 portable-format contract before Semantic IR, browser capture, packaging and Figma import are implemented.

The protocol must be shared by Browser Extension and Figma Plugin and must already reserve the V2.1 fields that would otherwise require a breaking schema change later.

## Baseline inputs

NODE-02 implements the requirements from:

- V2 Baseline — NODE-02;
- V2 Baseline — `.wtf V2 Container` and Compatibility Contract;
- V2.1 Architecture Addendum;
- NODE-00 product/acceptance contracts;
- NODE-01 frozen monorepo/toolchain.

## Implemented package

```text
packages/w2f-schema
```

Exports:

- `.wtf` extension and MIME constants;
- format/schema/asset-codec versions;
- container kind;
- canonical entrypoints;
- feature vocabulary;
- manifest types;
- compatibility types and reader compatibility check;
- payload file inventory types;
- checksum model and validator;
- archive-entry model and validator;
- portable-path validator;
- hard security limits;
- deterministic canonical JSON serializer;
- finite double-precision geometry contract;
- capture-target model;
- responsive/state/reference-tile references;
- V2.1 Token Graph model and validator;
- V2.1 Structural Fingerprint reservation;
- V2.1 Revision Metadata reservation;
- V2.1 Scroll Root reservation;
- V2.1 Composed Tree relationship reservation.

## Shared consumer proof

Both executable apps depend on:

```text
@w2f/w2f-schema: workspace:*
```

and compile against the same `WTF_SCHEMA_VERSION` export.

This proves the NODE-02 DoD requirement that Browser/Figma use one schema package rather than duplicated protocol definitions.

## Container contract

Canonical logical container:

```text
document.wtf
├ manifest.json
├ checksums.json
├ document.json
├ source-graph.json
├ render-tree.json
├ styles.json
├ assets.json
├ responsive.json
├ states.json
├ diagnostics.json
├ tokens.json
├ source/
│  ├ cascade.json
│  └ metadata.json
├ references/...
├ assets/...
├ preview/...
└ fallback/...
```

`manifest.json` and `checksums.json` are reserved. Every other payload must be inventoried by `manifest.files`.

Physical archive encoding is intentionally deferred to NODE-21. Secure decoding/migration is intentionally deferred to NODE-23.

## Compatibility contract

V2 uses:

```text
formatVersion = 2.0.0
schemaVersion = 2.0.0
assetCodecVersion = 1
```

Fail-closed conditions include:

- unsupported format major;
- unsupported schema major;
- reader below `minReaderVersion`;
- unsupported required capability;
- unsupported required feature.

Unknown optional features do not automatically invalidate a package.

## Required core features

Every V2 manifest must require:

```text
source-graph
render-tree
precise-geometry
```

Additional known V2/V2.1 vocabulary includes:

```text
stable-identity
responsive-snapshots
states
pixel-ground-truth
raster-tiles
token-graph
structural-fingerprints
revision-metadata
scroll-roots
composed-tree
```

## Integrity

Payloads are described by:

```text
path
role
mediaType
sizeBytes
sha256
```

`checksums.json` must cover exactly the manifest payload inventory.

SHA-256 values are lowercase 64-character hexadecimal strings.

Checksums are integrity metadata, not signatures.

## Security contract

Portable archive paths reject:

- absolute paths;
- Windows drive paths;
- backslashes;
- empty/`.`/`..` segments;
- NUL/control characters;
- excessive path lengths.

Frozen hard ceilings:

```text
archive bytes       1 GiB
entry bytes         256 MiB
JSON bytes          128 MiB
asset bytes         512 MiB
entry count         100,000
path length         1,024
compression ratio   200x
```

Container inventory validation additionally rejects:

- undeclared payload entries;
- missing required entries;
- duplicate entries;
- size mismatches;
- oversized total data;
- excessive decompression ratios.

## Geometry precision

Capture evidence uses finite JavaScript/JSON numbers as IEEE-754 doubles.

Capture-time rounding is forbidden.

The tests explicitly preserve fractional values such as:

```text
143.3333282470703
```

## V2.1 reservations

### Token Graph

Preserves token definitions, aliases and authored/resolved usages.

### Structural Fingerprint

Reserves semantic/layout/paint/combined hashes and confidence for repeated component-like structures.

### Incremental Merge Metadata

Reserves document/capture/revision identity and per-node revision hashes.

### Scroll Root

Reserves nested scroll-container geometry and primary application scroll-root classification.

### Composed Tree

Separates source parent, composed parent and render parent; also reserves slot and Shadow DOM host relationships.

### Geometry Precision

Freezes double-precision source evidence and deterministic JSON behavior.

## Tests implemented

`packages/w2f-schema/test/index.test.ts` covers:

- fixed extension/MIME/version contract;
- V2.1 feature vocabulary;
- canonical manifest acceptance;
- forward-compatible unknown top-level metadata;
- incompatible major versions;
- missing core features;
- malformed hashes;
- duplicate/reserved payloads;
- portable path traversal protection;
- archive inventory/size/compression limits;
- hidden payload rejection;
- checksum exact coverage;
- reader compatibility;
- deterministic JSON;
- non-finite/cyclic JSON rejection;
- double-precision geometry;
- token alias/reference integrity;
- canonical SHA-256 validation.

## First cloud validation

The first NODE-02 GitHub-hosted run proved:

- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- `w2f-schema` tests: **15 PASS**;
- Browser Extension shared-schema test: **PASS**;
- Figma Plugin shared-schema test: **PASS**;
- build: **PASS**.

That run identified only canonical Prettier formatting in `packages/w2f-schema/src/index.ts`; the pinned Prettier 3.9.6 output was then applied automatically and committed together with the updated workspace lockfile.

## Documentation

- `docs/WTF_FILE_SPEC_V2.md` — normative portable-format document;
- `docs/adr/ADR-0002-wtf-v2-compatibility-integrity-and-security-contract.md` — compatibility/integrity/security decision;
- `packages/w2f-schema` — executable contract and validators.

## Definition of Done

- [x] `.wtf` V2 container contract defined
- [x] manifest contract defined
- [x] compatibility contract defined
- [x] checksums/inventory contract defined
- [x] feature negotiation defined
- [x] source/render tree entrypoints reserved
- [x] responsive/state entrypoints reserved
- [x] reference-tile model reserved
- [x] security limits and portable paths defined
- [x] V2.1 Token Graph reserved
- [x] V2.1 Structural Fingerprint reserved
- [x] V2.1 Revision Metadata reserved
- [x] V2.1 Scroll Root reserved
- [x] V2.1 Composed Tree reserved
- [x] V2.1 Geometry Precision policy frozen
- [x] Browser Extension consumes shared schema package
- [x] Figma Plugin consumes shared schema package
- [x] runtime schema tests pass in GitHub Actions
- [x] TypeScript/lint/build gates pass in GitHub Actions
- [x] authoritative workspace lockfile updated
- [ ] formal CI restored to `pnpm install --frozen-lockfile`
- [ ] final frozen-lockfile CI passes after documentation/status closure

## Exit rule

NODE-02 becomes DONE only after the temporary bootstrap workflow is removed, the standard read-only frozen-lockfile CI is restored, and that CI passes on the final branch head.

## Next

After completion, proceed to:

```text
NODE-03 — W2F IR V2
```

NODE-03 will define the complete Source Graph / Render Tree / layout / paint / text / asset / responsive / state / diagnostic IR using the portable boundaries frozen here.
