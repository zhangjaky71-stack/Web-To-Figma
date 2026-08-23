# Secure Parser & Migration V2

**Status:** NODE-23 normative implementation contract  
**Baseline:** V2 Baseline + V2.1 Addendum  
**Portable file:** `.wtf` (`application/x-wtf`)

## 1. Scope

NODE-23 is the hostile-input trust boundary between local `.wtf` bytes and all later Figma import/render work.

It owns:

- ZIP/container structure validation;
- schema and version compatibility validation;
- ZIP bomb / compression-ratio ceilings;
- ZIP slip / portable-path validation;
- duplicate path and overlapping-entry rejection;
- manifest inventory / size agreement;
- CRC32 transport integrity and exact-byte SHA-256 integrity;
- asset MIME/magic policy;
- SVG sanitization;
- V2 migration policy;
- validated parser preview for NODE-22 UI and NODE-24 capability planning.

NODE-23 does not create Figma nodes or choose Figma rendering strategies.

## 2. Hostile-input rule

Every `.wtf` is untrusted data, including files produced by W2F itself. Parser success is the only state that permits later import planning.

The parser must fail closed on ambiguous or unsupported input. It must never execute archive content, HTML, JavaScript, SVG script, extensions, nested archives, `eval`, or dynamically constructed code.

## 3. Runtime placement

The reusable parser lives in:

```text
packages/wtf-parser
```

It is platform independent and consumes Web-standard binary APIs only. The Figma UI iframe runs the parser because it owns browser `ArrayBuffer`, `Blob`, `DecompressionStream` and Web Crypto APIs. The Figma main sandbox remains responsible only for host Figma APIs and Canvas file-drop bytes.

Choose File, UI Drop and Canvas Drop therefore converge on:

```text
raw Uint8Array
  -> parseWtfPackage()
  -> validated WtfParsedPackage
  -> W2fParserPreview
```

Raw archive bytes are never interpreted by the renderer.

## 4. Validation order

NODE-23 validates in this order:

1. archive byte ceiling and ZIP EOCD signature;
2. central-directory structure;
3. multi-disk / ZIP64 / encryption / unsupported flags;
4. entry count, portable path, duplicate path and local-header agreement;
5. per-entry and total uncompressed size ceilings;
6. compression-ratio ceiling before decompression;
7. bounded Store/Deflate decoding and CRC32;
8. required `manifest.json` and `checksums.json`;
9. manifest schema and reader compatibility;
10. manifest-declared security limits and container inventory;
11. exact-byte SHA-256 against both manifest and checksums;
12. media policy / nested-archive rejection;
13. JSON UTF-8 and parse validation;
14. W2F IR validation;
15. SVG sanitization;
16. compatible V2 migration report;
17. validated preview generation.

Later stages cannot weaken an earlier gate.

## 5. ZIP policy

The reader supports the deterministic Store method emitted by NODE-21 and has a bounded raw-Deflate path for compatible archives.

It rejects:

- archives above the frozen 1 GiB ceiling;
- multi-disk ZIP;
- ZIP64 metadata;
- encrypted entries;
- unknown compression methods or unsafe flags;
- malformed EOCD/central/local headers;
- duplicate paths or shared local offsets;
- non-UTF-8/non-portable paths;
- path traversal and absolute paths;
- overlapping/out-of-range entry data;
- entry count, entry size, total size or compression-ratio violations;
- decompressed output that exceeds declared size;
- CRC32 mismatch.

Deflate output is consumed incrementally and cancelled if it exceeds the declared uncompressed length.

## 6. Manifest / checksum trust

`manifest.json` and `checksums.json` are reserved metadata used to establish trust. They are size-limited before JSON parsing.

The manifest must pass `@w2f/w2f-schema` validation and reader compatibility checks. The archive inventory must then match `manifest.files` exactly except for the two reserved metadata files.

For every payload entry:

```text
actual SHA-256 == manifest.files[].sha256 == checksums.json files[path]
```

CRC32 is not treated as a security checksum; SHA-256 is required before payload JSON/IR or asset bytes become trusted.

## 7. Asset policy

Executable/container media types are rejected. Nested ZIP or archive payloads are not automatically expanded or accepted.

Known raster image types use magic-byte checks where practical. `assets.json` embedded paths, roles, media types and byte lengths must agree with the manifest and actual bytes.

## 8. SVG sanitizer

SVG is handled as hostile XML text.

The sanitizer rejects at minimum:

- DOCTYPE / ENTITY;
- processing instructions / CDATA;
- `script`, `foreignObject`, `iframe`, `object`, `embed`, media, style/link/meta/base elements;
- `on*` event attributes;
- external/data/javascript/vbscript URLs;
- non-fragment `href`, `xlink:href`, `src`;
- unsafe or malformed `url(...)` references.

Only in-document fragment references are allowed. A sanitizer rejection is fatal; NODE-23 does not silently hand an unsafe SVG to Figma.

## 9. Version and migration policy

V2 format/schema major versions are required. Unsupported major versions fail closed.

Current `2.0.0` requires no mutation. Compatible V2 minor/patch variants produce an explicit `WtfMigrationReport`; unknown optional metadata may be preserved, while unsupported required capabilities/features are rejected by reader compatibility before migration.

Migration never upgrades an incompatible major version by guesswork.

## 10. Preview / V2.1 preservation

A successful parse returns a preview preserving:

- document/capture/revision identity;
- Render Tree section outline;
- stable source ids;
- render-node count;
- asset/reference counts;
- token usage count;
- `tokenPolicy: "literal"`.

This is the only input NODE-22 uses to enable import controls, and it is the starting evidence for NODE-24 capability planning.

## 11. Local-first constraints

NODE-23 performs no upload and no network fetch. The Figma manifest remains `allowedDomains: ["none"]`.

No parser path may use:

```text
fetch
XMLHttpRequest
WebSocket
eval
new Function
localStorage
sessionStorage
```

## 12. Exit gate

NODE-23 passes when:

- `@w2f/wtf-parser` builds, typechecks and tests independently;
- a real NODE-21 `.wtf` package parses successfully;
- Zip Slip, duplicate paths, malformed ZIP, checksum tampering, hidden entries, unsafe SVG and incompatible capability/version fixtures fail closed;
- Figma UI invokes the shared parser for all three intake paths;
- packaged Figma UI contains the parser/security logic and remains local-only;
- permanent NODE-23 foundation guardrails pass;
- frozen-lockfile repository-wide CI is green on the exact PR head.
