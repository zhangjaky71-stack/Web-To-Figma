# Web-To-Figma Acceptance Contract V2

**Status:** APPROVED FOR IMPLEMENTATION  
**Baseline:** V2 + V2.1 + NODE-00  
**Package format:** `.wtf` (`application/x-wtf`)

## 1. Purpose

This document defines measurable release gates for Web-To-Figma. It prevents acceptance from collapsing into a single subjective question such as “does it look close enough?”.

A release must be evaluated across visual fidelity, geometry, text, assets, structure, editability, responsive behavior, raster fallback, security, determinism, and performance.

## 2. Test classes

### Class A — Deterministic fixtures

Local, versioned HTML/CSS/asset fixtures controlled by the project. These are the primary regression source.

### Class B — Versioned realistic corpus

Locally captured or authored pages representing landing pages, ecommerce, docs, dashboards, tables, SaaS shells, local sites, Shadow DOM, iframe, canvas/WebGL and responsive applications.

### Class C — Live compatibility smoke tests

Public websites used only as compatibility signals. They are not the sole regression baseline because third-party pages can change independently of W2F.

## 3. Supported-page classification

Metrics such as native/editable ratio must distinguish:

- **Native-supported area** — features W2F claims can reconstruct natively/emulated;
- **Expected-fallback area** — WebGL, inaccessible third-party frame, unsupported compositing dependency, or other explicitly documented fallback;
- **Unsupported/blocked area** — content unavailable due to browser/platform/security restrictions.

A release may not improve scores by silently reclassifying ordinary HTML/CSS as expected fallback.

## 4. Core quality metrics

### 4.1 Visual Fidelity

Measures rendered-image similarity between browser pixel ground truth and Figma export.

Required reporting:

- page score;
- section score;
- critical-node score where available.

Release targets:

- Level 1/2 deterministic fixtures: **>= 99%** normalized visual similarity target;
- realistic supported corpus median: **>= 95%**;
- severe local regressions may fail even if page average passes.

### 4.2 Geometry Fidelity

For comparable nodes:

`geometry_error = |dx| + |dy| + |dw| + |dh|`, normalized by relevant scale.

Release target:

- deterministic supported fixtures: **>= 98% geometry fidelity**;
- no systematic drift from premature integer rounding;
- geometry validation uses the configured epsilon/quantization policy.

### 4.3 Text Fidelity

Measures:

- content preservation;
- line/fragments geometry;
- font mapping outcome;
- line height/letter spacing/wrapping error.

Release target:

- supported-font deterministic fixtures: **>= 97% text fidelity**;
- substituted/missing fonts must be reported, never silently treated as exact matches.

### 4.4 Asset Fidelity

Measures correct asset bytes/reference and visual placement for supported images/SVG.

Release target:

- deterministic asset fixtures: **>= 99%**;
- missing assets must produce diagnostics or a defined fallback, not disappear silently.

### 4.5 Structure Fidelity

Measures whether semantic/layout boundaries are preserved without unnecessary DOM-wrapper reproduction.

Inputs may include:

- source-to-render mapping completeness;
- semantic section correctness;
- hierarchy parent correctness;
- anonymous wrapper count;
- unnecessary frame ratio;
- naming quality.

Release target:

- deterministic structure fixtures: **>= 95%** composite structure score.

### 4.6 Editable Area Ratio

`editable_area_ratio = editable_native_or_emulated_area / total_visible_supported_area`

Bitmap fallback regions are not editable area.

Release target:

- median on supported standard HTML/CSS corpus: **>= 90%**.

### 4.7 Responsive Fidelity

Measures supported local behavior after resize/re-layout:

- FILL/HUG/FIXED correctness;
- gap/padding;
- min/max sizing;
- flex/grid relationships;
- constraints;
- detected breakpoint/visibility/layout changes.

Release target:

- supported responsive deterministic fixtures: **>= 90%** composite responsive score.

Structural breakpoint changes that Figma cannot execute must still be correctly detected and reported.

### 4.8 Raster Area Ratio

`raster_area_ratio = raster_fallback_visible_area / total_visible_area`

Target:

- on the native-supported standard fixture corpus, median **<= 15%**;
- expected-fallback fixtures are reported separately and may exceed this value;
- whole-page raster fallback is a failure for pages composed primarily of supported HTML/CSS.

## 5. Native/editability guardrails

The following are explicit anti-cheating gates:

- a page-level screenshot cannot satisfy structure/editability acceptance;
- ordinary text must not be rasterized solely to improve pixel score when a supported native path is available;
- ordinary images must stay image assets rather than becoming page screenshots;
- SVG must remain vector where safely supported;
- wrapper reduction must not destroy clipping, stacking, transform, scroll, semantic, or layout boundaries.

## 6. Capture acceptance

P0 capture acceptance requires:

- successful current document capture for deterministic online fixtures;
- successful `file://` capture after explicit file access permission;
- successful local-folder relative asset resolution fixtures;
- region selection preserving intersecting nodes and structural ancestors;
- document and primary app-scroll-root semantics tested;
- open Shadow DOM/slot composed-tree fixture support;
- same-origin iframe fixture support;
- inaccessible/cross-origin frame produces defined diagnostic/fallback;
- current visual state is frozen/restored without permanently mutating the page;
- page scroll/focus/temporary styles are restored in `finally`-equivalent cleanup paths.

