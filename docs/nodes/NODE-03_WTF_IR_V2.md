# NODE-03 — W2F IR V2

## Status

**DONE / PASS**

## Goal

Freeze the complete shared semantic IR between normalized browser capture and downstream render/capability logic while preserving the `.wtf` V2 compatibility boundaries established by NODE-02.

NODE-03 defines data models, validation, deterministic serialization and migration boundaries. Capture, inference and Figma rendering algorithms remain owned by later NODEs.

## Implemented package

```text
packages/w2f-ir
```

Dependencies:

```text
@w2f/w2f-schema: workspace:*
```

IR version:

```text
2.0.0
```

Canonical envelope:

```text
WtfIrEnvelope
├ irVersion
└ bundle
   ├ document
   ├ sourceGraph
   ├ renderTree
   ├ styles
   ├ assets
   ├ responsive
   ├ states
   ├ diagnostics
   └ tokens
```

## Source Graph

Source-node vocabulary:

```text
document
element
text
pseudo
shadow-root
iframe
slot
comment
```

Source Graph preserves:

- `captureNodeId` and stable-identity hooks;
- source/composed/render relationship reservations;
- child source IDs;
- tag/role/attributes/selector/pseudo/text evidence;
- exact double-precision geometry;
- style and asset references;
- structural fingerprints and revision hashes;
- scroll-container information;
- document/capture/revision metadata.

## Render Tree

Render-node vocabulary includes:

```text
document
section
container
text
image
vector
video-frame
canvas
table
row
cell
control
decoration
fallback
```

Every Render Node maps to one or more Source Nodes using `sourceNodeIds`.

Render Tree preserves hierarchy, stable-source mapping, meaningful names, geometry, layout, paint, text, assets, render strategy, decision evidence, component-candidate metadata, revision hashes, diagnostics and section outline.

## Semantic layout/CSS model

CSS lengths retain authored semantics instead of being flattened to px:

```text
px / percent / em / rem
vw / vh / vmin / vmax
keyword / expression
```

A length may additionally preserve `resolvedPx` and authored text.

Layout IR covers:

- flow/flex/grid/absolute/table/inline/contents;
- FILL/HUG/FIXED/intrinsic/content/unknown sizing;
- min/max sizing;
- padding and effective gaps;
- overflow;
- flex container/item evidence;
- grid tracks/placement;
- absolute constraints.

Major sizing/layout/render decisions carry:

```text
confidence
reasons[]
sourceRefs?
```

## Paint / text / asset IR

Paint supports solid/image/gradient fills, borders/radii, shadows, opacity, blend/isolation, filters, mask and clip metadata.

Text preserves semantic runs plus browser line-fragment and baseline evidence, font metadata, direction and Editable/Balanced/Pixel strategy hints.

Assets support image, SVG, font metadata, canvas raster, video frame, fallback raster and pixel-reference records with checksum, dimensions, source/current URLs and provenance hooks.

## Environment / state / responsive

IR preserves browser/platform/language/direction, color scheme, reduced motion, viewport, DPR and zoom evidence.

State and responsive data include visual/pseudo states, animation-capture mode, responsive snapshots/rules, media-rule traces and container-query information.

## V2.1 integration

NODE-03 integrates the protocol hooks frozen earlier for:

- Stable Identity;
- Token Graph;
- Structural Fingerprint;
- Revision Metadata / node revision hashes;
- Scroll Root;
- Composed Tree;
- double-precision geometry.

Later NODEs generate these values; NODE-03 guarantees their semantic location and compatibility.

## Diagnostics

Structured domains:

```text
SOURCE PERMISSION CAPTURE DOM CSS TEXT ASSET
RESPONSIVE LAYOUT COMPOSITING FILE FIGMA FONT
RENDER QA PERFORMANCE SECURITY
```

Severity is `info | warning | error | fatal`. Diagnostics may reference Source/Render Nodes and include evidence/metadata.

## Validation and codec

`validateWtfIrBundle` enforces runtime cross-payload integrity beyond TypeScript typing, including unique IDs, acyclic/reachable trees, Source→Render mapping, source relationships, geometry/confidence, style/asset/state/environment/snapshot references, responsive stable IDs, diagnostics, token references, hashes and revision/root consistency.

Implemented codec:

```text
createWtfIrEnvelope
encodeWtfIrEnvelope
decodeWtfIrEnvelope
migrateWtfIrEnvelope
```

Canonical JSON comes from NODE-02. Valid IR supports deterministic encode/decode/encode roundtrip.

The known internal flat V2 draft envelope can migrate to the canonical nested V2 envelope. Unknown IR versions fail closed. Full `.wtf` archive migration remains NODE-23.

## Tests

Suites:

```text
packages/w2f-ir/test/fixture.ts
packages/w2f-ir/test/roundtrip.test.ts
packages/w2f-ir/test/validation.test.ts
```

Coverage includes canonical validation, deterministic roundtrip, sub-pixel precision, flat-draft migration, unsupported versions, invalid JSON, broken Source→Render mapping, graph cycles/unreachable nodes, dangling style/asset/diagnostic references, responsive identity/environment errors, revision drift and malformed asset hashes.

Browser Extension and Figma Plugin both consume `@w2f/w2f-ir: workspace:*` and verify `WTF_IR_VERSION = 2.0.0`.

## Monorepo task-graph correction

NODE-03 introduced the dependency chain:

```text
Browser / Figma
→ w2f-ir
→ w2f-schema
```

Workspace declarations are published from `dist`, so consumer typecheck must wait for upstream declaration builds. Turborepo `typecheck` now depends on both:

```text
^build
^typecheck
```

## Validation history

Bootstrap CI found and resolved two genuine integration issues:

1. migration `fromVersion` required a widened `string` type;
2. multi-level workspace typecheck required upstream `^build` output.

After correction, bootstrap lint/typecheck/test/build/format passed and committed the authoritative lockfile plus pinned Prettier output in:

```text
0b252f64c30296332244e4c43c48126af53dedc0
```

The temporary bootstrap workflow was removed. Standard read-only CI was restored with:

```text
pnpm install --frozen-lockfile
```

GitHub Actions run `32564946698` then passed:

- foundation validation: **PASS**;
- Node.js 24 / pnpm 11.22.0: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Vitest: **PASS**;
- build: **PASS**;
- Prettier: **PASS**.

## Normative documentation

- `docs/WTF_IR_V2.md`
- `docs/adr/ADR-0003-source-graph-render-tree-and-ir-boundaries.md`
- `packages/w2f-ir`

## Definition of Done

- [x] shared `@w2f/w2f-ir` package
- [x] Source Graph
- [x] Render Tree and Source→Render mapping
- [x] layout/sizing/CSS semantic IR
- [x] paint/text/font/asset IR
- [x] environment/state/responsive IR
- [x] diagnostics IR
- [x] V2.1 integrations
- [x] deterministic codec
- [x] roundtrip tests
- [x] migration tests
- [x] runtime cross-reference validation
- [x] Browser/Figma shared IR consumption
- [x] multi-level workspace task graph corrected
- [x] authoritative lockfile/formatting
- [x] standard frozen-lockfile CI restored
- [x] frozen-lockfile CI passed

## Exit rule

Satisfied. NODE-03 is complete and the Semantic IR V2 boundaries are frozen for downstream implementation.

## Next

```text
NODE-04 — Stable Identity & Source Mapping
```

NODE-04 implements stable node identity generation, confidence/evidence scoring, document/capture identity and deterministic source mapping using the hooks frozen by NODE-02/NODE-03.
