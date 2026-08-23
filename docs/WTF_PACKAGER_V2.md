# WTF Packager V2

**Status:** implementation contract for NODE-21  
**Portable file:** `.wtf`  
**MIME:** `application/x-wtf`  
**Format / schema:** `2.0.0`

## Purpose

NODE-21 closes the Browser capture phase by turning the persisted W2F evidence graph into one portable, deterministic `.wtf` data package.

Exit outcome:

```text
Web → `.wtf`
```

The writer implements the frozen logical contract in `docs/WTF_FILE_SPEC_V2.md`; it does not redefine the file format.

## Canonical payloads

The writer always emits the required canonical V2 entrypoints:

```text
document.json
source-graph.json
render-tree.json
styles.json
assets.json
responsive.json
states.json
diagnostics.json
tokens.json
source/cascade.json
source/metadata.json
```

Additional inventoried evidence may include:

```text
source/relationships.json
revisions.json
references/index.json
references/<sha256>.png
assets/<content-addressed payload>
```

`manifest.json` and `checksums.json` are reserved container entries and are never duplicated in `manifest.files`.

## Evidence assembly

The Browser writer consumes already-persisted capture evidence. It does not recapture the page during export.

For normal Full Page / Region capture, the capture `jobId` is the artifact id.

For Responsive capture, the parent job owns the responsive capture/inference sidecars while each viewport owns its own Raw/CSS/Environment/Assets/Pixel/Render/Compositing sidecars. NODE-21 uses the first successfully persisted responsive viewport as the canonical Source/Render baseline and keeps the full responsive snapshot/rule evidence in `responsive.json`.

## Assets and pixel references

Resolved binary assets retain their content-addressed embedded paths.

NODE-14 pixel-reference resources are emitted as `references/<sha256>.png`. `references/index.json` inventories viewport/full-page/node-fallback reference evidence and the manifest points to it through `entrypoints.referenceTiles` when present.

Compositing fallback pixels remain real raster evidence produced before NODE-21; the writer only packages that evidence.

## Manifest and checksums

Every non-reserved payload descriptor records:

```text
path
role
mediaType
sizeBytes
sha256
```

SHA-256 is calculated over the exact uncompressed payload bytes.

`checksums.json` uses the same payload key set and hashes as `manifest.files`. Generated manifest, checksums and logical container entries are revalidated with the shared `@w2f/w2f-schema` validators before ZIP encoding.

## Deterministic JSON

JSON payloads are serialized with the shared `canonicalStringify` primitive:

- object keys lexicographically sorted;
- array order preserved;
- finite double-precision numbers retained;
- non-finite, cyclic and non-plain values rejected.

## Deterministic ZIP writer

NODE-21 uses a deterministic ZIP32 **Store** writer:

- entries sorted lexicographically by portable path;
- UTF-8 path flag enabled;
- compression method `0` (Store);
- fixed DOS timestamp `1980-01-01 00:00:00`;
- CRC32 in local and central directory records;
- stable local offsets and central directory order;
- duplicate entry names rejected;
- ZIP32 size/count ceilings enforced.

Store mode is intentional. It prevents compressor/library/version differences from changing archive bytes for identical W2F input. The same logical input therefore produces the same `.wtf` bytes and archive SHA-256.

## Writer security boundary

The writer applies the frozen portable-path and hard-size ceilings before archive creation. It rejects reserved payload names, duplicate paths, oversized entries, excessive entry counts and generated archives over the configured writer limit.

NODE-21 writes trusted capture output; it does **not** parse hostile ZIP input.

NODE-23 owns reader-side security including:

- ZIP parsing;
- zip-slip/path traversal defense;
- duplicate/hidden entry rejection;
- zip-bomb/compression-ratio enforcement;
- checksum verification against extracted bytes;
- migrations;
- SVG sanitization and data-only intake enforcement.

## Browser download flow

The service worker builds and stores the resulting archive in the same extension origin using the dedicated `w2f-wtf-packages` IndexedDB database.

Runtime messages return only a compact export receipt; package bytes are not sent through `chrome.runtime.sendMessage`.

The popup reads the stored `Uint8Array`, creates a Blob with `application/x-wtf`, creates a temporary object URL and starts the browser download through `chrome.downloads.download`.

Both Standard and High Fidelity manifests request only the additional `downloads` permission required for this local export. NODE-21 adds no remote host permission.

## Ownership boundaries

NODE-21 owns:

- Browser evidence-to-file assembly;
- manifest construction;
- feature/capability declaration;
- SHA-256 payload inventory;
- deterministic ZIP writing;
- package persistence;
- `.wtf` download.

NODE-21 does not own:

- hostile package parsing or migration — NODE-23;
- Figma file picker/drop intake — NODE-22;
- Figma capability resolution — NODE-24;
- Figma rendering — NODE-25 onward.

## Exit Gate

NODE-21 passes only when:

```text
capture evidence
  → canonical V2 payloads
  → valid manifest + checksums
  → deterministic ZIP bytes
  → StoredWtfPackage
  → popup Blob download
  → filename.wtf
```

and foundation, frozen-lockfile install, lint, typecheck, tests, Standard package validation, High Fidelity package validation, build and format checks all pass on the exact PR head.
