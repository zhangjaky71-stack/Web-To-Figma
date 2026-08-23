# NODE-10 — Text / Inline / Pseudo Capture

## Status

**DONE / PASS — implementation, behavior fixtures and final exact-head standard read-only frozen-lockfile CI passed; PR #14 squash merged**

## Goal

Extend the shared adapter-neutral capture evidence model so Standard and CDP captures preserve browser evidence for text, inline fragmentation, pseudo generated content and safe form-control visual reconstruction without pulling NODE-11 authored CSS cascade work forward.

## Delivered

### Shared RawSnapshot evidence

`@w2f/capture-core` keeps:

```text
RawSnapshot 1.0.0
```

and adds optional node evidence for:

- text runs;
- text fragments;
- baseline provenance/confidence;
- inline/ruby fragments;
- pseudo evidence;
- safe form visual state.

No second Standard/CDP text model was created.

### Text run and fragment contract

Text runs preserve text offsets/slices, font family/style/weight/stretch, variation/feature settings, font size, line height, letter spacing, color, decoration and direction.

Fragments preserve:

- text range;
- document-CSS-pixel bounds;
- baseline;
- baseline source;
- baseline confidence;
- line index.

Allowed baseline sources:

```text
font-metrics
line-box-estimate
cdp-layout-estimate
```

Confidence is constrained to `[0, 1]`. The shared validator rejects inconsistent offsets, mismatched run text and malformed fragment evidence.

### Standard text capture

Standard capture uses browser-native DOM `Range.getClientRects()` evidence.

It:

- samples code points while preserving UTF-16 offsets;
- ignores zero-size rects;
- groups horizontal and vertical/sideways writing fragments;
- preserves browser JS numeric precision;
- caps detailed fragment measurement at the first 4096 UTF-16 code units per text node.

Standard capture first uses canvas `measureText("Hg")` font metrics:

```text
baselineSource: font-metrics
baselineConfidence: 0.9
```

If usable ascent/descent metrics are unavailable it records:

```text
baselineSource: line-box-estimate
baselineConfidence: 0.55
```

The fallback is explicitly labeled as an estimate.

### CDP text capture

The CDP computed-style request was extended with NODE-10 text/inline/pseudo/form visual properties while preserving NODE-09 visibility/layout properties.

CDP normalization:

- preserves repeated DOMSnapshot layout entries for a node;
- derives fragment geometry from client rects/bounds;
- aligns `layout.text` evidence to captured text where possible;
- records inline fragment bounds;
- records baseline estimates as:

```text
baselineSource: cdp-layout-estimate
baselineConfidence: 0.7
```

### Inline/ruby evidence

Standard and CDP both emit shared `RawInlineEvidence` for computed display values beginning with `inline` or `ruby`.

Evidence includes display, writing mode, optional vertical align and all observed fragment bounds.

### Pseudo capture

Standard capture probes:

```text
::before
::after
::marker
```

Pseudo nodes retain explicit host relationships. Quoted generated content is decoded as text; non-empty content that cannot be safely represented as plain text remains `complex` rather than being guessed.

CDP normalization consumes DOMSnapshot pseudo-type evidence plus computed `content` and rendered layout text.

### Form visual privacy boundary

NODE-10 captures visual/control state such as disabled, read-only, required, checked, Standard `indeterminate`, multiple, placeholder, appearance and accent color.

It does not capture live input/textarea textual values.

The shared contract records intentional omission with:

```text
textValueCapture: omitted-sensitive
```

CDP `inputValue` / `textValue` runtime fields remain outside the evidence contract. `INPUT`/`TEXTAREA` source `value` attributes are filtered. Cookie/local/session storage boundaries remain unchanged.

### Region semantics preserved

NODE-10 preserves the established rules:

- fully covered `exclude` nodes are removed;
- `redact` masks intersecting protected evidence;
- structural ancestor closure is retained;
- `exclude` and `redact` remain distinct.

### Dependency-free NODE-10 validator

Added:

```text
scripts/validate-node-10.mjs
```

It freezes the durable NODE-10 evidence/privacy contract. Historical NODE-09 privacy checks were narrowed to actual prohibited CDP evidence-field access instead of matching unrelated local identifiers such as `textValue`.

### Behavior fixture coverage

The CDP normalizer fixture exercises actual NODE-10 output:

