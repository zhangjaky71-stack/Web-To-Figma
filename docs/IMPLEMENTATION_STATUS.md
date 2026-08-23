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
| 13 | Asset Resolver | IN PROGRESS | Implementation assembled; bootstrap/Exit Gate pending | `feat/node-13-asset-resolver` |
| 14 | Pixel Ground Truth & Raster Engine | TODO | - | - |
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

`NODE-13 — Asset Resolver`

NODE-13 starts from merged NODE-12 `main` commit:

```text
b9cdca4dc4bc68a3a46571451de7a30c7eb13ad6
```

Working branch:

```text
feat/node-13-asset-resolver
```

## NODE-12 Closure

NODE-12 PR #16 passed exact-head read-only CI #310 on its final candidate and was squash merged into `main` as:

```text
b9cdca4dc4bc68a3a46571451de7a30c7eb13ad6
```

The merged tree contains no temporary NODE-12 write-enabled workflow.

## NODE-13 Implementation

NODE-13 currently delivers:

- platform-neutral `@w2f/asset-resolver`;
- `AssetCapture 1.0.0` sidecar while preserving `RawSnapshot 1.0.0` and W2F IR V2;
- image / `<picture>` browser-selected `currentSrc` evidence;
- rendered and intrinsic image dimensions;
- computed CSS image URL acquisition for background/mask/border/generated-content properties;
- inline and external SVG byte evidence;
- `data:` and `blob:` acquisition in page context;
- SHA-256 content identity and deterministic `assets/<sha>.<ext>` package paths;
- byte-level de-duplication with full many-reference Resource Provenance;
- explicit unsupported/missing/oversize/budget diagnostics;
- same-origin iframe/open Shadow DOM source targeting without cross-realm DOM `instanceof` assumptions;
- Browser Web Crypto hashing;
- dedicated AssetCapture IndexedDB persistence;
- Standard and High Fidelity job-path integration;
- unified failure/cancellation cleanup;
- Browser runtime packaging for `@w2f/asset-resolver`;
- dedicated packaged-output NODE-13 validation;
- shared Asset Resolver and Browser runtime/store tests;
- dependency-free NODE-13 guardrail;
- normative Asset Resolver V2 document;
- ADR-0013 and NODE-13 implementation/DoD record.

## NODE-13 Remaining Exit Work

- wire `validate-node-13.mjs` into foundation validation;
- refresh authoritative `pnpm-lock.yaml` for the new workspace package/dependencies;
- run canonical formatting;
- validate Standard and High Fidelity extension packages;
- run complete `pnpm check`;
- remove the temporary write-enabled bootstrap from the final branch tree;
- run exact-head standard read-only frozen-lockfile CI;
- mark PR ready and squash merge.

## Blockers

No product/architecture blocker is known. Remaining work is validation and controlled branch finalization.

## Next

After NODE-13 formal Exit Gate and squash merge:

```text
NODE-14 — Pixel Ground Truth & Raster Engine
```
