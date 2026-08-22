# W2F Semantic IR V2

**Status:** FROZEN FOR IMPLEMENTATION  
**IR version:** `2.0.0`  
**Portable format dependency:** `.wtf` V2 / `@w2f/w2f-schema`  
**Implementation package:** `@w2f/w2f-ir`

## 1. Purpose

W2F IR is the normalized semantic rendering representation between browser-specific capture and Figma-specific reconstruction.

The IR is intentionally not Chromium DOMSnapshot output and not a Figma scene description. It is the platform-neutral contract that lets later capture, analysis, optimization and renderer nodes evolve independently.

```text
Browser source
    ↓
Standard / CDP adapter
    ↓
normalized capture evidence
    ↓
W2F Source Graph
    ↓
semantic/layout analysis
    ↓
W2F Render Tree
    ↓
.wtf V2
    ↓
Figma capability resolution
    ↓
Figma scene
```

## 2. Non-goals

NODE-03 does not implement:

- stable identity generation — NODE-04;
- browser capture — NODE-05 onward;
- CSS cascade extraction — NODE-11;
- asset fetching — NODE-13;
- responsive inference — NODE-16;
- layout inference algorithms — NODE-17/18;
- Render Tree optimization — NODE-19;
- archive packaging — NODE-21;
- Figma rendering — NODE-24 onward.

NODE-03 defines the data those engines exchange and the invariants they must satisfy.

## 3. Source Graph and Render Tree are different products

### Source Graph

Source Graph preserves provenance and browser/source relationships.

A Source Node may represent:

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

Each Source Node owns a per-capture `captureNodeId` and may later receive a `stableIdentity` from NODE-04.

It can preserve:

- source/composed relationships;
- source selector and semantic role;
- authored attributes;
- pseudo type;
- text content;
- exact browser geometry;
- style and asset references;
- structural fingerprint;
- node revision hashes.

### Render Tree

Render Tree is the optimized, reconstructable hierarchy used by rendering policy.

Render Nodes may be semantic sections, containers, text, images, vectors, tables/cells, controls, decorations or fallback regions.

Every Render Node must map back to one or more Source Nodes:

```ts
sourceNodeIds: string[]
```

A Render Node may represent multiple collapsed source wrappers. This is the mechanism that allows useful Figma layers without losing source provenance.

### Parent relationships

V2.1 distinguishes:

```text
sourceParentId
composedParentId
renderParentId
```

These are not interchangeable.

- source parent follows source/DOM ownership;
- composed parent represents browser flattening, including slots/shadow composition;
- render parent represents the optimized reconstruction hierarchy.

The Render Tree also has explicit `parentId` / `childIds` relationships for deterministic traversal.

## 4. Stable and revision identity hooks

The IR reserves:

```text
captureNodeId
stableIdentity.id
stableIdentity.confidence
stableIdentity.evidence[]
```

and document/capture/revision identity:

```text
documentId
captureId
revisionId
sourceFingerprint
parentRevisionId?
```

Per-node revision hashes may include:

```text
contentHash
geometryHash
layoutHash
paintHash
assetHash
hierarchyHash
```

NODE-03 stores these values but does not invent their algorithms.

## 5. Geometry is source evidence

The authoritative geometry model uses finite IEEE-754 doubles.

Capture-time rounding is forbidden.

Primary geometry fields include:

- `bounds`;
- content/padding/border boxes;
- margin extents;
- transform matrix and origin;
- clipping bounds;
- containing block;
- scroll container;
- paint order;
- z-index.

The main CSS box convention is browser **border box**.

Values such as:

```text
64.33333333333333
143.3333282470703
```

must survive IR encoding and decoding unchanged.

Renderer-side quantization, when a target API requires it, is a downstream policy and must not mutate the captured source evidence.

## 6. CSS lengths preserve semantics and resolved truth

IR does not flatten every CSS length to pixels.

`WtfCssLengthSemantic` supports:

```text
px
percent
em
rem
vw / vh / vmin / vmax
keyword
expression
```

Expressions preserve authored forms such as:

```text
calc()
min()
max()
clamp()
fit-content()
minmax()
```

A length may additionally contain `resolvedPx`.

Therefore W2F can keep both:

```text
authored semantic intent
+
browser resolved geometry
```

without pretending an inferred value was authored CSS.

## 7. Style evidence

A style record is a collection of declarations.

Each declaration can preserve:

```text
property
computedValue
authoredValue?
important?
inherited?
source stylesheet / selector / rule / inline evidence
```

Custom properties and a future cascade hash are reserved.

The Token Graph remains a separate V2.1 graph supplied by `@w2f/w2f-schema`, allowing `var(--token)` relations to survive even when the render value is already resolved.

## 8. Layout model

Layout is explicit IR rather than implicit renderer guesswork.

Supported layout mode vocabulary includes:

```text
none
flow
flex
grid
absolute
table
inline
contents
unknown
```

The model can preserve:

- display and position;
- width/height sizing decisions;
- min/max sizing;
- padding;
- effective row/column gaps;
- overflow;
- flex container/item semantics;
- grid tracks and grid item placement;
- absolute constraints.

### Sizing semantics

Sizing vocabulary:

```text
fill
hug
fixed
intrinsic
content
unknown
```

Sizing and layout decisions carry:

```text
confidence
reasons[]
sourceRefs?
```

A later inference engine must explain why it chose FILL/HUG/FIXED rather than storing a bare enum with no evidence.

## 9. Paint model

Paint IR can preserve:

- solid fills;
- linear/radial/conic gradients;
- image fills;
- border sides and corner radii;
- shadows;
- opacity;
- blend mode;
- isolation;
- filter/backdrop-filter;
- mask image;
- clip path.

