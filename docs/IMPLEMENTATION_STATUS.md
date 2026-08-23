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
| 11 | CSS Cascade & Authored Semantics | DONE | Cascade/Token Graph/Standard/CDP/sidecar + formal read-only frozen-lockfile CI PASS | PR #15 ready to merge |
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

NODE-11 started from merged NODE-10 `main` commit:

```text
eb31c82bbbaaf15f740aa19f7d343f8a2d884099
```

Working branch / PR:

```text
feat/node-11-css-cascade-authored-semantics
PR #15
```

PR #15 is ready for review/merge. NODE-12 must not become the active implementation node until NODE-11 is squash merged into `main`.

## NODE-11 Completion

NODE-11 delivers:

- platform-neutral `@w2f/css-cascade`;
- `CssCascadeCapture 1.0.0` sidecar with `RawSnapshot 1.0.0` unchanged;
- authored/computed traces, provenance, `!important` and deterministic cascade hashes;
- explicit non-fabricating `matched-unresolved` evidence;
- existing IR CSS length semantics;
- V2.1 Token Graph definitions/usages/aliases with conservative fail-closed linking;
- Standard CSSOM acquisition for accessible document/Shadow DOM/same-origin iframe authored evidence;
- CDP backend-node matched/computed style acquisition;
- CSS-only Standard fallback without discarding successful CDP RawSnapshot/screenshot evidence;
- bounded acquisition and explicit diagnostics;
- separate Browser IndexedDB sidecar persistence, receipts and cleanup;
- Standard/High Fidelity Chrome runtime package validation.

NODE-11 does not reimplement the browser's complete cascade or variable resolver and does not pull NODE-12 environment orchestration forward.

## NODE-11 Validation

Controlled final-shape authored acquisition/browser integration run:

```text
32617158205
```

passed complete `pnpm check` after removing its temporary workflow from the working tree. Resulting validated bot head:

```text
0473fb18586e458062317a718835d8d7a7eb4b10
```

Formal standard read-only frozen-lockfile documentation/status Exit Gate:

```text
32617337130
```

validated:

```text
21fa12cad809c573a0ea3c43b7284de9b2ef6c23
```

All gates passed: dependency-free foundation validation, frozen install, lint, strict typecheck, complete tests, Standard/High Fidelity build/package validation and pinned Prettier.

## NODE-11 Exit Criteria

- [x] core cascade/length/Token Graph engine
- [x] Standard authored acquisition
- [x] CDP authored acquisition/normalization
- [x] Browser sidecar persistence and cleanup
- [x] both Browser package profiles validate
- [x] controlled complete `pnpm check` passes
- [x] temporary write-enabled workflows absent from resulting tree
- [x] normative implementation document added
- [x] ADR-0011 added
- [x] NODE-11 DoD record added
- [x] formal standard read-only frozen-lockfile docs/status CI passes
- [x] PR #15 marked ready
- [ ] PR #15 squash merged

## NODE-11 / NODE-12 Boundary

NODE-11 preserves authored media-condition provenance/current participation only.

NODE-12 owns environment snapshots, media/container/environment query capture and evaluation, color scheme, reduced motion and related environment state.

## Blockers

No implementation or validation blocker remains. Only exact-head closure CI and squash merge remain.

## Next

After NODE-11 PR #15 squash merge:

```text
NODE-12 — Media / Container / Environment Capture
```
