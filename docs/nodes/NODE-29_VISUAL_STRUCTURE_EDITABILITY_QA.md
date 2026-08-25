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

Visual QA compares equal-length RGBA buffers and records:

- mean absolute channel error;
- root mean squared channel error;
- maximum channel error;
- changed-pixel ratio;
- normalized similarity.

The browser Pixel Ground Truth remains the visual reference. Missing evidence must be surfaced rather than hidden in an aggregate score.

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

- QA version;
- structure status;
- structure score;
- editable area ratio;
- raster area ratio;
- failure count.

This evidence is diagnostic metadata, not a replacement for benchmark artifacts or Pixel Ground Truth.

## Exit gate

NODE-29 is complete only when:

1. visual pixel comparison is implemented and tested;
2. structure/editability evaluation is implemented and tested;
3. Figma scene inspection is wired into the real import path;
4. anti-raster-cheating tests pass;
5. the permanent `validate-node-29.mjs` guardrail passes;
6. lint, typecheck, tests, build, packaged plugin validation, and format checks pass on the exact PR head.

## Boundary with NODE-30

NODE-30 owns Responsive / Determinism / Performance QA across repeated runs, viewport families, and performance budgets. NODE-29 establishes the single-import visual, structural, editability, and raster-quality contract that NODE-30 will reuse.
