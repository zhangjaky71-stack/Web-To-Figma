# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts + High-Fidelity Capture/Import Acceptance Standard  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-28

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
| 30 | Responsive / Determinism / Performance QA | DONE | Exact-head CI #715 PASS | PR #37 merged as `28b52dc3` |
| 31 | Real-world Compatibility & Release Candidate | IMPLEMENTING | P0 audit: 3 blockers remain; exact-head read-only CI #886 PASS | `node-31-real-world-compatibility-release-candidate` |

## Current Node

`NODE-31 — Real-world Compatibility & Release Candidate`

Entry baseline:

```text
28b52dc3e0d3074bf76205c8deb324a06dfe9e23
```

Working branch:

```text
node-31-real-world-compatibility-release-candidate
```

## NODE-30 Closure

NODE-30 merged through PR #37 after exact-head CI #715 passed the permanent Foundation/NODE-27/NODE-28/NODE-29/NODE-30 validators, frozen dependency install, lint, strict typecheck, full tests, build/package validation and format checks.

Merge commit:

```text
28b52dc3e0d3074bf76205c8deb324a06dfe9e23
```

NODE-30 adds and freezes the final repeatable pre-release QA layer:

- supported responsive deterministic fixtures require composite fidelity >=90%;
- responsive evidence covers FILL/HUG/FIXED sizing, spacing, min/max sizing, flex/grid relationships, constraints, breakpoints/visibility/layout changes and container-query metadata;
- responsive composite math uses the documented arithmetic mean of active domains rather than hidden priority weights, while required-domain evidence cannot silently disappear;
- determinism requires 10 same-environment runs with identical asset hashes, normalized Source Graph, Render Tree, stable identities and layout decisions/reasons;
- performance functional scale bands are enforced from <2k through >50k render nodes;
- a permanent real 10k renderer benchmark constructs 10,000 RenderNodes and SourceNodes and verifies five measured `renderBasicFigmaScene` runs complete without fatal crash;
- timing aggregation is scoped to one declared benchmark environment and does not invent a cross-environment SLA.

Observed 10k calibration evidence on `linux-x64-node-24.19.0-memory-figma-v1`:

```text
CI #712   median 243.32 ms   p95 269.11 ms   PASS
CI #714   median 156.20 ms   p95 748.69 ms   PASS
CI #715   median 155.42 ms   p95 318.58 ms   PASS
```

The hosted-runner p95 variation and in-memory Figma adapter boundary are insufficient to justify a product hard-ms release gate, so `calibratedHardBudgetMs` correctly remains `null`. NODE-31 may collect production-environment evidence but must not reinterpret these values as a product SLA.

## NODE-31 Entry Rules

NODE-31 is the Release Candidate closure node. It must consume the frozen Acceptance Contract and existing node evidence instead of lowering thresholds or creating screenshot-only shortcuts.

Before implementation, NODE-31 must extract the exact real-world corpus, compatibility-matrix, known-limitations, package/release and final acceptance requirements from `docs/ACCEPTANCE_CONTRACT_V2.md` and related implementation documents. No acceptance threshold may be invented or weakened for convenience.

The node must preserve:

- NODE-29 visual / structure / editability / anti-over-rasterization gates;
- NODE-30 responsive / same-environment determinism / scale gates;
- local `.wtf` evidence and no unauthorized external fetching during Figma import/QA;
- editable native output for supported text/vector/layout/image content;
- explicit reporting of unsupported/degraded features instead of hiding them as PASS.

## NODE-31 Current Closure Status

The fail-closed P0 audit is anchored to real-browser evidence and remains `UNAVAILABLE` overall. Exact-head read-only CI #886 validates the current repository state with all permanent validators, lint, typecheck, full tests, build/package checks, five NODE-31 runtime gates and format checks passing.

`visual-state-freeze-and-restore` is now PASS based on the final built visual-state runtime executing in real Chrome and proving CSS/WAAPI animations plus open-ShadowRoot media freeze during capture and restore afterward without permanent DOM/inline-state mutation.

Three P0 blockers remain and must not be treated as PASS until direct evidence exists:

1. `file-protocol-explicit-permission`;
2. `geometry-preserving-correction-policy`;
3. `raster-text-only-when-policy-justifies`.

## Next

Close the remaining three P0 blockers without weakening the frozen acceptance contract, beginning with real unpacked-extension `file://` permission/capture evidence, then finish the font geometry-correction and raster-text justification policies. Merge only after the final exact-head Release Candidate gates are green.
