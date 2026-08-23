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
| 15 | Multi-Viewport Responsive Capture | IN PROGRESS | Implementation starting from merged NODE-14 | `feat/node-15-multi-viewport-responsive-capture` |
| 16 | Responsive Inference Engine | TODO | - | - |
| 17 | Base Layout Analyzer | TODO | - | - |
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

`NODE-15 — Multi-Viewport Responsive Capture`

Entry baseline:

```text
6bb5fe537d9dfbcf4cbb32b5223979ea15f019b8
```

Working branch:

```text
feat/node-15-multi-viewport-responsive-capture
```

## NODE-14 Closure

NODE-14 PR #18 passed exact-head read-only CI #337 (`32624954690`) on final candidate `78fa1f0a2d2c717d480d50a2338e99c7253cdf66` and was squash merged into `main` as:

```text
6bb5fe537d9dfbcf4cbb32b5223979ea15f019b8
```

The merged tree contains no temporary NODE-14 write-enabled bootstrap workflow.

## NODE-15 Frozen Scope

NODE-15 implements only:

```text
responsive snapshot mode
multiple viewport capture
snapshot orchestration
stable node matching inputs
```

The frozen common candidates are:

```text
1440
1280
1024
768
390
```

The reduced default preset is:

```text
1440 / 768 / 390
```

NODE-15 captures evidence. NODE-16 owns cross-snapshot matching/inference, breakpoint detection, FILL/HUG/FIXED, visibility/layout transitions and rule confidence.

## Implementation Direction

- additive `ResponsiveCapture 1.0.0` sidecar;
- reuse frozen `WtfResponsiveSnapshotRef` rather than version-bump W2F Schema/IR;
- deterministic viewport plan and child-artifact identities;
- High Fidelity synthetic multi-viewport orchestration with mandatory device-metrics cleanup/restore;
- Standard profile remains current-viewport capable and does not mutate the browser window to fabricate responsive evidence;
- each responsive snapshot preserves RawSnapshot/CSS/Environment/Assets/Pixel Ground Truth references;
- stable identity assignments/signals are preserved as NODE-16 matching inputs without performing cross-snapshot inference;
- bounded viewport count/dimensions and fail-visible diagnostics;
- cancellation/failure cleanup covers every child snapshot artifact.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-15 formal Exit Gate and squash merge:

```text
NODE-16 — Responsive Inference Engine
```
