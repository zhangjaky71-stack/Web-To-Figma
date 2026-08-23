# NODE-21 — WTF Packager

## Objective

Close Phase B with a real Browser export path from persisted W2F capture evidence to a portable `.wtf` package.

## Entry baseline

```text
f0d10cdbec3fe805468a0ff8a8ccce701e4896c6
```

## Branch / PR

```text
feat/node-21-wtf-packager
PR #25
```

## Frozen scope

```text
files
manifests
references
feature flags
checksums
zip
download
```

## Implementation

### Shared writer

`@w2f/wtf-packager` owns:

- canonical payload byte conversion;
- portable path/reserved-name enforcement;
- payload SHA-256 inventory;
- manifest/checksums construction and shared-schema validation;
- deterministic ZIP32 Store encoding;
- CRC32;
- archive SHA-256;
- `.wtf` filename normalization and MIME.

### Browser assembly

`wtf-package-builder.ts` converts persisted Browser evidence to the canonical V2 entrypoints and inventories binary assets/reference tiles.

`wtf-export-runtime.ts` resolves a normal capture job directly or selects the first persisted responsive child artifact while preserving parent responsive inference.

`wtf-package-store.ts` persists the finished package bytes without passing large binary payloads through runtime messages.

### User export

The popup exposes `Export .wtf` only for completed jobs. It asks the service worker to materialize/store the package, reads the stored bytes, creates an `application/x-wtf` Blob and invokes `chrome.downloads.download`.

Both Browser profiles add `downloads`; no host permission is added.

## Validation matrix

- deterministic package bytes for repeated identical input;
- canonical required V2 payload inventory;
- manifest and checksums exclude reserved entries and agree exactly;
- CRC32/ZIP header structure;
- duplicate/reserved/unsafe path rejection;
- package-store namespace and metadata/byte consistency;
- Browser dependency and runtime packaging;
- Standard packaged-output export validation;
- High Fidelity packaged-output export validation;
- permanent foundation guardrail;
- exact-head frozen-lockfile CI.

## Ownership boundaries

- NODE-22: Figma Plugin Shell & File Intake.
- NODE-23: secure parser, archive security and migration.
- NODE-24+: capability mapping and rendering.

## Exit Gate

```text
Web → .wtf
```

NODE-21 is complete only when the exact final PR head passes the full repository quality gate and both Browser package profiles contain the production writer/download path.
