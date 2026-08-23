# NODE-10 — Text / Inline / Pseudo Capture

## Status

**IN PROGRESS — implementation, behavior fixtures and controlled final-shape `pnpm check` passed; final standard read-only frozen-lockfile docs/status Exit Gate pending**

## Goal

Extend the shared adapter-neutral capture evidence model so Standard and CDP captures preserve the browser evidence needed for text, inline fragmentation, pseudo generated content and safe form-control visual reconstruction without starting NODE-11 authored CSS cascade work.

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

### Text run contract

Text runs preserve:

- text offsets and exact text slice;
- font family/style/weight/stretch;
- font variation/feature settings;
- font size;
- line height;
- letter spacing;
- color;
- text decoration;
- direction.

The shared validator rejects inconsistent offsets or run text.

### Text fragment contract

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

Confidence is constrained to `[0, 1]`.

### Standard text capture

Standard capture uses browser-native DOM `Range.getClientRects()` evidence to derive line fragments.

The implementation:

- samples code points;
- preserves UTF-16 text offsets;
- ignores zero-size rects;
- supports horizontal and vertical/sideways writing-mode grouping;
- preserves browser JS numeric precision;
- caps fragment measurement at the first 4096 UTF-16 code units per text node.

### Standard baseline evidence

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

The fallback remains explicitly labeled as an estimate.

### CDP text capture

The CDP computed-style request was extended with the NODE-10 text/inline/pseudo/form visual property set while preserving the NODE-09 visibility properties.

CDP normalization:

- preserves repeated DOMSnapshot layout entries for a node;
- derives fragment geometry from client rects/bounds;
- aligns `layout.text` evidence to the captured text value where possible;
- records inline fragment bounds;
- records baseline estimates as:

```text
baselineSource: cdp-layout-estimate
baselineConfidence: 0.7
```

### Inline/ruby evidence

Standard and CDP both emit shared `RawInlineEvidence` for computed display values beginning with `inline` or `ruby`.

Evidence includes:

- display;
- writing mode;
- optional vertical align;
- all observed fragment bounds.

### Pseudo capture

Standard capture probes:

```text
::before
::after
::marker
```

Pseudo nodes retain explicit source/composed host relationships.

Quoted generated content is decoded as text; non-empty content that cannot be safely represented as plain text is retained as `complex` instead of guessed.

CDP normalization consumes DOMSnapshot pseudo-type evidence plus computed `content` and rendered layout text.

### Form visual privacy boundary

NODE-10 captures visual/control state such as:

- disabled;
- read-only;
- required;
- checked;
- indeterminate where Standard APIs expose it;
- multiple;
- placeholder;
- appearance;
- accent color.

It does not capture live input/textarea textual values.

The shared contract records:

```text
textValueCapture: omitted-sensitive
```

when textual value evidence is intentionally excluded.

CDP `inputValue` / `textValue` runtime fields remain outside the evidence contract. `INPUT`/`TEXTAREA` source `value` attributes are filtered. Cookie/local/session storage boundaries remain unchanged.

### Region semantics preserved

NODE-10 preserves the established rules:

- fully covered `exclude` nodes are removed;
- `redact` masks intersecting protected evidence;
- structural ancestor closure is retained;
- `exclude` and `redact` are not conflated.

### Dependency-free NODE-10 validator

Added:

```text
scripts/validate-node-10.mjs
```

It freezes the durable NODE-10 contract and privacy boundary while avoiding false positives on ordinary local variable names such as `textValue`.

Historical NODE-09 privacy validation was narrowed to prohibited CDP evidence-field access rather than banning unrelated identifier text.

### Behavior fixture coverage

The CDP normalizer fixture now exercises actual NODE-10 output, including:

- one text run for `hello`;
- two rendered fragments with `[0,2]` and `[2,5]` ranges;
- `cdp-layout-estimate` baseline provenance/confidence;
- inline fragment evidence;
- `::before` pseudo generated text;
- checkbox checked state;
- filtering of a sensitive `value` attribute;
- absence of CDP `inputValue` / `textValue` runtime evidence fields.

This avoids relying only on source-string validators for NODE-10 behavior.

## Controlled implementation findings

Real GitHub Runner validation exposed and resolved:

- the original bootstrap YAML being malformed by nested JavaScript template-string escaping;
- template-payload escaping of backticks and `${...}`;
- Standard pseudo-content CSS newline decoding;
- `exactOptionalPropertyTypes` non-null pseudo evidence typing;
- a missing dependency-free NODE-10 foundation validator;
- historical NODE-09 privacy assertions that were too broad and matched ordinary local `textValue` identifiers;
- a historical CDP computed-style test that pinned the NODE-09 seven-property list instead of requiring backward-compatible inclusion;
- the same over-broad privacy assertion in Browser package validation;
- a behavior-fixture variable-name typo;
- canonical Prettier formatting of the final behavior fixture.

All temporary write-enabled bootstrap/recovery workflows were removed before the standard Exit Gate phase.

A one-time formatting workflow was later used only to obtain pinned Prettier 3.9.6 output. It removed itself from the final working tree before running the complete repository check and its resulting commit contains no write-enabled workflow.

## Validation history

Controlled final-shape full repository validation:

```text
32615130105
```

The workflow removed its own temporary file from the working tree before running:

```text
pnpm check
```

and passed:

- NODE-08/NODE-09/NODE-10/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- frozen-lockfile installation;
- ESLint;
- TypeScript 6.0.3 strict typecheck;
- complete Vitest suite;
- Standard Browser package build/validation;
- High Fidelity Browser package build/validation;
- pinned Prettier 3.9.6 format check.

The resulting implementation/behavior head before normative documentation was:

```text
bc81da6ed366180cd7345e38f8cd95a8c0acd629
```

GitHub did not start a normal job for that bot-authored push and marked the empty run `action_required`; it is not counted as a formal Exit Gate.

The final formal standard read-only frozen-lockfile docs/status Exit Gate remains pending and must validate the complete NODE-10 documentation/status head.

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
- [ ] final standard read-only frozen-lockfile docs/status CI passed
- [ ] PR #14 ready for review
- [ ] PR #14 squash merged

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

After PR #14 squash merge:

```text
NODE-11 — CSS Cascade & Authored Semantics
```
