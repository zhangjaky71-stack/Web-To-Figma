# Text / Inline / Pseudo Capture V2

## Status

Normative implementation contract for NODE-10 against the frozen V2/V2.1 architecture baseline.

This document extends the adapter-neutral `RawSnapshot 1.0.0` evidence contract established by NODE-08 and NODE-09. It does not introduce a new snapshot version or a second Standard/CDP document model.

## Scope

NODE-10 captures browser-observed evidence needed to reconstruct:

- text runs;
- line/fragment geometry;
- baseline position with provenance and confidence;
- inline/ruby fragment geometry;
- `::before`, `::after` and `::marker` pseudo evidence;
- safe form-control visual state.

NODE-10 preserves the existing Region/Redact/Exclude and privacy boundaries.

NODE-11 authored CSS cascade, custom-property resolution, selector provenance and media/container semantics are explicitly out of scope.

## Shared RawSnapshot contract

`RAW_SNAPSHOT_VERSION` remains:

```text
1.0.0
```

The following evidence is optional on `RawNode` so Standard and CDP captures can contribute the evidence they actually observe without fabricating missing data:

```text
text
inline
pseudo
formVisual
```

Pseudo nodes use:

```text
kind: "pseudo"
source.pseudoType
pseudo.type
```

When both `source.pseudoType` and `pseudo.type` exist, they must match.

When both `textContent` and `text.value` exist, they must match.

## Text run evidence

`RawTextEvidence` contains:

```text
value
runs[]
fragments[]
whiteSpace?
wordBreak?
overflowWrap?
textAlign?
direction?
writingMode?
```

A `RawTextRunEvidence` records a text range and browser-observed typography evidence:

```text
start
end
text
font.family
font.style?
font.weight?
font.stretch?
font.variationSettings?
font.featureSettings?
fontSize
lineHeight?
letterSpacing?
color?
decoration?
baselineShift?
direction?
```

Run offsets are safe integer offsets into `RawTextEvidence.value` and the run text must equal `value.slice(start, end)`.

NODE-10 currently emits one computed-style run for each captured text/pseudo text evidence record. Rich authored cascade provenance belongs to NODE-11.

## Text fragment evidence

Each `RawTextFragmentEvidence` records:

```text
start
end
bounds
baseline
baselineSource
baselineConfidence
lineIndex
```

`baselineConfidence` is normalized to the inclusive interval `[0, 1]`.

Allowed baseline provenance values are:

```text
font-metrics
line-box-estimate
cdp-layout-estimate
```

A baseline is evidence, not an assertion that every browser line-box detail is perfectly reconstructible from that estimate.

## Standard capture path

### Text style

Standard capture derives text style from the text node's parent element, shadow host, or document element and uses `getComputedStyle`.

### Fragment measurement

Standard capture uses DOM `Range` geometry.

For each text node it:

1. measures code-point ranges with `Range.getClientRects()`;
2. ignores zero-width/zero-height rects;
3. converts rects to document CSS-pixel coordinates;
4. groups samples into horizontal or vertical line fragments;
5. records fragment text offsets and `lineIndex`.

The current Standard measurement budget is capped at the first:

```text
4096
```

UTF-16 code units of a text node. This is an implementation budget, not a license to fabricate unmeasured fragment geometry beyond the cap.

### Standard baseline evidence

Standard capture first attempts canvas font metrics using `measureText("Hg")`.

When `actualBoundingBoxAscent` and `actualBoundingBoxDescent` are usable:

```text
baselineSource: font-metrics
baselineConfidence: 0.9
```

If font metrics are unavailable, Standard capture records a line-box estimate:

```text
baselineSource: line-box-estimate
baselineConfidence: 0.55
```

The fallback baseline is derived from the measured fragment rectangle; it is not presented as browser-native baseline telemetry.

## CDP High Fidelity path

NODE-10 extends the DOMSnapshot computed-style request with text/inline/pseudo/form visual properties, including:

```text
font-family
font-size
font-style
font-weight
font-stretch
font-variation-settings
font-feature-settings
line-height
letter-spacing
color
text-decoration-line
white-space
word-break
overflow-wrap
text-align
direction
writing-mode
vertical-align
content
appearance
accent-color
```

The NODE-09 visibility/layout properties remain required.

### CDP text fragments

CDP normalization preserves repeated DOMSnapshot layout entries for a node rather than collapsing them into one rectangle.

