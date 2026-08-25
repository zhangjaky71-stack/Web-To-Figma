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
| 28 | Hybrid Native / Raster Renderer | EXIT GATE CANDIDATE | Read-only exact-head CI #685 PASS; final evidence-head CI pending | PR #33 / `node-28-hybrid-raster-renderer` |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-28 — Hybrid Native / Raster Renderer`

Entry baseline:

```text
4aef2daaafe338d4677e714d5bcadd26db6b152f
```

Working branch:

```text
node-28-hybrid-raster-renderer
```

Pull request:

```text
#33
```

## NODE-27 Closure

NODE-27 was merged to `main` via PR #32 as:

```text
4aef2daaafe338d4677e714d5bcadd26db6b152f
```

Exact-head CI #667 passed the permanent NODE-27 validator, frozen install, lint, typecheck, tests, build, packaged Figma validation and format check. NODE-27 now owns faithful native Figma Auto Layout/Grid reconstruction, FILL/HUG/FIXED sizing, min/max sizing, absolute constraints and fail-closed preservation of source geometry where browser layout semantics cannot be represented exactly.

## NODE-28 Frozen Scope

NODE-28 executes only the final hybrid representation selected upstream:

```text
native-compatible subtree -> editable NODE-26/27 Figma nodes
explicit renderStrategy:raster boundary -> minimal local raster surface
raster descendant subtree -> suppressed from duplicate native creation
```

Non-negotiable rules:

- no whole-page screenshot substitution;
- only `node-fallback`, `canvas`, `webgl` and `video-frame` local evidence may materialize fallback surfaces;
- `viewport` and `full-page` Pixel Ground Truth evidence is never accepted as a fallback surface;
- every fallback is source-bound and must geometrically cover its selected minimal boundary;
- tile bytes come only from the NODE-23 validated local `.wtf` package; the Figma plugin performs no network re-fetch;
- native siblings outside fallback boundaries remain editable;
- failure or cancellation removes the complete in-progress import root;
- large fallback surfaces remain tiled rather than silently downscaled.

See `docs/nodes/NODE-28_HYBRID_NATIVE_RASTER_RENDERER.md` for the full contract.

## Current NODE-28 Implementation

PR #33 currently contains:

- transaction-level raster-boundary suppression so raster descendants are not duplicated as native layers;
- selection escalation to the nearest raster ancestor for partial imports inside fallback subtrees;
- NODE-26 visual-pass sanitization on raster roots before final local-raster materialization;
- validated reference/tile extraction from the local `.wtf` archive;
- protocol guards that reject malformed or page-level raster fallback evidence;
- source-bound, geometry-covering deterministic fallback planning;
- Figma Frame + image-tile materialization with local provenance pluginData;
- integration after NODE-26 visuals and NODE-27 layout;
- full-root rollback on any NODE-28 failure/cancellation;
- a permanent NODE-28 repository validator plus renderer/plugin unit coverage;
- read-only CI #685 passing Foundation, NODE-27/28 guardrails, frozen install, lint, typecheck, tests, build, packaged Figma validation and format check on candidate head `c008b230603c9bad06d4edae1232bf741062a653`.

## Fidelity Policy

Rasterization is a compatibility boundary, not the default import strategy. The renderer must preserve editable Figma structure everywhere current Figma capabilities can express the captured browser semantics. Unsupported compositing is rasterized only at the smallest explicit upstream boundary and never by replacing the complete imported page with a screenshot.

NODE-29 owns Pixel Ground Truth visual comparison, structural/editability scoring and mismatch diagnostics; it does not relax NODE-28's minimal-local-fallback rule.

## Blockers

No product or architecture blocker is known. The only remaining NODE-28 exit step is a final read-only exact-head CI on this evidence/status commit, followed by Ready-for-Review and merge if that exact head remains green.

## Next

Run final read-only exact-head CI for PR #33. If every gate remains green, mark the PR ready, merge NODE-28 into `main`, record the merge SHA, and immediately begin NODE-29 Visual / Structure / Editability QA.
