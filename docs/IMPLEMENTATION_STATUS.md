# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts + High-Fidelity Capture/Import Acceptance Standard  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-25

## Roadmap

| NODE | Name | Status | Validation | Commit/PR |
|---|---|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE | PASS | PR #3 merged |
| 01 | Monorepo Foundation | DONE | Frozen-lockfile CI PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile CI PASS | PR #6 merged |
| 03 | W2F IR V2 | DONE | IR roundtrip/reference + frozen-lockfile CI PASS | PR #7 merged |
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping PASS | PR #8 merged |
| 05 | Browser Extension Shell | DONE | MV3 package + CI PASS | PR #9 merged |
| 06 | Source Providers & Offline | DONE | Runtime/package + CI PASS | PR #10 merged |
| 07 | Region Selector & Redaction | DONE | Runtime/package + CI PASS | PR #11 merged |
| 08 | Standard DOM Capture | DONE | Capture/runtime/package + CI PASS | PR #12 merged |
| 09 | CDP High Fidelity Adapter | DONE | Dual-profile/runtime/package + CI PASS | PR #13 merged |
| 10 | Text / Inline / Pseudo Capture | DONE | Exact-head read-only CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | DONE | Exact-head read-only CI PASS | PR #15 merged as `6e303818` |
| 12 | Media / Container / Environment Capture | DONE | Exact-head CI #310 PASS | PR #16 merged as `b9cdca4d` |
| 13 | Asset Resolver | DONE | Exact-head CI #328 PASS | PR #17 merged as `07978a58` |
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | DONE | Exact-head CI #449 PASS | PR #22 merged as `7cd56101` |
| 19 | Render Tree Optimizer | DONE | Exact-head CI #477 PASS | PR #23 merged as `030f433a` |
| 20 | Compositing & Fallback Boundary | DONE | Exact-head CI #503 PASS | PR #24 merged as `f0d10cdb` |
| 21 | WTF Packager | DONE | Exact-head CI #540 PASS | PR #25 merged as `5395d1eb` |
| 22 | Figma Plugin Shell & File Intake | DONE | Exact-head CI #571 PASS | PR #26 merged as `84ebc5ed` |
| 23 | Secure Parser & Migration | DONE | Exact-head CI #624 PASS | PR #27 merged as `23cad572` |
| 24 | Figma Capability Resolver | DONE | Exact-head CI #630 PASS | PR #28 merged as `e9e4d1e9` |
| 25 | Basic Figma Renderer | DONE | Bootstrap CI #638 + exact-head CI #640 PASS | PR #29 merged as `35d9a18b` |
| 26 | Text / Font / Asset / Paint Renderer | DONE | Exact-head CI #651 PASS | PR #31 merged as `f6247ddc` |
| 27 | Figma Responsive Layout Renderer | DONE | Exact-head CI #667 PASS | PR #32 merged as `4aef2daa` |
| 28 | Hybrid Native / Raster Renderer | DONE | Exact-head CI #685 PASS | PR #33 merged as `ec880c4f` |
| 29 | Visual / Structure / Editability QA | DONE | Core CI #697 + closure CI #704 PASS | PR #35 + PR #36, merge `4f5c0ed3` |
| 30 | Responsive / Determinism / Performance QA | IMPLEMENTING | Candidate CI pending | PR #37 / `node-30-responsive-determinism-performance-qa` |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-30 — Responsive / Determinism / Performance QA`

Entry baseline:

```text
4f5c0ed3fa3ab2049b4516eab5f3e80388d87b90
```

Working branch:

```text
node-30-responsive-determinism-performance-qa
```

Draft pull request:

```text
PR #37
```

## NODE-29 Closure

NODE-29 was completed in two merge steps:

1. PR #35 merged the platform-neutral visual/structure/editability scoring core, Figma scene inspection and permanent NODE-29 QA guardrail after exact-head CI #697 passed.
2. PR #36 closed the operational Pixel Ground Truth runtime gap: validated local `full-page` reference tiles are compared against Figma `SliceNode` tile exports in the plugin UI, results are persisted as `w2f.qa.visual*` evidence, and the entire path remains network-free.

PR #36 exact-head CI #704 passed foundation/NODE-27/NODE-28/NODE-29 validators, frozen install, lint, typecheck, full tests, build, packaged Figma plugin validation and format checks. It merged to `main` as:

```text
4f5c0ed3fa3ab2049b4516eab5f3e80388d87b90
```

NODE-30 must preserve this closure. Its PR merge-ref is authoritative and must include the latest `main` before NODE-30 is considered valid.

## NODE-30 Frozen Scope

The authoritative source is `docs/ACCEPTANCE_CONTRACT_V2.md`. NODE-30 does not lower or reinterpret release thresholds.

### 1. Responsive QA

Supported responsive deterministic fixtures require:

```text
composite responsive score >= 90%
```

Required evidence covers FILL/HUG/FIXED sizing, spacing, min/max sizing, flex/grid relationships, constraints, breakpoint/visibility/layout changes and container-query metadata. Structural breakpoint changes that Figma cannot execute still have to be detected and reported.

NODE-30 reuses NODE-15 multi-viewport evidence, NODE-16 inference semantics, NODE-27 Figma layout reconstruction and NODE-29 single-import QA rather than re-inferring CSS from screenshots.

### 2. Determinism QA

For deterministic fixtures captured under the same environment, the gate requires exactly the contract's minimum evidence of ten repeated runs. Across the run set:

```text
asset hashes identical
normalized Source Graph hashes identical
normalized Render Tree hashes identical
stable identities identical
layout decisions/reasons identical
```

Intentionally volatile metadata must be named explicitly before exclusion from canonical hashing. Fewer than ten runs are `UNAVAILABLE`, never `PASS`.

### 3. Performance / Scale QA

Functional scale gates are frozen by the Acceptance Contract:

```text
<2k       normal path
2k-5k     normal path
5k-10k    chunking- or progress-capable path
10k-20k   must complete without fatal crash; chunking/warning allowed
20k-50k   warning + section/simplified recommendation
>50k      explicit confirmation or section/simplified strategy
```

A deterministic 10k-node benchmark that routinely crashes capture/import is release-blocking.

Hard millisecond budgets are not invented. NODE-30 first records benchmark durations, median and p95 on a declared benchmark environment; any hard-ms calibration must be backed by that evidence and documented before it can become a release gate.

## Current Implementation

The branch already contains an initial platform-neutral implementation:

- canonical deterministic fingerprint support;
- responsive QA scorer and fixture adapter;
- ten-run determinism evaluator and IR adapter;
- performance scale evaluator and benchmark timer adapter;
- NODE-30 unit/integration tests;
- `docs/nodes/NODE-30_RESPONSIVE_DETERMINISM_PERFORMANCE_QA.md`.

Before merge, this implementation must be reviewed against the frozen contract, connected to permanent validation, tested against the latest NODE-29 Pixel QA closure and validated by exact-head CI.

## Implementation Plan

1. normalize the initial NODE-30 scorer methodology against the approved contract;
2. preserve latest NODE-29 Pixel QA closure in PR merge-ref validation;
3. add benchmark fixture orchestration for responsive, ten-run determinism and scale evidence;
4. add permanent `validate-node-30.mjs` and CI wiring;
5. calibrate hard-ms budgets only if benchmark evidence is sufficient and reproducible;
6. run exact-head CI without weakening NODE-27/28/29 validators;
7. merge PR #37 only after all gates are green.

## Next

Complete NODE-30 and then begin NODE-31 Real-world Compatibility & Release Candidate.
