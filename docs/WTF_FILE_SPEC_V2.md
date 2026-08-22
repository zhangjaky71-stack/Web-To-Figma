# W2F Portable File Specification V2

**Status:** FROZEN FOR IMPLEMENTATION  
**Format:** `.wtf`  
**MIME:** `application/x-wtf`  
**Format version:** `2.0.0`  
**Schema version:** `2.0.0`  
**Baseline:** V2 Baseline + V2.1 Architecture Addendum

## 1. Purpose

A `.wtf` file is the portable data contract between W2F Capture and W2F for Figma. It preserves enough rendering-state evidence for later reconstruction without treating the package as executable content.

The format contract is shared by both products through:

```text
packages/w2f-schema
```

Browser and Figma code must not maintain independent copies of the manifest or compatibility model.

## 2. Container model

The logical container is:

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
├ references/              optional
│  ├ index.json
│  └ ... tiles
├ assets/                  optional binary payloads
├ preview/                 optional previews
├ fallback/                optional raster fallback payloads
└ extensions/              future optional payloads
```

`manifest.json` and `checksums.json` are reserved container entries. They are not duplicated inside `manifest.files`.

Every other payload entry must be inventoried by `manifest.files`. Unknown hidden payload entries are invalid.

The physical archive encoder/decoder is implemented later by NODE-21 and NODE-23. NODE-02 freezes the logical archive contract, path rules, inventory, compatibility and integrity semantics those nodes must obey.

## 3. Canonical required entrypoints

V2 requires the following canonical payload paths:

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

The manifest must point to those exact paths. This prevents producer-specific path drift.

A reference-tile index is optional until pixel-ground-truth capture is produced, but when declared it must be a portable path and must exist in the manifest inventory.

## 4. Manifest

The manifest contains:

```text
kind
compatibility
identity
captureTarget
entrypoints
features
files
security
signature?   future authenticity reservation
```

The canonical container kind is:

```text
w2f-portable-document
```

### 4.1 Compatibility

```ts
interface WtfCompatibilityInfo {
  formatVersion: string
  schemaVersion: string
  writerVersion: string
  minReaderVersion: string
  assetCodecVersion: string
  capabilities: string[]
}
```

Rules:

- `formatVersion`, `schemaVersion`, `writerVersion` and `minReaderVersion` use `x.y.z` semantic versions.
- NODE-02 readers accept only format major `2` and schema major `2`.
- A reader older than `minReaderVersion` must reject the package.
- Every manifest capability is required; a reader that does not support one must reject the package rather than silently discard semantics.
- Future minor/patch additions may add metadata that older readers can ignore when it is not declared as required capability/feature.

### 4.2 Feature flags

Features are separated into:

```ts
{
  required: string[]
  optional: string[]
}
```

A feature cannot be both required and optional.

V2 core required features are:

```text
source-graph
render-tree
precise-geometry
```

Known feature vocabulary additionally reserves:

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

Required unknown features are fail-closed. Optional unknown features may be ignored by a reader that does not consume them, provided core reconstruction remains valid.

## 5. Identity and revision

The manifest preserves:

```text
documentId
captureId
sourceFingerprint
capturedAt
revisionId?
parentRevisionId?
```

This separates stable document identity from one capture event and reserves the ancestry needed for future incremental update/merge.

V2.1 also reserves per-node revision hashes:

```text
contentHash
geometryHash
layoutHash
paintHash
assetHash
hierarchyHash
```

NODE-02 defines these fields; later nodes determine how they are computed.

## 6. Capture target and scroll-root reservation

Capture target is one of:

```text
document
scroll-root(sourceNodeId)
region(bounds)
```

This prevents “full page” from being hard-coded to the browser document when the real application content lives inside a primary scrolling container.

`ScrollContainerInfo` reserves scroll dimensions, offsets, overflow behavior, document-root status, primary-application-root status and parent scroll-container linkage.

## 7. Source, composed and render relationships

V2.1 reserves three distinct parent relationships:

```text
sourceParentId
composedParentId
renderParentId
```

It also reserves:

```text
assignedSlotId
shadowHostId
```

These relations must remain distinguishable. A DOM parent, browser composed-tree parent and optimized render-tree parent are not assumed to be the same.

## 8. Geometry precision

Geometry is stored as JavaScript/JSON finite numbers using IEEE-754 double precision.

Capture-layer rounding is forbidden.

Example values such as:

```text
143.3333282470703
0.3333333333333333
```

must survive serialization without integer quantization. Renderer-side rounding may happen only at a platform boundary when required by the target API and must not mutate the source evidence.

## 9. Token Graph reservation

`tokens.json` preserves CSS token relationships instead of only resolved literals.

It contains:

```text
tokens[]
usages[]
```

Tokens support aliases through token-to-token references. Usage records retain both authored and resolved values.

The first Figma renderer may still import literal values; it must not require the capture format to throw token relationships away.

## 10. Structural fingerprint reservation

V2.1 reserves:

```text
semanticHash
layoutHash
paintHash?
combinedHash
confidence
```

This is distinct from stable identity. It describes repeated structural/component patterns rather than whether two captures refer to the same source node.

Automatic Figma component creation is not part of NODE-02.

## 11. Responsive, states and reference tiles

The file contract reserves:

- responsive snapshots with viewport width, height, DPR, root node, environment and optional state reference;
- named state snapshots;
- pixel-reference tile descriptors with viewport, bounds, DPR and SHA-256.

The capture and inference behavior is implemented by later nodes; NODE-02 guarantees a stable place to persist the evidence.

## 12. File inventory and integrity

Each manifest payload descriptor contains:

```text
path
role
mediaType
sizeBytes
sha256
```

SHA-256 is lowercase hexadecimal and exactly 64 characters.

`checksums.json` uses:

```json
{
  "algorithm": "sha256",
  "files": {
    "document.json": "..."
  }
}
```

Its key set must match the manifest payload inventory exactly and every checksum must match the corresponding manifest descriptor.

Checksums provide integrity, not authenticity.

An optional future `signature` field is reserved for authenticity and is intentionally separate from checksums.

## 13. Deterministic JSON

W2F exposes canonical JSON serialization for hashable protocol objects.

Rules:

- object keys are sorted lexicographically;
- array order is preserved;
- finite JSON numbers are preserved without capture rounding;
- `NaN` and infinities are rejected;
- cyclic values are rejected;
- non-plain object instances are rejected.

This creates a stable basis for future deterministic hashes and revision comparisons.

## 14. Portable paths

Archive paths must:

- be non-empty relative paths;
- use `/`, never `\\`;
- not use drive-letter or absolute paths;
- not contain `.` or `..` segments;
- not contain empty path segments;
- not contain NUL/control characters;
- remain within the configured maximum path length.

These rules are the contract used later to prevent archive path traversal / zip-slip behavior.

## 15. Security limits

The reader hard ceilings frozen by NODE-02 are:

```text
maxArchiveBytes       1,073,741,824
maxEntryBytes           268,435,456
maxJsonBytes            134,217,728
maxAssetBytes           536,870,912
maxEntries                  100,000
maxPathLength                 1,024
maxCompressionRatio              200
```

A package may declare stricter limits but may not raise the reader hard ceilings.

Container validation must reject:

- too many entries;
- oversized entries;
- oversized total uncompressed data;
- excessive compression ratios;
- duplicate paths;
- path traversal/non-portable paths;
- entries not declared by the manifest;
- missing required entries;
- entry sizes that disagree with the manifest.

These limits are defense-in-depth protocol ceilings. NODE-23 may add stricter runtime budgets and streaming enforcement without changing the V2 wire contract.

## 16. Data-only security rule

A `.wtf` package is data.

Readers must not treat package content as trusted executable code. The format does not grant permission for:

```text
eval
script execution
HTML execution
extension execution
untrusted SVG execution
```

SVG sanitization and full secure parsing are implemented by NODE-23.

## 17. Shared-package acceptance rule

NODE-02 is complete only when:

```text
Browser Extension
      ↓
@w2f/w2f-schema
      ↑
Figma Plugin
```

both compile and test against the same workspace package and the frozen-lockfile CI passes.

## 18. Ownership boundaries

NODE-02 owns:

- portable container contract;
- manifest and inventory;
- compatibility and feature negotiation;
- checksum semantics;
- portable path rules;
- security ceilings;
- deterministic JSON primitive;
- V2/V2.1 protocol reservations.

NODE-02 does not own:

- complete Semantic IR field definitions — NODE-03;
- stable identity generation algorithm — NODE-04;
- actual browser capture — NODE-05 onward;
- archive writing — NODE-21;
- secure archive parsing/migration — NODE-23;
- Figma rendering — NODE-24 onward.

This boundary prevents later implementation details from silently redefining the portable format.
