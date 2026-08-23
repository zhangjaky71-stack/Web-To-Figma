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
| 11 | CSS Cascade & Authored Semantics | IN PROGRESS | Entry baseline frozen | branch `feat/node-11-css-cascade-authored-semantics` |
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

Working branch:

```text
feat/node-11-css-cascade-authored-semantics
```

## NODE-10 Completion

PR #14 was squash merged into `main` as:

```text
eb31c82bbbaaf15f740aa19f7d343f8a2d884099
```

Final exact-head standard read-only frozen-lockfile CI:

```text
32615506313
```

validated NODE-10 head:

```text
f82711f5959505a82c72f6afc91bde7cce5c1b60
```

Every final gate passed, including NODE-10 behavior fixtures, Standard and High Fidelity Browser package validation, and pinned format checking.

## NODE-11 Frozen Scope

V2 roadmap requires NODE-11 to implement:

```text
computed
authored
variables
media
important
cascade trace
CSS length semantic model
```

V2.1 adds the hard requirement to preserve a **Token Graph** for CSS Custom Properties, including definitions, usages, aliases/references, raw/authored values, browser-resolved values, scope/provenance and confidence.

Boundary with NODE-12:

- NODE-11 owns authored cascade structure and the media-condition provenance needed to explain why a declaration participates in the cascade;
- NODE-12 owns environment snapshots plus media/container query evaluation across captured environments;
- NODE-11 must not grow into responsive multi-environment orchestration.

NODE-11 must build on the browser-observed computed evidence captured by NODE-08 through NODE-10. It must not replace that evidence, fabricate unavailable authored sources, or reimplement the browser's full CSS variable resolver.

## NODE-11 Entry Conditions

- [x] NODE-10 PR #14 squash merged
- [x] final NODE-10 exact-head read-only CI passed
- [x] shared RawSnapshot Standard/CDP boundary stable
- [x] computed text/inline/pseudo/form visual evidence available
- [x] Token Graph schema reservation already exists in V2.1 contracts
- [x] NODE-11 branch created from merged `main`

## Blockers

None at NODE-11 entry.

## Next

Implement NODE-11 CSS Cascade & Authored Semantics against the frozen V2/V2.1 scope, beginning with an adapter-neutral authored-cascade/Token-Graph contract and deterministic CSS length semantics before Browser acquisition integration.
