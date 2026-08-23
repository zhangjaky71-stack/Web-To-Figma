# ADR-0010 — Text / Inline / Pseudo Evidence and Privacy Boundary

## Status

Accepted for NODE-10.

## Context

NODE-08 established an adapter-neutral `RawSnapshot 1.0.0` and the least-privilege Standard DOM capture path. NODE-09 added a CDP High Fidelity adapter without introducing a second downstream capture model.

The V2/V2.1 pipeline still requires richer browser evidence for text reconstruction: text runs, line fragments, baseline position, inline fragmentation, pseudo generated content and form-control visual state.

Two risks must be avoided:

1. treating estimated baseline/fragment evidence as if it were exact browser-native telemetry;
2. collecting live user-entered input/textarea values merely because browser APIs or CDP can expose them.

A third risk is architectural divergence if Standard and CDP encode text/pseudo information differently enough to require separate downstream pipelines.

## Decision

### 1. Keep RawSnapshot at version 1.0.0

NODE-10 adds optional evidence to the existing adapter-neutral `RawNode` model:

```text
text
inline
pseudo
formVisual
```

No NODE-10-specific snapshot version or CDP-only text IR is introduced.

### 2. Represent text as ranges plus fragments

Text evidence separates:

- logical text/range style evidence in `runs[]`;
- rendered line/fragment geometry in `fragments[]`.

Offsets reference the captured text value and must remain internally consistent.

This separation keeps typography evidence editable/semantic while preserving observed browser fragmentation.

### 3. Baseline evidence must carry provenance and confidence

Every text fragment baseline records:

```text
baseline
baselineSource
baselineConfidence
```

Allowed provenance is:

```text
font-metrics
line-box-estimate
cdp-layout-estimate
```

Standard canvas font metrics use confidence `0.9`. Standard line-box fallback uses `0.55`. CDP layout-derived baseline estimation uses `0.7`.

The source label is mandatory so downstream stages can distinguish stronger observations from reconstruction estimates.

### 4. Standard capture uses native DOM geometry first

Standard text fragmentation is derived from DOM `Range.getClientRects()` in document CSS-pixel coordinates.

Inline evidence uses element client rects. Pseudo evidence uses pseudo `getComputedStyle`.

NODE-10 does not replace native evidence with heuristic layout when browser geometry is directly available.

### 5. CDP preserves repeated layout evidence instead of collapsing it

The CDP normalizer preserves all DOMSnapshot layout/client-rect entries associated with a node and uses layout text evidence to align rendered fragments with captured text.

CDP-only richness still maps into the same shared RawSnapshot evidence types used by Standard capture.

### 6. Pseudo elements are explicit captured nodes

`::before`, `::after` and `::marker` evidence is represented with:

```text
kind: pseudo
source.pseudoType
pseudo
```

Generated plain text is preserved when safely available. Complex `content` is retained as complex evidence rather than guessed into a plain-text value.

Pseudo nodes retain explicit host relationships instead of flattening generated content into the host text.

### 7. Form capture is visual-state-only

NODE-10 may record visual state such as:

- disabled/read-only/required;
- checked/indeterminate;
- multiple;
- placeholder;
- appearance/accent color.

It must not collect live textual values from inputs or textareas.

The contract makes omission explicit with:

```text
textValueCapture: omitted-sensitive
```

CDP runtime-value fields such as `inputValue` and `textValue` are outside the evidence contract. Sensitive `value` attributes on `INPUT`/`TEXTAREA` are filtered.

Cookies and Web Storage remain outside capture.

### 8. Preserve Region/Redact/Exclude semantics

NODE-10 text/inline/pseudo/form evidence cannot bypass the masking/removal rules already established by NODE-07 and preserved by NODE-09.

`exclude` and `redact` remain separate operations.

### 9. NODE-11 owns authored CSS semantics

NODE-10 captures computed visual evidence only. It does not attempt to reconstruct authored selector precedence, custom-property dependency graphs, media rules or container-query semantics.

Those remain the responsibility of NODE-11 and NODE-12.

## Consequences

### Positive

- Standard and CDP remain interchangeable upstream adapters for one downstream pipeline.
- Text geometry and typography evidence become explicit and inspectable.
- Baseline quality is machine-readable rather than implied.
- Pseudo generated content is structurally representable.
- Inline fragmentation is retained without flattening to one box.
- Form visuals can be reconstructed without capturing arbitrary user-entered text.
- Future authored-cascade work can build on computed evidence without being conflated with it.

### Trade-offs

- Standard text fragment measurement uses a bounded per-text-node Range sampling budget.
- Baseline evidence is not equally strong across all capture paths.
- CDP baseline remains an estimate because DOMSnapshot does not expose a direct text baseline field used by this implementation.
- Complex pseudo `content` remains complex evidence until later reconstruction stages decide how to handle it.
- Form controls intentionally omit some state that might improve pixel reproduction if obtaining it would cross the privacy boundary.

## Rejected alternatives

### Store only one text bounding box

Rejected because it loses line wrapping and inline fragmentation evidence required for accurate reconstruction.

### Treat every baseline estimate as exact

Rejected because it hides uncertainty and conflicts with the V2/V2.1 inspectability requirement.

### Create separate Standard and CDP text schemas

Rejected because it duplicates downstream logic and violates the adapter-neutral RawSnapshot boundary.

### Flatten pseudo text into the host node

Rejected because pseudo generated content has distinct source/paint/layout semantics and must remain structurally inspectable.

### Capture live input and textarea values for fidelity

Rejected because arbitrary user-entered text is sensitive runtime data and is not required for NODE-10's visual-state contract.

### Implement authored cascade in NODE-10

Rejected because the roadmap assigns authored CSS semantics to NODE-11 and mixing the two would blur evidence acquisition with cascade reconstruction.

## Validation

The decision is enforced by:

- shared `RawSnapshot` runtime validation;
- Standard capture tests and privacy tests;
- CDP normalization behavior fixtures;
- `scripts/validate-node-10.mjs`;
- historical NODE-09 privacy validators narrowed to actual CDP evidence-field access;
- Standard and High Fidelity Browser package validation;
- complete frozen-lockfile CI.
