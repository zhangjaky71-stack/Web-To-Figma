# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts + High-Fidelity Capture/Import Acceptance Standard  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-24

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
| 26 | Text / Font / Asset / Paint Renderer | IMPLEMENTING | Candidate validation pending | `node-26-text-assets-paint` |
| 27 | Figma Responsive Layout Renderer | TODO | - | - |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-26 — Text / Font / Asset / Paint Renderer`

Entry baseline:

```text
f46d69a8e13f4fad80b03f26f0dc9acddb6db383
```

Working branch:

```text
node-26-text-assets-paint
```

## NODE-25 Closure

NODE-25 was merged to `main` as:

```text
35d9a18bdfda12e4a11382ef13d5039c2d7cc4ad
```

The merge commit records Bootstrap CI #638 and exact-head read-only CI #640 as passing. The resulting renderer owns transactional root creation, hierarchy, fractional geometry, naming, pluginData, stable/revision mapping, whole-page/selected-section import and z-order. It intentionally leaves text/fonts/assets/paint to NODE-26, responsive layout to NODE-27 and hybrid/raster execution to NODE-28.

The later `8ee11dd6` and `f46d69a8` documentation commits added and registered the mandatory high-fidelity capture/import development and acceptance standard; NODE-26 therefore branches from that newer `main` baseline.

## NODE-26 Frozen Scope

NODE-26 is limited to editable visual reconstruction on top of the NODE-25 scene graph:

```text
editable TextNode reconstruction
per-run font/style/size/line-height/letter-spacing/color/decoration
local Figma font resolution + explicit fallback counting
embedded raster image paints
sanitized SVG -> editable Figma vector subtree
solid/gradient/image fills
border + corner radius
box shadows
opacity + equivalent blend modes
asset/font/fidelity diagnostics counters
transaction-preserving node replacement
```

No external image/font fetch is permitted during import. The existing Figma manifest remains `networkAccess.allowedDomains = ["none"]`.

NODE-27 remains responsible for Auto Layout/Grid/responsive sizing/constraints. NODE-28 remains responsible for selective raster fallback when browser rendering semantics do not have a faithful Figma-native representation.

## NODE-26 Implementation

The Figma UI continues to run NODE-23 `parseWtfPackage` first. Only after validation succeeds does it remap `binaryPayloads` and `sanitizedSvgPayloads` from archive paths to stable asset IDs and hand those local payloads to the main runtime.

`figma-visual-renderer.ts` enriches the basic scene in deterministic Render Tree order:

- text placeholders are replaced at the same sibling index by real `TextNode` layers;
- fonts are resolved against `listAvailableFontsAsync()` and loaded with `loadFontAsync()` before text/range mutation;
- per-run text formatting is applied without allowing the generic paint pass to erase run colors;
- embedded raster bytes are converted with the Figma image API and applied as image paints;
- sanitized SVG is reconstructed with the Figma SVG node path, retaining an editable vector subtree;
- solid/linear/radial/angular paints, borders, independent corner radii, drop/inner shadows, opacity and supported blend modes are applied natively;
- all W2F pluginData is copied when placeholders are replaced so stable IDs, source mapping and revision metadata survive.

NODE-25 remains the transaction owner. A fatal NODE-26 visual mutation removes the complete import root instead of leaving a partially reconstructed file.

## Fidelity Boundaries

NODE-26 does not claim a false one-to-one mapping for browser paint primitives that Figma cannot represent natively. Examples include independently colored border sides, some exact CSS gradient transforms, filters/backdrop filters, complex masks/clip paths and fonts unavailable to the Figma editor runtime.

Those cases must remain explicit and are routed through the capability/fallback system rather than replaced by blank layers. NODE-28 executes hybrid/raster fallbacks, and NODE-29 evaluates visual fidelity against Pixel Ground Truth while also checking editability.

## Blockers

No product or architecture blocker is currently known. Candidate CI may expose TypeScript/Figma API compatibility defects that must be fixed before NODE-26 can leave IMPLEMENTING.

## Next

Create the NODE-26 implementation commit and pull request, run frozen-lockfile CI on the exact head, fix any failures without weakening NODE-22/23 security or NODE-25 transaction invariants, and merge only after the normal read-only CI is green. Then begin NODE-27.
