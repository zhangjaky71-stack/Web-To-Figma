# NODE-29 — Visual / Structure / Editability QA

## Objective

NODE-29 turns high-fidelity reconstruction into a measurable release gate. A successful import must not only look close to the browser reference; it must also preserve the intended source mapping, hierarchy, sibling order, metadata, and editable native surfaces.

This node does not permit visual similarity to be improved by flattening supported HTML/CSS into a page screenshot.

## Frozen QA thresholds

For deterministic benchmark fixtures:

- Visual similarity: **99%** minimum.
- Structure score: **95%** minimum.
- Supported editable area ratio: **90%** minimum.
- Supported raster area ratio: **15%** maximum.

Real-world visual observations may use a **95%** warning/pass target when rendering contains nondeterministic browser or platform variance, but deterministic fixtures remain gated at 99%.

## Visual QA

Visual QA compares browser Pixel Ground Truth with Figma-rendered PNG evidence and records:

- mean absolute channel error;
- root mean squared channel error;
- maximum channel error;
- changed-pixel ratio;
- normalized similarity;
- missing tile or dimension mismatch failures.

The browser Pixel Ground Truth remains the visual reference. Missing evidence must be surfaced rather than hidden in an aggregate score.

### Tiled Pixel Ground Truth runtime

Whole-page imports use NODE-14 `full-page` reference evidence already embedded in the securely parsed `.wtf` package. NODE-29 does not download the original page or assets again.

The runtime path is:

```text
NODE-23 validated .wtf
  -> full-page Pixel Ground Truth reference + PNG tiles
  -> imported Figma root clone on a temporary isolated QA page
  -> Figma SliceNode export for each matching tile region at captured DPR
  -> W2F_QA_VISUAL_EXPORT
  -> plugin UI createImageBitmap PNG decoding
  -> browser tile vs Figma tile RGBA comparison
  -> pixel-weighted page aggregate
  -> W2F_QA_VISUAL_RESULT
  -> root pluginData QA evidence
```

Using matching tiles avoids a single oversized page PNG and keeps long-page QA aligned to the exact browser Ground Truth tiling geometry. The temporary QA page is removed after export and is never part of the final imported design.

Selected-section imports currently retain structure/editability QA but report page-level visual QA as unavailable unless an exact section-scoped Pixel Ground Truth reference is introduced by a later contract change. `UNAVAILABLE` is never treated as `PASS`.

## Structure QA

The Figma scene is inspected after native visual reconstruction, responsive layout, and NODE-28 minimal raster fallback materialization. Each mapped node is checked for:

- source/render-node mapping completeness;
- expected parent relationship;
- sibling order;
- W2F identity and render-strategy pluginData;
- expected editable class for text, vector, image, container, or explicit raster boundaries.

Raster descendants suppressed behind a valid NODE-28 boundary are excluded from direct native mapping expectations, but the boundary itself must remain explicitly identified as `minimal-local-fallback`.

## Editability and raster accounting

Area metrics use terminal supported render nodes so nested parent/child rectangles are not double-counted.

Native-supported text, vectors, images, and containers contribute to editable area only when the reconstructed Figma node matches the expected editable class. Explicit NODE-28 raster boundaries contribute separately to raster area.

A deterministic supported fixture fails if editable area falls below 90% or raster area exceeds 15%.

## Anti-cheating

**No whole-page screenshot substitution.**

The following are release-blocking failures:

- rasterizing native-supported text merely to improve pixel similarity;
- replacing supported DOM/CSS structure with a viewport or full-page bitmap;
- hiding missing source mappings behind a raster average;
- omitting source identity or render-strategy metadata from mapped nodes;
- treating unauthorized raster output as editable content.

Only NODE-28 source-scoped minimal local fallback boundaries are valid raster surfaces.

## Runtime evidence

After import, the root Figma frame persists compact QA evidence in pluginData, including:

- `w2f.qa.version`;
- `w2f.qa.structureStatus`;
- `w2f.qa.structureScore`;
- `w2f.qa.editableAreaRatio`;
- `w2f.qa.rasterAreaRatio`;
- `w2f.qa.failureCount`;
- `w2f.qa.visualStatus`;
- `w2f.qa.visualSimilarity`;
- `w2f.qa.changedPixelRatio`;
- `w2f.qa.visualTarget`;
- `w2f.qa.visualReferenceId`.

This evidence is diagnostic metadata, not a replacement for benchmark artifacts or Pixel Ground Truth.

## Failure isolation

QA must not corrupt a valid import. Structure/editability failures are persisted and reported rather than silently ignored. Pixel export/decode failures become `UNAVAILABLE` or `FAIL` diagnostics as appropriate. Temporary QA-page cleanup errors are secondary and may not invalidate the committed imported root.

The visual handshake has a bounded timeout so a UI decode failure cannot leave the import stuck indefinitely.

## Exit gate

NODE-29 is complete only when:

1. visual pixel comparison is implemented and tested;
2. browser full-page Ground Truth is connected to real Figma tile export and local UI decoding;
3. structure/editability evaluation is implemented and tested;
4. Figma scene inspection is wired into the real import path;
5. anti-raster-cheating tests pass;
6. the permanent `validate-node-29.mjs` guardrail covers the end-to-end Pixel QA path;
7. packaged Figma validation requires the local Pixel QA runtime and remains network-free;
8. lint, typecheck, tests, build, packaged plugin validation, and format checks pass on the exact closure PR head.

## Candidate evidence

PR #35 / CI #697 validated and merged the platform-neutral scoring core, real Figma scene inspection, structure/editability guardrails, documentation, and permanent NODE-29 CI gate.

A post-merge closure is required because the complete `full-page` Ground Truth -> Figma tiled export -> UI decode -> visual-result feedback loop landed after PR #35's merge cut. NODE-29 is not considered operationally closed until that closure passes exact-head CI and is merged to `main`.

## Boundary with NODE-30

NODE-30 owns Responsive / Determinism / Performance QA across repeated runs, viewport families, and performance budgets. NODE-29 establishes the single-import visual, structural, editability, and raster-quality contract that NODE-30 will reuse.
