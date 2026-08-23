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
| 10 | Text / Inline / Pseudo Capture | DONE | Text/fragment/pseudo/form behavior + Standard/High Fidelity package + exact-head read-only frozen-lockfile CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | IN PROGRESS | Core/Standard/CDP/Token Graph/Browser sidecar controlled `pnpm check` PASS; formal read-only docs/status Exit Gate pending | PR #15 draft |
| 12 | Media / Container / Environment Capture | TODO | - | - |
| 13 | Asset Resolver | TODO | - | - |
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

`NODE-11 — CSS Cascade & Authored Semantics`

NODE-11 starts from merged NODE-10 `main` commit:

```text
eb31c82bbbaaf15f740aa19f7d343f8a2d884099
```

Working branch / PR:

```text
feat/node-11-css-cascade-authored-semantics
PR #15
```

## NODE-11 Delivered Functional Scope

Shared package:

```text
@w2f/css-cascade
```

implements:

- adapter-neutral authored/computed cascade evidence;
- deterministic property/candidate ordering and cascade hash;
- `!important` preservation;
- explicit `winner`, `overridden`, `inactive-condition`, `matched-unresolved` status vocabulary;
- existing IR CSS length semantic model;
- V2.1 Token Graph definitions/usages/aliases;
- conservative fail-closed token linking;
- `CssCascadeCapture 1.0.0` sidecar validation/summarization.

RawSnapshot remains:

```text
1.0.0
```

and is not expanded with authored cascade data.

Browser acquisition now includes:

- Standard accessible CSSOM/computed-style authored evidence;
- same-origin iframe and open Shadow DOM source-hint integration;
- media-condition provenance/current participation;
- CDP backend-node to matched/computed CSS evidence;
- CSS-only fallback to Standard acquisition without discarding successful CDP RawSnapshot/screenshot evidence;
- bounded acquisition with explicit diagnostics;
- separate IndexedDB CSS sidecar persistence;
- receipt counts/adapter/storage key;
- cancellation/failure cleanup;
- Standard and High Fidelity runtime package validation.

## NODE-11 Validation

Controlled authored acquisition/browser integration bootstrap:

```text
32617158205
```

The temporary workflow removed itself from the working tree before running the complete repository check.

The check passed:

- NODE-08/NODE-09/NODE-10/NODE-11/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- ESLint;
- strict TypeScript typecheck;
- complete Vitest suite including NODE-11 sidecar and Browser normalization fixtures;
- Standard Browser build/package validation;
- High Fidelity Browser build/package validation;
- pinned Prettier 3.9.6 format check.

Validated resulting bot head:

```text
0473fb18586e458062317a718835d8d7a7eb4b10
```

The temporary write-enabled workflow is absent from that resulting tree.

## NODE-11 Remaining Exit Criteria

- [x] core cascade/length/Token Graph engine
- [x] Standard authored acquisition
- [x] CDP authored acquisition/normalization
- [x] Browser sidecar persistence and cleanup
- [x] both Browser package profiles validate
- [x] controlled complete `pnpm check` passes
- [x] temporary write-enabled runtime bootstrap removed from resulting tree
- [x] normative implementation document added
- [x] ADR-0011 added
- [x] NODE-11 DoD record added
- [ ] formal standard read-only frozen-lockfile documentation/status CI passes
- [ ] PR #15 marked ready
- [ ] PR #15 squash merged

## NODE-11 / NODE-12 Boundary

NODE-11 preserves authored media-condition provenance and current participation evidence only.

NODE-12 owns:

- environment snapshots;
- media-query environment capture/evaluation across snapshots;
- container query evidence;
- color scheme / reduced motion / environment state capture.

NODE-12 must not begin until NODE-11 PR #15 is squash merged into `main`.

## Blockers

No known functional implementation blocker remains. Formal read-only documentation/status Exit Gate is pending.

## Next

After NODE-11 merge:

```text
NODE-12 — Media / Container / Environment Capture
```
