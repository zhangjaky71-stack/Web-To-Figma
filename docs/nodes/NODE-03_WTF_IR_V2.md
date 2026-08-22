# NODE-03 — W2F IR V2

## Status

**IN PROGRESS — implementation complete, final frozen-lockfile CI pending**

## Goal

Define the complete shared semantic IR used between normalized browser capture and downstream render/capability logic, while preserving the portable compatibility/integrity boundaries frozen by NODE-02.

NODE-03 owns the data model and validation contract, not the later capture/inference/render algorithms.

## Implemented package

```text
packages/w2f-ir
```

The package depends on:

```text
@w2f/w2f-schema: workspace:*
```

and exports the shared Browser/Figma IR API.

## IR version

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

Implemented Source Node vocabulary:

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

Preserved evidence includes:

- per-capture identity;
- stable identity reservation with confidence/evidence;
- source/composed/render relationship fields from V2.1;
- child source IDs;
- semantic tag/role/attributes/selector;
- pseudo/text evidence;
- double-precision geometry;
- style and asset references;
- structural fingerprint;
- revision hashes;
- scroll-container model;
- document/capture/revision metadata.

## Render Tree

Implemented Render Node vocabulary includes:

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

Every Render Node maps to one or more Source Nodes through `sourceNodeIds`.

Render Tree additionally preserves:

- parent/child hierarchy;
- source stable IDs;
- meaningful layer name;
- geometry;
- layout model;
- paint model;
- text model;
- asset references;
- render strategy;
- decision confidence/reasons;
- component-candidate fingerprint;
- revision hashes;
- diagnostic references;
- section outline.

## CSS semantic model

Lengths are not flattened to px.

Supported semantic forms:

```text
px
percent
em
rem
vw
vh
vmin
vmax
keyword
expression
```

The same length may retain `resolvedPx` and authored source text.

This preserves authored intent while keeping browser-resolved truth available.

## Layout IR

Implemented:

- flow/flex/grid/absolute/table/inline/contents modes;
- FILL/HUG/FIXED/intrinsic/content/unknown sizing vocabulary;
- min/max sizing;
- padding/effective gaps;
- overflow;
- flex container/item data;
- grid tracks/item placement;
- absolute constraints;
- explainable decision evidence.

Every major layout decision has:

```text
confidence
reasons[]
sourceRefs?
```

## Paint IR

Implemented:

- solid fills;
- image fills;
- linear/radial/conic gradient data;
- borders/radii;
- shadows;
- opacity;
- blend/isolation;
- filter/backdrop-filter;
- mask/clip metadata.

This is capability-neutral: recognition does not assert native Figma support.

## Text IR

Implemented:

- semantic text value;
- styled text runs;
- browser line fragments;
- baseline;
- font family/style/weight/stretch;
- font variation/feature settings;
- PostScript/source/fingerprint metadata;
- size/line-height/letter spacing;
- color/decoration/baseline shift;
- direction;
- white-space/word-break/overflow-wrap/text alignment;
- Editable/Balanced/Pixel strategy hint.

## Asset IR

Implemented asset records for:

```text
image
svg
font-metadata
canvas-raster
video-frame
fallback-raster
pixel-reference
```

Records reserve checksum, embedded path, dimensions, source/current URL and provenance.

## Environment / state / responsive

Implemented:

- browser/platform/language/direction/color-scheme/reduced-motion environment;
- viewport/DPR/page zoom/CSS zoom reservation;
- current/light/dark visual state;
- animation capture mode;
- state snapshots;
- responsive snapshot references;
- responsive ranges/rules with confidence/evidence;
- media rule traces;
- container-query information.

## V2.1 integration

NODE-03 consumes and integrates the reservations frozen by NODE-02:

- Stable Identity hooks;
- Token Graph;
- Structural Fingerprint;
- Revision Metadata / node revision hashes;
- Scroll Root model;
- Composed Tree relationships;
- double-precision geometry.

NODE-04 and later nodes generate these values; NODE-03 guarantees their place in the semantic model.

## Diagnostics

Structured domains:

```text
SOURCE
PERMISSION
CAPTURE
DOM
CSS
TEXT
ASSET
RESPONSIVE
LAYOUT
COMPOSITING
FILE
FIGMA
FONT
RENDER
QA
PERFORMANCE
SECURITY
```

Severity:

```text
info
warning
error
fatal
```

Diagnostics can map to Source Nodes and Render Nodes and retain evidence/metadata.

## Validation

`validateWtfIrBundle` performs runtime structural and cross-reference validation beyond TypeScript typing.

Current checks include:

- unique source/render/style/asset/state/environment/snapshot/diagnostic IDs;
- acyclic and fully reachable source/render trees;
- valid Source→Render mapping;
- source relationship validity;
- geometry validity;
- confidence range validity;
- paint opacity validity;
- style and asset reference integrity;
- scroll-container source references;
- document/revision identity consistency;
- state/environment/snapshot reference integrity;
- responsive stable-identity targets;
- diagnostic reference integrity;
- token graph integrity;
- canonical SHA-256 when present.

## Deterministic codec

Implemented:

```text
createWtfIrEnvelope
encodeWtfIrEnvelope
decodeWtfIrEnvelope
migrateWtfIrEnvelope
```

Encoding uses NODE-02 canonical JSON.

Valid IR must support:

```text
encode
→ decode
→ semantic equality
→ encode
→ byte-identical canonical JSON
```

Unknown IR versions are rejected.

The recognized historical internal V2 flat-draft envelope can be migrated to the canonical nested V2 envelope. Full `.wtf` archive migration remains NODE-23.

## Tests

Implemented fixture and suites:

```text
packages/w2f-ir/test/fixture.ts
packages/w2f-ir/test/roundtrip.test.ts
packages/w2f-ir/test/validation.test.ts
```

Coverage includes:

- canonical IR validation;
- deterministic roundtrip;
- sub-pixel precision survival;
- flat-draft migration;
- unsupported version rejection;
- invalid JSON;
- broken Source→Render mapping;
- source graph cycle;
- unreachable render nodes;
- dangling style/asset references;
- unknown responsive stable IDs;
- unknown snapshot environments;
- revision drift;
- dangling diagnostic references;
- malformed asset hash.

## Shared consumer proof

Browser Extension and Figma Plugin both depend on:

```text
@w2f/w2f-ir: workspace:*
```

and both test the same `WTF_IR_VERSION = 2.0.0`.

There is no duplicate app-specific IR schema.

## Monorepo task-graph correction

NODE-03 exposed a deeper workspace dependency chain:

```text
Browser / Figma
→ w2f-ir
→ w2f-schema
```

Workspace packages publish declaration output in `dist`, so consumer typecheck must wait for upstream package build output.

Turborepo `typecheck` is therefore updated to depend on:

```text
^build
^typecheck
```

This preserves the source-only build boundary while making multi-level workspace type resolution deterministic.

## Bootstrap CI history

The first real cloud run found one literal-type inference issue in migration metadata. It was corrected by explicitly typing the migration source version as `string`.

The second run proved the IR package itself typechecked successfully but Browser/Figma could not yet resolve its unbuilt `dist` declarations. This exposed the missing upstream-build dependency in the task graph.

After correcting the Turborepo dependency graph, the bootstrap pipeline passed:

- workspace install/update;
- canonical Prettier formatting;
- lint;
- TypeScript typecheck across the multi-level workspace dependency chain;
- Vitest;
- build;
- format check.

The push-triggered bootstrap then committed canonical formatting and the authoritative updated `pnpm-lock.yaml` as commit:

```text
0b252f64c30296332244e4c43c48126af53dedc0
```

## Normative documentation

- `docs/WTF_IR_V2.md`
- `docs/adr/ADR-0003-source-graph-render-tree-and-ir-boundaries.md`
- `packages/w2f-ir`

## Definition of Done

- [x] shared `@w2f/w2f-ir` package created
- [x] Source Graph defined
- [x] Render Tree defined
- [x] Source→Render mapping defined
- [x] layout/sizing IR defined
- [x] authored/computed CSS semantic model defined
- [x] paint IR defined
- [x] text/font/line-fragment IR defined
- [x] asset IR defined
- [x] environment/state IR defined
- [x] responsive/media/container-query IR defined
- [x] diagnostics IR defined
- [x] V2.1 protocol reservations integrated
- [x] deterministic IR envelope/codec implemented
- [x] roundtrip tests implemented
- [x] migration-gate tests implemented
- [x] cross-reference/runtime validation implemented
- [x] Browser consumes shared IR
- [x] Figma consumes shared IR
- [x] multi-level workspace typecheck task graph corrected
- [x] authoritative lockfile/formatting bootstrap completed
- [ ] standard read-only frozen-lockfile CI restored
- [ ] final frozen-lockfile CI passes on completed NODE-03 head

## Exit rule

NODE-03 becomes DONE only after the temporary bootstrap workflow is removed, standard `pnpm install --frozen-lockfile` CI is restored, and the complete branch passes all formal quality gates.

## Next

After completion proceed to:

```text
NODE-04 — Stable Identity & Source Mapping
```

NODE-04 implements stable-node identity generation, confidence/evidence, document/capture identity behavior and deterministic source mapping on top of the IR hooks frozen here.
