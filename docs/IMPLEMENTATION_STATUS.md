# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts + High-Fidelity Capture/Import Acceptance Standard  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-25

## Roadmap

| NODE | Name | Status | Validation | Commit/PR |
|---|---|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE | PASS | PR #3 merged |
| 01 | Monorepo Foundation | DONE | Frozen-lockfile CI PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile CI PASS | PR #6 merged |
| 03 | W2F IR V2 | DONE | IR roundtrip/reference + frozen-lockfile CI PASS | PR #7 merged |
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping PASS | PR #8 merged |
| 05 | Browser Extension Shell | DONE | MV3 package + CI PASS | PR #9 merged |
| 06 | Source Providers & Offline | DONE | Runtime/package + CI PASS | PR #10 merged |
| 07 | Region Selector & Redaction | DONE | Runtime/package + CI PASS | PR #11 merged |
| 08 | Standard DOM Capture | DONE | Capture/runtime/package + CI PASS | PR #12 merged |
| 09 | CDP High Fidelity Adapter | DONE | Dual-profile/runtime/package + CI PASS | PR #13 merged |
| 10 | Text / Inline / Pseudo Capture | DONE | Exact-head read-only CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | DONE | Exact-head read-only CI PASS | PR #15 merged as `6e303818` |
| 12 | Media / Container / Environment Capture | DONE | Exact-head CI #310 PASS | PR #16 merged as `b9cdca4d` |
| 13 | Asset Resolver | DONE | Exact-head CI #328 PASS | PR #17 merged as `07978a58` |
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | DONE | Exact-head CI #449 PASS | PR #22 merged as `7cd56101` |
| 19 | Render Tree Optimizer | DONE | Exact-head CI #477 PASS | PR #23 merged as `030f433a` |
| 20 | Compositing & Fallback Boundary | DONE | Exact-head CI #503 PASS | PR #24 merged as `f0d10cdb` |
| 21 | WTF Packager | DONE | Exact-head CI #540 PASS | PR #25 merged as `5395d1eb` |
| 22 | Figma Plugin Shell & File Intake | DONE | Exact-head CI #571 PASS | PR #26 merged as `84ebc5ed` |
| 23 | Secure Parser & Migration | DONE | Exact-head CI #624 PASS | PR #27 merged as `23cad572` |
| 24 | Figma Capability Resolver | DONE | Exact-head CI #630 PASS | PR #28 merged as `e9e4d1e9` |
| 25 | Basic Figma Renderer | DONE | Bootstrap CI #638 + exact-head CI #640 PASS | PR #29 merged as `35d9a18b` |
| 26 | Text / Font / Asset / Paint Renderer | DONE | Exact-head CI #651 PASS | PR #31 merged as `f6247ddc` |
| 27 | Figma Responsive Layout Renderer | DONE | Exact-head CI #667 PASS | PR #32 merged as `4aef2daa` |
| 28 | Hybrid Native / Raster Renderer | DONE | Exact-head CI #685 PASS | PR #33 merged as `ec880c4f` |
| 29 | Visual / Structure / Editability QA | IMPLEMENTING | Candidate CI pending | `node-29-visual-structure-editability-qa` |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-29 — Visual / Structure / Editability QA`

Entry baseline:

```text
ec880c4f9672d2286925b58414909a09b82654b8
```

Working branch:

```text
node-29-visual-structure-editability-qa
```

## NODE-28 Closure

NODE-28 was merged to `main` through PR #33 as:

```text
ec880c4f9672d2286925b58414909a09b82654b8
```

The merge records exact-head CI #685 passing the permanent validators, frozen install, lint, strict typecheck, tests, build/Figma package validation and format checks.

NODE-28 owns selective hybrid/native-raster fallback execution. It consumes upstream fallback/compositing evidence, keeps supported text/vector/layout output native/editable, and rasterizes only explicit fallback boundaries using validated local `.wtf` evidence. NODE-29 must treat those intended fallback boundaries as valid rather than reporting every raster layer as a failure.

## NODE-29 Frozen Scope

NODE-29 adds measurable acceptance gates in three domains.

### 1. Visual QA

Compare imported Figma output against NODE-14 Pixel Ground Truth using deterministic reference regions and pixel metrics. The QA result must expose measurable error instead of a subjective “looks close” result.

Planned metrics include:

```text
pixel count
mean absolute error (MAE)
root mean square error (RMSE)
per-channel maximum error
changed-pixel ratio above a configured tolerance
size/dimension mismatch
```

The Figma runtime will export deterministic QA regions locally; the plugin UI will decode source/exported PNG bytes and calculate pixel metrics using browser canvas APIs. No remote service is required.

### 2. Structure QA

Verify the imported Figma scene still represents the validated Render Tree/source mapping:

```text
render-node mapping coverage
unique w2f.nodeId ownership
expected parent/child hierarchy
sibling ordering where native hierarchy remains
source/stable/revision pluginData retention
explicit exemptions for descendants intentionally collapsed by NODE-28 raster boundaries
```

### 3. Editability QA

Measure whether content that should remain editable actually remains native/editable:

```text
text RenderNode -> Figma TEXT coverage
editable SVG/vector coverage
native container/layout coverage
intended raster-boundary count
unexpected rasterization count
over-rasterization / document-root raster guard
missing-native-mapping count
```

A NODE-28 raster boundary is valid only when the corresponding Render Tree strategy/fallback evidence allows it. Accidental rasterization of native content is a QA failure.

## Quality Classification

NODE-29 results use explicit severity rather than hiding failures:

```text
PASS        all required structural/editability gates pass and visual error is within threshold
WARNING     non-fatal fidelity degradation is measured and reported
FAIL        structure/editability invariants are broken or visual error exceeds the acceptance gate
UNAVAILABLE visual comparison could not be executed because required reference/export bytes are absent
```

`UNAVAILABLE` is not silently treated as `PASS`.

## Safety / Determinism Rules

- QA never fetches the original web page or external assets;
- source references come only from the validated `.wtf` package;
- Figma export bytes stay within the plugin main/UI runtime;
- QA must not mutate the imported design except temporary export/slice helpers that are removed deterministically;
- QA calculations are deterministic for the same imported document/reference bytes;
- intended NODE-28 raster boundaries are tracked separately from unexpected rasterization;
- whole-page screenshot substitution cannot satisfy editability QA unless the validated Render Tree itself explicitly requires a root raster fallback.

## Implementation Plan

1. add platform-neutral structure/editability QA planning/scoring in `@w2f/figma-renderer`;
2. add Figma runtime scene inspection with pluginData/hierarchy/type evidence;
3. add local QA export-region support in Figma main;
4. add UI PNG decoding + pixel comparison metrics;
5. add protocol/result reporting without network access;
6. add unit tests for PASS/WARNING/FAIL/UNAVAILABLE, raster exemptions and over-rasterization;
7. add permanent NODE-29 validator, implementation doc and ADR;
8. run exact-head CI and merge only after all existing NODE-22—28 invariants remain green.

## Next

Implement NODE-29 measurable QA gates, merge after exact-head validation, then begin NODE-30 Responsive / Determinism / Performance QA.
