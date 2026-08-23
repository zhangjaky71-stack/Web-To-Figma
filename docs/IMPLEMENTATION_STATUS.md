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
| 14 | Pixel Ground Truth & Raster Engine | IN PROGRESS | Core/Browser integration assembled; Exit Gate pending | `feat/node-14-pixel-ground-truth-raster-engine` |
| 15 | Multi-Viewport Responsive Capture | TODO | - | - |
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

`NODE-14 — Pixel Ground Truth & Raster Engine`

NODE-14 starts from merged NODE-13 `main` commit:

```text
07978a586f7eb215f5e5aba0022cc6b02c1e6d28
```

Working branch:

```text
feat/node-14-pixel-ground-truth-raster-engine
```

## NODE-13 Closure

NODE-13 PR #17 passed exact-head read-only CI #328 on final head:

```text
b817a456da4621da4a996489f65911b488f82f51
```

and was squash merged into `main` as:

```text
07978a586f7eb215f5e5aba0022cc6b02c1e6d28
```

The merged tree contains no temporary NODE-13 write-enabled bootstrap workflow.

## NODE-14 Implementation

Current NODE-14 branch delivers:

- platform-neutral `@w2f/pixel-ground-truth`;
- additive `PixelGroundTruth 1.0.0` sidecar;
- frozen `WtfReferenceTileDescriptor` reuse without Schema/IR major-version change;
- deterministic unified 2048×2048 device-pixel Tile Model;
- DPR-aware document-CSS tile bounds with exact edge closure;
- SHA-256 content-addressed `references/<sha256>.png` resources;
- tile-byte deduplication while preserving reference geometry;
- mandatory complete viewport reference validation;
- mandatory High Fidelity full-page tiled reference for document capture;
- Standard `captureVisibleTab → createImageBitmap → OffscreenCanvas` viewport capture;
- High Fidelity direct CDP `Page.captureScreenshot` clip tiling;
- explicit incomplete/missing tile diagnostics;
- NODE-13 asset failure → node-level raster fallback bridge;
- canvas/WebGL render-surface visual capture without mutating context probes;
- video current-frame visual capture;
- Standard off-viewport fail-visible behavior rather than scroll-and-stitch fabrication;
- dedicated Pixel Ground Truth IndexedDB persistence;
- capture receipt metrics and unified transaction cleanup;
- Browser runtime packaging for `@w2f/pixel-ground-truth`;
- Standard/High Fidelity NODE-14 packaged-output validator;
- shared core tests and Browser runtime/store tests;
- normative Pixel Ground Truth & Raster V2 document;
- ADR-0014 and NODE-14 implementation record;
- dependency-free NODE-14 guardrail.

## NODE-14 Remaining Exit Work

- wire `validate-node-14.mjs` into foundation validation;
- refresh authoritative `pnpm-lock.yaml` for the new workspace package/dependency;
- run canonical formatting;
- resolve any compiler/test/package findings from full `pnpm check`;
- remove temporary write-enabled bootstrap from the final branch tree;
- run exact-head standard read-only frozen-lockfile CI;
- mark PR ready and squash merge.

## Blockers

No product/architecture blocker is known. Remaining work is controlled validation/finalization.

## Next

After NODE-14 formal Exit Gate and squash merge:

```text
NODE-15 — Multi-Viewport Responsive Capture
```