- one `hello` text run;
- two rendered fragments with `[0,2]` and `[2,5]` ranges;
- `cdp-layout-estimate` baseline provenance/confidence;
- inline fragment evidence;
- `::before` generated text;
- checkbox checked state;
- filtering of a sensitive `value` attribute;
- absence of CDP `inputValue` / `textValue` runtime evidence fields.

This prevents NODE-10 from relying only on source-string validators.

## Controlled implementation findings

Real GitHub Runner validation exposed and resolved:

- malformed bootstrap YAML from nested JavaScript template-string escaping;
- payload escaping of backticks and `${...}`;
- Standard pseudo CSS newline decoding;
- `exactOptionalPropertyTypes` non-null pseudo typing;
- missing dependency-free NODE-10 foundation validation;
- over-broad historical NODE-09 privacy assertions;
- a historical test that pinned exactly seven NODE-09 computed-style properties;
- the same over-broad privacy assertion in Browser package validation;
- a behavior-fixture variable-name typo;
- canonical Prettier formatting of the final behavior fixture.

All temporary bootstrap/recovery write-enabled workflows were removed.

A later one-time formatting workflow was used only to obtain pinned Prettier 3.9.6 output. It removed itself from the final working tree before running the complete repository check, and the resulting branch contains no write-enabled workflow.

## Formal Exit Gates

Controlled final-shape full repository validation:

```text
32615130105
```

Before `pnpm check`, the one-time format workflow removed itself from the working tree. The complete check passed.

Formal standard read-only frozen-lockfile documentation/status Exit Gate:

```text
32615395336
```

validated head:

```text
3a3a89b005b6e919074614bb52ea0393cff8e186
```

Final exact-head standard read-only frozen-lockfile CI:

```text
32615506313
```

validated NODE-10 head:

```text
f82711f5959505a82c72f6afc91bde7cce5c1b60
```

Every final gate passed:

- dependency-free NODE-08/NODE-09/NODE-10/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint across all workspaces;
- TypeScript 6.0.3 strict typecheck;
- complete Vitest suite including NODE-10 CDP behavior fixture;
- Standard Browser package build/validation;
- High Fidelity Browser package build/validation;
- pinned Prettier 3.9.6 format check.

PR #14 was squash merged into `main` as:

```text
eb31c82bbbaaf15f740aa19f7d343f8a2d884099
```

## Definition of Done

- [x] shared text-run evidence
- [x] shared text-fragment evidence
- [x] baseline provenance and confidence
- [x] shared inline/ruby fragment evidence
- [x] shared pseudo evidence
- [x] shared safe form visual evidence
- [x] RawSnapshot remains adapter-neutral and version `1.0.0`
- [x] Standard DOM Range fragment capture
- [x] Standard font-metrics baseline evidence
- [x] Standard line-box fallback baseline evidence
- [x] Standard `::before` capture
- [x] Standard `::after` capture
- [x] Standard `::marker` capture
- [x] CDP text computed-style evidence
- [x] CDP repeated layout-fragment preservation
- [x] CDP baseline estimate provenance/confidence
- [x] CDP pseudo normalization
- [x] checkbox/radio visual state without textual runtime values
- [x] input/textarea runtime textual values excluded
- [x] sensitive `value` attributes filtered
- [x] Region/Redact/Exclude semantics preserved
- [x] dependency-free NODE-10 validator
- [x] actual CDP NODE-10 behavior fixture
- [x] Standard/High Fidelity Browser package validation
- [x] temporary write-enabled bootstrap/recovery workflows removed
- [x] pinned canonical formatting obtained and temporary format workflow removed
- [x] normative implementation document added
- [x] ADR added
- [x] formal standard read-only frozen-lockfile docs/status CI passed
- [x] final exact-head standard read-only frozen-lockfile CI passed
- [x] PR #14 ready for review
- [x] PR #14 squash merged

## Normative documents

- `docs/TEXT_INLINE_PSEUDO_CAPTURE_V2.md`;
- `docs/adr/ADR-0010-text-inline-pseudo-evidence-and-privacy-boundary.md`;
- this node record.

## Explicit non-goals

NODE-10 does not implement:

- NODE-11 authored CSS cascade and selector provenance;
- NODE-11 CSS custom-property dependency semantics;
- NODE-12 media/container/environment authored semantics;
- asset localization;
- Pixel Ground Truth/raster tiling;
- responsive multi-viewport inference;
- Figma rendering.

## Next

Proceed to:

```text
NODE-11 — CSS Cascade & Authored Semantics
```