## 7. `.wtf` package acceptance

Every valid package must have:

- recognized magic/container structure;
- versioned manifest;
- `formatVersion`;
- `schemaVersion`;
- `writerVersion`;
- `minReaderVersion`;
- capability flags;
- checksums;
- source/render identity data required by the declared capabilities;
- pixel ground truth required by the capture profile;
- deterministic asset addressing/dedup where applicable.

Invalid or malicious packages must fail before rendering user-visible partial content unless the failure is explicitly recoverable.

## 8. Import acceptance

Figma import requires:

- choose-file path;
- drop-on-canvas path while plugin is active;
- secure parse before render;
- temporary import root/transaction;
- rollback on fatal error;
- meaningful layer naming;
- source mapping in pluginData for important render nodes;
- native/emulated/absolute/raster strategy diagnostics;
- section-selective import for declared large-page mode;
- viewport selection/focus after successful commit.

## 9. Font acceptance

For each used font:

1. exact available Figma font is preferred;
2. nearest configured mapping is allowed with diagnostic;
3. geometry-preserving correction may be attempted;
4. raster text is allowed only when policy and fidelity profile justify it.

A missing font must never be reported as an exact match.

## 10. Responsive acceptance

Required deterministic cases:

- horizontal flex;
- vertical flex;
- nested auto layout;
- flex-grow/FILL;
- content-sized/HUG;
- fixed sizing;
- min/max constraints;
- simple CSS grid;
- grid column count changes across snapshots;
- visibility switch across breakpoint;
- flex-direction/order change detection;
- container-query metadata fixture.

## 11. Determinism gate

On deterministic fixtures captured 10 times under the same environment:

- asset hashes must be identical;
- normalized Source Graph hashes must be identical after removing intentionally variable capture metadata;
- normalized Render Tree hashes must be identical;
- stable identities must match for all deterministic expected nodes;
- layout decisions and reasons must not randomly change.

A nondeterministic field must be explicitly marked and excluded from canonical hashing rather than silently tolerated.

## 12. Security gate

Release is blocked by:

- any known critical/high severity archive traversal or code-execution path;
- executable HTML/JS from `.wtf` being run on import;
- unsanitized active SVG scripting path;
- unbounded decompression allowing trivial zip-bomb denial of service;
- password/token/cookie persistence contrary to the privacy baseline.

Security tests must include malformed archives, path traversal, oversized expansion, invalid checksum, malformed schema and hostile SVG fixtures.

## 13. Privacy gate

By default a `.wtf` package must not contain:

- cookies;
- localStorage/sessionStorage snapshots;
- authorization headers;
- passwords;
- browser credentials/tokens.

If a future feature allows safe form-value capture, it must be explicit, scoped, documented and tested.

## 14. Performance/scale gates

Hard millisecond budgets are calibrated in NODE-30, but functional scale gates are fixed now:

- <2k render nodes: normal path;
- 2k–5k: normal path;
- 5k–10k: chunked/progress-capable path;
- 10k–20k: must complete without fatal crash on benchmark environment, with chunking/warning allowed;
- 20k–50k: user warning and simplified/section-import recommendation;
- >50k: explicit user confirmation or section/simplified strategy required.

Release fails if a 10k-node deterministic benchmark routinely crashes the capture or importer.

## 15. Error/diagnostic gate

Failures must belong to a stable domain:

- SOURCE;
- PERMISSION;
- CAPTURE;
- DOM;
- CSS;
- TEXT;
- ASSET;
- RESPONSIVE;
- LAYOUT;
- COMPOSITING;
- FILE;
- FIGMA;
- FONT;
- RENDER;
- QA;
- PERFORMANCE;
- SECURITY.

Critical downgrade decisions must carry `reason` and, where applicable, `confidence`.

## 16. Known-limitations contract

Items in `docs/KNOWN_LIMITATIONS.md` do not automatically fail release if:

- the limitation is explicitly documented;
- behavior follows the documented fallback/diagnostic;
- no P0 requirement contradicts the limitation;
- the implementation does not silently claim support.

## 17. Release gate summary

A Release Candidate requires all of the following:

- P0 functional checklist complete or moved by approved ADR;
- Level 1/2 fixture visual target met;
- geometry target met;
- asset target met;
- structure target met;
- editable-area target met on supported corpus;
- responsive target met on supported responsive fixtures;
- no anti-cheating violations;
- deterministic fixture gate passes;
- security gate passes with zero known critical/high blockers;
- scale gate passes;
- compatibility matrix generated;
- known limitations current;
- `.wtf` schema/version compatibility tests pass.

## 18. Change control

Changing an acceptance threshold after implementation begins requires:

- evidence from benchmark data;
- explanation of whether the old threshold was technically invalid or merely inconvenient;
- an ADR or explicitly reviewed contract change.

Thresholds must not be lowered solely to make a failing implementation appear complete.
