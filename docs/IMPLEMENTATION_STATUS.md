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
| 10 | Text / Inline / Pseudo Capture | IN PROGRESS | - | branch `feat/node-10-text-inline-pseudo-capture` |
| 11 | CSS Cascade & Authored Semantics | TODO | - | - |
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

`NODE-10 — Text / Inline / Pseudo Capture`

NODE-10 starts from merged NODE-09 `main` commit:

```text
80a727e301a7d0c47899e486e3a41a2412fc31b3
```

NODE-10 must extend the shared capture evidence model rather than replace the Standard/CDP RawSnapshot boundary.

## NODE-09 Completion

PR #13 was squash merged into `main` as:

```text
80a727e301a7d0c47899e486e3a41a2412fc31b3
```

Final exact-head standard read-only frozen-lockfile CI:

```text
32586751557
```

validated NODE-09 head:

```text
442b1febb22216f96b28b82165512ce3776ef9a4
```

Every formal NODE-09 gate passed, including Standard and High Fidelity Browser package validation.

## NODE-10 Entry Conditions

- [x] NODE-09 PR #13 merged
- [x] shared RawSnapshot supports Standard and CDP adapters
- [x] text DOM nodes and client rect evidence available
- [x] CDP DOMSnapshot evidence available for High Fidelity path
- [x] Region/Redact/Exclude semantics available
- [x] NODE-10 branch created from merged `main`

## Blockers

None at NODE-10 entry.

## Next

Implement NODE-10 Text / Inline / Pseudo Capture against the frozen V2/V2.1 requirements without starting NODE-11 authored CSS cascade work.