Recognition does not imply native Figma support. Capability resolution and fallback decisions are downstream.

## 10. Text model

Text IR preserves semantic text and browser line evidence together.

A Render Text model includes:

```text
value
runs[]
fragments[]
white-space
word-break
overflow-wrap
text-align
direction
editableStrategyHint
```

Text runs can preserve:

- range offsets;
- exact substring;
- font family/style/weight/stretch;
- variation settings;
- feature settings;
- PostScript/source/fingerprint metadata;
- font size and line height;
- letter spacing;
- color/decoration;
- baseline shift;
- direction.

Line fragments preserve browser bounds and baseline. This supports later Editable / Balanced / Pixel strategies without forcing the capture layer to choose one permanently.

## 11. Asset model

Asset records may represent:

```text
image
svg
font-metadata
canvas-raster
video-frame
fallback-raster
pixel-reference
```

The model can preserve:

- media type;
- SHA-256;
- embedded path;
- byte length;
- intrinsic/render dimensions;
- `currentSrc` and authored source;
- resource provenance.

Asset retrieval, deduplication and fallback are later-node responsibilities.

## 12. Environment and state

Capture Environment preserves rendering inputs such as:

```text
browser name/version
platform
language
direction
color scheme
reduced motion
viewport width/height
DPR
page zoom
CSS zoom reservation
```

State payloads reserve current visual state plus pseudo-state and theme metadata.

Animation capture mode is explicit:

```text
freeze-current
reset-initial
```

This supports deterministic benchmark captures without requiring NODE-03 to control browser animation execution.

## 13. Responsive evidence

Responsive IR contains:

- snapshot references;
- inferred responsive rules;
- media rule traces;
- container-query information.

Rules target `stableNodeId`, not one capture-local node ID.

Each rule contains ranges and decision evidence. A range records the snapshots supporting that conclusion.

Structural breakpoint behavior may be preserved and reported even when a first-generation Figma renderer cannot reproduce it dynamically.

## 14. Scroll roots and composed tree

The IR integrates V2.1 `ScrollContainerInfo`, including nested scroll roots and primary application scroll-root classification.

This lets later capture distinguish:

```text
browser document
vs
actual application scroll root
```

Composed-tree information preserves slots and Shadow DOM relationships so renderer analysis is based on the browser-visible tree without discarding source ownership.

## 15. Structural fingerprints

A source or component candidate may carry:

```text
semanticHash
layoutHash
paintHash?
combinedHash
confidence
```

Fingerprint identity is not node identity. It describes repeated structure/component patterns and is reserved for future component candidate analysis.

## 16. Diagnostics are first-class IR

Diagnostics use stable domains:

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

and severities:

```text
info
warning
error
fatal
```

A diagnostic can reference Source Nodes, Render Nodes, evidence and structured metadata.

Render Nodes may reference diagnostic IDs. Important downgrade/fallback decisions must therefore remain inspectable.

## 17. Deterministic envelope and codec

The canonical envelope is:

```ts
{
  irVersion: "2.0.0",
  bundle: {
    document,
    sourceGraph,
    renderTree,
    styles,
    assets,
    responsive,
    states,
    diagnostics,
    tokens
  }
}
```

Encoding uses the deterministic canonical JSON primitive from `@w2f/w2f-schema`.

Roundtrip requirement:

```text
valid IR
→ encode
→ decode
→ same semantic envelope
→ encode again
→ byte-identical canonical JSON
```

## 18. Migration gate

NODE-03 recognizes the historical internal flat V2 draft envelope:

```text
{ irVersion, document, sourceGraph, ... }
```

and migrates it into the canonical nested envelope.

Unknown IR versions are rejected rather than silently coerced.

This is an IR migration boundary, not the full `.wtf` package migration engine. Secure file migration remains owned by NODE-23.

## 19. Structural validation invariants

`validateWtfIrBundle` enforces cross-payload consistency, including:

- unique Source Node and Render Node IDs;
- source/render trees are acyclic and fully reachable;
- Render Nodes map to existing Source Nodes;
- relationship references exist;
- style/asset references exist;
- environment/state/snapshot references exist;
- responsive rules target known stable identities;
- diagnostic references exist;
- canonical asset hashes;
- token graph reference integrity;
- document/root/revision identity agreement;
- confidence values remain within `0..1`;
- geometry is finite.

Validation is intentionally stricter than TypeScript structural typing because `.wtf` input eventually arrives from an untrusted file boundary.

## 20. Browser and Figma share the same IR

Both executable apps depend on:

```text
@w2f/w2f-ir: workspace:*
```

and expose the same `WTF_IR_VERSION` in tests.

There is no Browser-specific IR copy and no Figma-specific IR copy.

## 21. Monorepo typecheck dependency rule

Workspace consumers resolve package declaration output from `dist`.

Therefore Turborepo `typecheck` must build upstream workspace dependencies before typechecking consumers:

```text
^build
+
^typecheck
```

This rule becomes important once the dependency chain is deeper than one shared package:

```text
Browser / Figma
    ↓
w2f-ir
    ↓
w2f-schema
```

## 22. Ownership boundaries after NODE-03

The following are now frozen protocol vocabulary, not algorithms:

```text
identity fields
source/render relationship fields
geometry types
layout/sizing vocabulary
paint types
text evidence
asset records
responsive/state/environment records
diagnostic format
IR envelope/version
```

Later nodes may add algorithmic producers and consumers while preserving compatibility. Breaking changes require an explicit schema/IR compatibility decision rather than an incidental code edit.
