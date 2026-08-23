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
| 10 | Text / Inline / Pseudo Capture | DONE | Text/fragment/pseudo/form behavior + Standard/High Fidelity package + standard read-only frozen-lockfile CI PASS | PR #14 ready to merge |
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

NODE-10 started from merged NODE-09 `main` commit:

```text
80a727e301a7d0c47899e486e3a41a2412fc31b3
```

PR:

```text
#14 — feat(node-10): implement Text Inline Pseudo Capture
```

PR #14 is ready for review/merge. NODE-11 must not become the active implementation node until NODE-10 is squash merged into `main`.

## NODE-10 Completion

NODE-10 extends the shared adapter-neutral `RawSnapshot 1.0.0` with:

- text-run evidence;
- rendered text-fragment geometry;
- baseline provenance/confidence;
- inline/ruby fragment evidence;
- `::before` / `::after` / `::marker` pseudo evidence;
- safe form-control visual state.

Standard capture uses DOM Range/client-rect and computed-style evidence. CDP normalization preserves repeated DOMSnapshot layout/text evidence and maps it into the same shared contract.

Live input/textarea textual values remain outside the evidence contract. CDP `inputValue` / `textValue` runtime fields are not consumed, and sensitive `INPUT`/`TEXTAREA` `value` attributes remain filtered.

NODE-11 authored cascade semantics were not pulled forward into NODE-10.

## NODE-10 Validation

Controlled final-shape full repository validation:

```text
32615130105
```

The one-time format workflow removed itself from the working tree before the complete `pnpm check`, and that final-shape check passed.

Formal standard read-only frozen-lockfile documentation/status Exit Gate:

```text
32615395336
```

Validated head:

```text
3a3a89b005b6e919074614bb52ea0393cff8e186
```

Every formal gate passed:

- NODE-08/NODE-09/NODE-10/global foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- lint;
- strict TypeScript typecheck;
- complete test suite including NODE-10 behavior fixtures;
- Standard Browser package build/validation;
- High Fidelity Browser package build/validation;
- pinned Prettier 3.9.6 format check.

## NODE-10 Exit Criteria

- [x] implementation complete
- [x] actual CDP text/fragment/pseudo/form behavior fixture passes
- [x] temporary write-enabled bootstrap/recovery workflows removed
- [x] one-time canonical-format workflow removed from resulting branch
- [x] normative implementation document added
- [x] ADR added
- [x] NODE-10 DoD record added
- [x] formal standard read-only frozen-lockfile docs/status CI passes
- [x] PR #14 marked ready
- [ ] PR #14 squash merged

## Blockers

No implementation or validation blocker remains. Only the squash merge of PR #14 remains.

## Next

After NODE-10 PR #14 squash merge:

```text
NODE-11 — CSS Cascade & Authored Semantics
```

NODE-11 must build authored selector/cascade/custom-property semantics on top of the computed/browser-observed evidence already captured by NODE-08 through NODE-10, without weakening the existing privacy or adapter-neutral RawSnapshot boundaries.
