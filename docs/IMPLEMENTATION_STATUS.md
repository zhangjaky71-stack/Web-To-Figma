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
| 28 | Hybrid Native / Raster Renderer | IMPLEMENTING | Candidate CI pending | `node-28-hybrid-raster` |
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
node-28-hybrid-raster
```

## NODE-27 Closure

NODE-27 was merged to `main` via PR #32 as:

```text
4aef2daaafe338d4677e714d5bcadd26db6b152f
```

Exact-head CI #667 passed Foundation, frozen install, Lint, Typecheck, Tests, Build, packaged Figma plugin validation and Format check.

NODE-27 now owns deterministic Flex → Figma Auto Layout translation, supported native Grid translation, FILL/HUG/FIXED sizing, flex-grow, min/max sizing, gaps/padding/alignment, absolute/fixed child constraints, and explicit preservation of source geometry when browser layout semantics do not have an exact Figma-native equivalent.

## NODE-28 Frozen Direction

NODE-28 does **not** decide where fallback is needed. It consumes the existing NODE-20 compositing/fallback decision and NODE-14 Pixel Ground Truth tiles.

The core execution contract is:

```text
NODE-20 minimal safe compositing boundary
        ↓ renderStrategy: raster
NODE-14 deterministic local PNG reference tiles
        ↓
NODE-28 local hybrid renderer
        ↓
replace only the raster boundary subtree in Figma
```

Fallback reference IDs are already source-addressable (`node-fallback:<encoded source node id>`, plus canvas/video variants), and NODE-20 boundary capture chooses a source node whose geometry represents the promoted boundary. NODE-28 therefore maps raster roots to packaged local tile evidence without network access or screenshot re-inference.

## NODE-28 Fidelity / Safety Rules

- native/editable layers remain native outside explicit raster boundaries;
- rasterization is local/minimal and follows NODE-20 boundaries;
- whole-page rasterization is never the default and is only legal when the document root itself is the already-computed minimal safe boundary;
- all PNG bytes come from the validated `.wtf` package;
- missing or incomplete raster evidence must keep the existing native subtree instead of producing blank placeholders;
- raster replacement must preserve boundary geometry, sibling position, layer name, source/stable/revision pluginData and import transaction rollback;
- multi-tile boundaries must be reconstructed at exact captured coordinates inside a clipped local frame;
- no network access is introduced.

## Current NODE-28 Implementation

Implementation is starting from the merged NODE-27 baseline. The next concrete work is:

1. extend the secure UI → main handoff with validated `referenceTiles` and local tile bytes;
2. add a deterministic hybrid/raster planner in `@w2f/figma-renderer`;
3. add a Figma runtime that materializes raster boundaries as local clipped frames with image-filled tile rectangles;
4. preserve native subtrees when fallback evidence is incomplete;
5. add planner/runtime tests, permanent foundation/package validation, NODE-28 implementation documentation and ADR;
6. run exact-head CI, open/finish the NODE-28 PR and merge only when the exact head is green.

## Blockers

No product or architecture blocker is known. The remaining implementation risk is limited to strict Figma runtime typings and exact reference-tile coverage/mapping; CI and deterministic planner tests will gate both.

## Next

Implement the NODE-28 local hybrid/raster execution path, validate exact-head CI, merge it, then begin NODE-29 Visual / Structure / Editability QA.
