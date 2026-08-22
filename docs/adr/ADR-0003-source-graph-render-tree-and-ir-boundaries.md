# ADR-0003 — Source Graph, Render Tree, and Semantic IR Boundaries

**Status:** Accepted  
**Date:** 2026-08-22  
**Owners:** NODE-03 — W2F IR V2

## Context

A direct DOM-to-Figma model creates two incompatible pressures:

1. source fidelity wants DOM, Shadow DOM, slots, pseudo nodes, authored CSS evidence and stable provenance preserved;
2. design reconstruction wants a simpler hierarchy with meaningful sections, fewer anonymous wrappers and explicit render/layout decisions.

Using one tree for both goals either destroys source evidence or produces unusable Figma layers.

The system also needs a browser-independent contract. Chromium CDP/DOMSnapshot structures cannot become the long-lived portable format because Standard Capture, local/offline providers and future non-Chromium adapters must converge on the same semantics.

## Decision

### 1. W2F uses a dual-tree architecture

The IR contains both:

```text
Source Graph
Render Tree
```

Source Graph preserves provenance and source/composed relationships.

Render Tree represents the optimized hierarchy intended for reconstruction.

### 2. Render Nodes retain explicit Source mapping

Every Render Node must map to at least one Source Node:

```ts
sourceNodeIds: string[]
```

A Render Node may map to multiple Source Nodes when meaningless wrappers are safely collapsed.

### 3. Source, composed and render parentage are distinct

V2.1 relationships remain separately representable:

```text
sourceParentId
composedParentId
renderParentId
```

The implementation must not infer that one relationship can substitute for another.

### 4. Browser-specific raw formats stop before Semantic IR

CDP DOMSnapshot and other platform-native raw structures are adapter inputs only.

```text
platform raw capture
→ adapter/normalizer
→ W2F IR
```

No renderer may require the raw Chrome representation.

### 5. Geometry stores browser precision

Source evidence uses finite IEEE-754 doubles. Capture-time integer rounding is forbidden.

### 6. Authored semantics and resolved truth coexist

IR may preserve authored CSS values plus computed/resolved values. It must not fabricate authored values from geometry inference.

Semantic lengths therefore retain units/expressions and may also carry resolved pixels.

### 7. Layout decisions are explainable

Sizing/layout/render decisions carry:

```text
confidence
reasons[]
source evidence
```

This allows diagnostics, QA and future algorithm changes to explain why a node became FILL/HUG/FIXED, native, emulated or raster.

### 8. Text keeps semantic runs plus browser fragments

The IR stores editable text semantics and browser line-fragment/baseline evidence together. Renderer strategy is deferred.

### 9. Diagnostics are part of the IR

Warnings, downgrades and fallback reasons are not transient logs. They are structured data linked to source/render nodes.

### 10. The IR has its own version boundary

The canonical NODE-03 envelope is:

```text
irVersion = 2.0.0
bundle = document/sourceGraph/renderTree/styles/assets/responsive/states/diagnostics/tokens
```

Unknown IR versions fail closed.

A narrow migration gate may recognize known historical internal draft shapes; full `.wtf` package migration belongs to NODE-23.

### 11. Browser and Figma consume one workspace IR package

The shared contract lives in:

```text
packages/w2f-ir
```

Browser Extension and Figma Plugin must not duplicate these types.

### 12. Typecheck builds upstream workspace declarations

Because workspace packages publish declaration output from `dist`, Turborepo `typecheck` depends on both upstream `^build` and `^typecheck` before a consumer is checked.

## Consequences

### Positive

- Figma hierarchy can become simpler without losing DOM/source provenance.
- Capture adapters and renderer APIs remain isolated from each other.
- Responsive/stable-identity/revision engines have explicit places to attach evidence.
- Browser geometry and authored CSS semantics can coexist without one erasing the other.
- QA can compare structural as well as visual outcomes.
- The IR can be serialized and roundtripped deterministically.

### Trade-offs

- The data model is larger than a single DOM-like tree.
- Cross-payload validation is required to prevent dangling references.
- Some fields are populated only by later NODEs; NODE-03 defines vocabulary before algorithms exist.
- Maintaining source/render mapping adds implementation cost to optimizer and renderer stages.

## Rejected alternatives

### Direct DOM tree as the Figma tree

Rejected because it preserves too many meaningless wrappers and couples source structure to design-layer usability.

### Render Tree only

Rejected because wrapper elimination and semantic simplification would destroy source traceability and future incremental-update evidence.

### CDP DOMSnapshot as the portable IR

Rejected because it is Chromium-specific and would leak platform implementation details into every downstream package.

### Pixel-only geometry with no authored semantics

Rejected because responsive and sizing inference need `%`, viewport units, flex/grid evidence and original expressions.

### Authored CSS only with no resolved geometry

Rejected because browser-resolved box/line geometry remains the visual ground truth.

### Bare layout enums with no confidence/reasons

Rejected because W2F requires inspectable decisions and downstream QA needs evidence for downgrades/fallbacks.

## Implementation references

- `docs/WTF_IR_V2.md`
- `packages/w2f-ir/src/types.ts`
- `packages/w2f-ir/src/validation.ts`
- `packages/w2f-ir/src/codec.ts`
- `packages/w2f-ir/test/`
