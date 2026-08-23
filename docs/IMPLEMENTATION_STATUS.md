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
| 17 | Base Layout Analyzer | DONE PENDING MERGE | Exact-head read-only CI #421 PASS | PR #21 |
| 18 | Table Layout Engine | TODO | - | - |
| 19 | Render Tree Optimizer | TODO | - | - |
| 20 | Compositing & Fallback Boundary | TODO | - | - |
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

`NODE-17 — Base Layout Analyzer`

Entry baseline:

```text
7cfb91fedff68a2e5338c62c0fbd46508bd38ad2
```

Working branch:

```text
feat/node-17-base-layout-analyzer
```

## NODE-16 Closure

NODE-16 PR #20 passed exact-head read-only CI #375 (`32629279087`) on final candidate:

```text
f0176d19957d4374d0404c62ab7d95ab91ff772f
```

and was squash merged into `main` as:

```text
7cfb91fedff68a2e5338c62c0fbd46508bd38ad2
```

The merged tree contains no temporary NODE-16 write-enabled bootstrap workflow.

## NODE-17 Frozen Scope

NODE-17 converts captured source/CSS/geometry evidence into frozen W2F IR base layout semantics.

Primary output vocabulary already exists in W2F IR V2:

```text
WtfLayoutModel
WtfLayoutMode
WtfAxisSizing
WtfSizingDecision
WtfFlexContainerModel
WtfFlexItemModel
WtfGridContainerModel
WtfGridItemModel
WtfAbsoluteConstraints
WtfBoxModel
WtfDecisionEvidence
```

NODE-17 owns base semantics for:

```text
flow
flex
grid
absolute/fixed/sticky positioning
inline
contents
base sizing/min/max
padding/overflow
border-box -> padding-box -> content-box normalization
effective spacing from resolved Browser geometry
```

NODE-18 owns table-specific reconstruction. NODE-19 owns render-tree optimization. NODE-20 owns compositing/fallback boundaries.

## Analysis Principles

- authored CSS semantics take precedence over geometry heuristics when available;
- computed layout establishes the active mode but authored values preserve editability intent;
- geometry can strengthen or lower confidence but must not fabricate unavailable authored semantics;
- sizing remains evidence-bearing and may stay `unknown`;
- flex/grid models preserve source direction, wrapping, alignment, tracks, gaps and item placement;
- absolute constraints preserve left/right/top/bottom semantics rather than flattening every node into x/y coordinates;
- Browser border-box geometry is normalized into padding/content boxes from computed border and padding evidence;
- effective flow and single-line flex spacing is derived from resolved child geometry so margin collapse, negative overlap and distributed spacing remain observable;
- `calc(...)`, `clamp(...)`, `min(...)`, `max(...)`, `var(...)` and `env(...)` remain CSS expressions while `fit-content(...)` retains intrinsic HUG semantics;
- table structure is deliberately not inferred in NODE-17;
- all outputs are deterministic and carry confidence/reasons/sourceRefs.

## NODE-17 Validation

Controlled Bootstrap V4 (`32630143011`) completed the full repository `pnpm check` successfully before its final push was rejected only because the remote branch advanced concurrently. The validated tree passed:

```text
NODE-17 foundation guardrail
lint: 17/17 packages
typecheck: 31/31 tasks
layout-analyzer tests: 10/10
browser-extension tests: 59/59
build: 17/17 packages
standard Browser package validation
high-fidelity Browser package validation
Prettier format check
```

The branch then converged to a normal user-authored final candidate with every temporary NODE-17 bootstrap workflow and finalization script removed.

Exact-head read-only CI #421, run `32630253977`, passed on candidate:

```text
7dfaf4581c4e1e1cc0161bb3fbfe9904253a50ca
```

Foundation, frozen-lockfile install, lint, typecheck, tests, build and format check all passed.

NODE-17 Exit Gate: PASS. A documentation-only evidence commit follows and must retain the same exact-head read-only CI result before squash merge.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-17 squash merge:

```text
NODE-18 — Table Layout Engine
```
