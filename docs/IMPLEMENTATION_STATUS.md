# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-23

## Roadmap

| NODE | Name | Status | Validation | Commit/PR |
|---|---|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE | PASS | PR #3 merged |
| 01 | Monorepo Foundation | DONE | Frozen-lockfile GitHub Actions PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile GitHub Actions PASS | PR #6 merged |
| 03 | W2F IR V2 | DONE | IR roundtrip/reference validation + frozen-lockfile GitHub Actions PASS | PR #7 merged |
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping + frozen-lockfile GitHub Actions PASS | PR #8 merged |
| 05 | Browser Extension Shell | DONE | Loadable MV3 package + frozen-lockfile GitHub Actions PASS | PR #9 merged |
| 06 | Source Providers & Offline | DONE | Source-provider/runtime/package + frozen-lockfile GitHub Actions PASS | PR #10 merged |
| 07 | Region Selector & Redaction | DONE | Region interaction/runtime/package + frozen-lockfile GitHub Actions PASS | PR #11 merged |
| 08 | Standard DOM Capture | DONE | RawSnapshot/Standard capture/runtime/package + frozen-lockfile GitHub Actions PASS | PR #12 merged |
| 09 | CDP High Fidelity Adapter | DONE | CDP/dual-profile/runtime/package + frozen-lockfile GitHub Actions PASS | PR #13 merged |
| 10 | Text / Inline / Pseudo Capture | DONE | Text/fragment/pseudo/form behavior + exact-head read-only frozen-lockfile CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | DONE | Cascade/Token Graph/Standard/CDP/sidecar + exact-head read-only frozen-lockfile CI PASS | PR #15 merged as `6e303818` |
| 12 | Media / Container / Environment Capture | DONE | Exact-head read-only CI #310 PASS | PR #16 merged as `b9cdca4d` |
| 13 | Asset Resolver | DONE | Exact-head read-only CI #328 PASS | PR #17 merged as `07978a58` |
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head read-only CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head read-only CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head read-only CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head read-only CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | DONE | Exact-head read-only CI #449 PASS | PR #22 merged as `7cd56101` |
| 19 | Render Tree Optimizer | DONE | Exact-head read-only CI #477 PASS | PR #23 merged as `030f433a` |
| 20 | Compositing & Fallback Boundary | IN PROGRESS | Implementation starting from merged NODE-19 | `feat/node-20-compositing-fallback-boundary` |
| 21 | WTF Packager | TODO | - | - |
| 22 | Figma Plugin Shell & File Intake | TODO | - | - |
| 23 | Secure Parser & Migration | TODO | - | - |
| 24 | Figma Capability Resolver | TODO | - | - |
| 25 | Basic Figma Renderer | TODO | - | - |
| 26 | Text / Font / Asset / Paint Renderer | TODO | - | - |
| 27 | Figma Responsive Layout Renderer | TODO | - | - |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-20 — Compositing & Fallback Boundary`

Entry baseline:

```text
030f433a0c708bfa05a1d9c27bda3a771c29e2a1
```

Working branch:

```text
feat/node-20-compositing-fallback-boundary
```

## NODE-19 Closure

NODE-19 PR #23 passed exact-head read-only CI #477 (`32636707176`) on final candidate:

```text
f19493ca7730f0efeb37010f599f0bd564374e7d
```

and was squash merged into `main` as:

```text
030f433a0c708bfa05a1d9c27bda3a771c29e2a1
```

The merged tree contains the deterministic `@w2f/render-tree-optimizer`, conservative wrapper folding, full source/stable mapping, structural fingerprints, subtree-aware revision hashes, Browser render-tree sidecar persistence and permanent NODE-19 guardrails. Temporary bootstrap/finalization files were absent before merge.

## NODE-20 Frozen Scope

NODE-20 implements the frozen V2 compositing dependency and minimal fallback-boundary stage:

```text
mix-blend-mode
filter
backdrop-filter
mask
opacity groups
isolation
compositing dependency
fallback promotion
```

The goal is the smallest **safe** fallback subtree, not the smallest DOM node. A local unsupported visual stays local when independent; a visual whose final pixels depend on sibling/ancestor backdrop is promoted to the smallest compositing ancestor that contains the required contributors.

## Compositing Principles

- consume the NODE-19 Render Tree; do not redo wrapper/semantic optimization;
- detect local fallback seeds independently from promotion;
- canvas/video/fallback/unsupported render nodes remain local raster candidates unless coupled by a compositing dependency;
- `mix-blend-mode` and `backdrop-filter` create backdrop/sibling dependencies that can require promotion to the containing compositing subtree;
- `filter`, mask and group opacity create flattening boundaries: a descendant fallback is promoted to the effect owner when split native+raster rendering would change pixels;
- `isolation:isolate` is an explicit dependency stop boundary;
- overlapping/nested promoted boundaries are deterministically merged so the outer safe boundary owns the contained triggers;
- every promotion records reasons, trigger node IDs, confidence and source references;
- the output may revise `WtfRenderNode.renderStrategy` / `renderDecision` but does not change Render Tree hierarchy;
- NODE-21 owns `.wtf` packaging;
- NODE-24 owns Figma capability mapping;
- NODE-28 owns final hybrid native/raster materialization.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-20 formal Exit Gate and squash merge:

```text
NODE-21 — WTF Packager
```
