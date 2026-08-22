# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-22

## Roadmap

| NODE | Name | Status | Validation | Commit/PR |
|---|---|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE | PASS | PR #3 merged |
| 01 | Monorepo Foundation | DONE | Frozen-lockfile GitHub Actions PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile GitHub Actions PASS | PR #6 merged |
| 03 | W2F IR V2 | DONE | Roundtrip/migration/reference validation + frozen-lockfile GitHub Actions PASS | PR #7 |
| 04 | Stable Identity & Source Mapping | NEXT | - | - |
| 05 | Browser Extension Shell | TODO | - | - |
| 06 | Source Providers & Offline | TODO | - | - |
| 07 | Region Selector & Redaction | TODO | - | - |
| 08 | Standard DOM Capture | TODO | - | - |
| 09 | CDP High Fidelity Adapter | TODO | - | - |
| 10 | Text / Inline / Pseudo Capture | TODO | - | - |
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

`NODE-04 — Stable Identity & Source Mapping`

## NODE-03 Completion

NODE-03 froze the shared Semantic IR between normalized browser capture and downstream render/capability logic.

Implemented in `packages/w2f-ir`:

- IR version `2.0.0` and canonical deterministic envelope;
- Source Graph with source/composed relationship evidence;
- Render Tree with explicit Source→Render mapping and section outline;
- stable-identity and revision hooks;
- V2.1 Structural Fingerprint / Scroll Root / Composed Tree / Token Graph integration;
- double-precision browser geometry and box model;
- authored CSS semantic lengths plus resolved pixel truth;
- layout modes, sizing semantics and confidence/reason evidence;
- flex/grid/absolute layout data;
- paint, gradient, border, shadow, blend/filter/mask metadata;
- semantic text runs plus browser line-fragment/baseline evidence;
- font metadata and asset records;
- capture environment, visual states and animation-capture mode;
- responsive snapshots/rules, media traces and container-query metadata;
- structured diagnostic domains and severities;
- runtime cross-payload/reference validation;
- deterministic encode/decode roundtrip;
- known flat-V2-draft migration gate and unsupported-version rejection.

Browser Extension and Figma Plugin both consume `@w2f/w2f-ir` via `workspace:*`; there is no app-specific duplicate IR.

NODE-03 also corrected the monorepo task graph so consumer `typecheck` waits for both upstream `^build` and `^typecheck`, which is required by the multi-level dependency chain:

```text
Browser / Figma
→ w2f-ir
→ w2f-schema
```

## NODE-03 Validation

Bootstrap validation exposed and resolved two real integration issues:

1. migration `fromVersion` needed an explicit `string` type rather than the literal `"2.0.0"`;
2. multi-level workspace consumers needed upstream declaration builds before typecheck.

After those fixes, the bootstrap pipeline passed and committed canonical Prettier output plus the authoritative updated `pnpm-lock.yaml` in commit:

```text
0b252f64c30296332244e4c43c48126af53dedc0
```

The temporary bootstrap CI was then removed and the normal read-only quality workflow restored with:

```text
pnpm install --frozen-lockfile
```

GitHub Actions run `32564946698` passed on the completed NODE-03 branch with:

- foundation validation: **PASS**;
- Node.js 24 / pnpm 11.22.0: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Vitest: **PASS**;
- build: **PASS**;
- Prettier format check: **PASS**.

Normative documentation:

- `docs/WTF_IR_V2.md`;
- `docs/adr/ADR-0003-source-graph-render-tree-and-ir-boundaries.md`;
- `docs/nodes/NODE-03_WTF_IR_V2.md`.

## NODE-03 Exit Criteria

- [x] shared Semantic IR package
- [x] Source Graph
- [x] Render Tree
- [x] Source→Render mapping
- [x] layout/paint/text/assets/state/responsive/diagnostic IR
- [x] V2.1 reservations integrated
- [x] deterministic codec
- [x] runtime cross-reference validation
- [x] roundtrip tests
- [x] migration tests
- [x] Browser/Figma shared IR consumption
- [x] authoritative lockfile updated
- [x] bootstrap workflow removed
- [x] frozen-lockfile CI restored
- [x] frozen-lockfile CI passes

## Blockers

None.

## Next

Proceed to `NODE-04 — Stable Identity & Source Mapping`.

NODE-04 will implement stable node identity, confidence/evidence scoring, document/capture identity behavior, deterministic source mapping and repeat-capture stability fixtures using the hooks frozen by NODE-02/NODE-03.