`layout.text` evidence is used to align rendered fragment text back to the captured text value where possible. Fragment geometry comes from `clientRects` when available and falls back to the corresponding layout bounds.

CDP baseline evidence is explicitly marked as an estimate:

```text
baselineSource: cdp-layout-estimate
baselineConfidence: 0.7
```

The estimate uses layout bounds plus computed font-size/line-height evidence. It is not mislabeled as a native browser baseline API.

## Inline fragment evidence

`RawInlineEvidence` records:

```text
display
writingMode
verticalAlign?
fragmentBounds[]
```

Evidence is emitted for computed displays beginning with:

```text
inline
ruby
```

Standard capture uses element client rects. CDP uses all DOMSnapshot layout/client-rect entries associated with the node.

## Pseudo evidence

`RawPseudoEvidence` records:

```text
type
content
contentKind: none | text | complex
generatedText?
```

### Standard pseudo capture

Standard capture probes:

```text
::before
::after
::marker
```

with `getComputedStyle(element, pseudoSelector)`.

Quoted string `content` is decoded into `generatedText`, including CSS `\\A` newline handling. Non-empty content that cannot be safely represented as plain text is retained as:

```text
contentKind: complex
```

Missing/`normal`/`none` content is represented as `none`. Non-marker pseudo nodes with no content are not emitted. Marker evidence remains tied to list-item semantics.

Pseudo nodes are explicit children of the host in the captured source/composed relationship evidence.

### CDP pseudo capture

CDP normalizes DOMSnapshot `pseudoType` plus computed `content` and rendered layout text. If rendered pseudo text exists it is preserved as `generatedText` and text evidence.

## Form visual evidence and privacy

NODE-10 captures visual/control state without collecting live input/textarea text values.

Supported control kinds are:

```text
input
textarea
select
button
progress
meter
output
```

Possible evidence includes:

```text
inputType?
disabled
readOnly?
required?
checked?
indeterminate?
multiple?
placeholder?
appearance?
accentColor?
```

Text-value handling is explicit:

```text
textValueCapture: omitted-sensitive
textValueCapture: not-applicable
```

Rules:

- textual `input` values are not captured;
- `textarea` live text values are not captured;
- `select` live selected textual value is not captured as a text-value field;
- CDP normalizer does not consume DOMSnapshot `inputValue` or `textValue` runtime-value fields;
- `value` attributes on `INPUT`/`TEXTAREA` are filtered from sanitized source attributes;
- checkbox/radio checked state may be captured because it is visual state rather than arbitrary user-entered text;
- Standard capture may record checkbox/radio `indeterminate` where browser APIs expose it.

NODE-10 does not read cookies, `localStorage` or `sessionStorage`.

## Region / Redact / Exclude

NODE-10 inherits NODE-07/NODE-09 region semantics:

- fully covered `exclude` nodes are removed;
- intersecting `redact` evidence is masked;
- structural ancestor closure is retained for region captures;
- `exclude` and `redact` remain distinct operations.

Text, inline and form visual evidence must not bypass an existing redaction boundary.

## Validation invariants

The shared validator rejects malformed NODE-10 evidence, including:

- invalid text offsets;
- run text that does not match the referenced slice;
- negative/non-finite font sizes or malformed numeric evidence;
- fragment bounds that are not valid rectangles;
- baseline confidence outside `[0, 1]`;
- unsupported baseline provenance;
- negative/non-integer line indices;
- malformed inline fragment bounds;
- pseudo nodes without valid pseudo evidence;
- mismatched `source.pseudoType` and `pseudo.type`;
- malformed form visual state;
- inconsistent `textContent` and `text.value`.

Dependency-free `scripts/validate-node-10.mjs` additionally freezes the long-term NODE-10 source/runtime/privacy boundary without pinning unrelated future NODE implementation details.

## Determinism and evidence policy

NODE-10 follows the V2/V2.1 evidence rules:

- preserve browser-observed numeric precision;
- do not round capture geometry for convenience;
- label estimates as estimates;
- never invent unavailable evidence;
- keep Standard and CDP output within one adapter-neutral RawSnapshot contract;
- keep sensitive runtime text out of capture evidence.

## Explicit non-goals

NODE-10 does not implement:

- authored selector/cascade provenance;
- CSS custom-property resolution graphs;
- media/container/environment authored semantics;
- asset localization;
- Pixel Ground Truth/raster tiling;
- responsive multi-viewport inference;
- Figma rendering.

Those remain assigned to later roadmap nodes beginning with NODE-11.
