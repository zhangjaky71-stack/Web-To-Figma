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
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head read-only CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head read-only CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head read-only CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head read-only CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | IN PROGRESS | Bootstrap V3 full `pnpm check` PASS; exact-head read-only CI pending | PR #22 |
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

`NODE-18 — Table Layout Engine`

Entry baseline:

```text
0b1032611fcf2f29bed38d7a629f75090d9d824d
```

Working branch:

```text
feat/node-18-table-layout-engine
```

## NODE-17 Closure

NODE-17 PR #21 passed exact-head read-only CI #422 (`32630298557`) on final candidate:

```text
a15e3d8a722c723c31f8042cf53bd13186119aec
```

and was squash merged into `main` as:

```text
0b1032611fcf2f29bed38d7a629f75090d9d824d
```

The final tree contains the canonical `@w2f/layout-analyzer`, Browser layout sidecar integration, complete box-model normalization and resolved effective spacing; temporary NODE-17 bootstrap/finalization files were removed before merge.

## NODE-18 Frozen Scope

The V2 Baseline defines a dedicated `packages/table-layout-engine` covering:

```text
table
thead
tbody
tfoot
tr
td
th
caption
rowspan
colspan
border-collapse
border-spacing
table-layout
```

NODE-18 reconstructs semantic table rows/cells and an occupancy grid from captured source hierarchy, attributes, computed/authored CSS and resolved geometry.

## Table Principles

- source table semantics are preserved rather than flattened into generic flow nodes;
- `rowspan` and `colspan` are parsed as positive spans and applied through deterministic occupancy placement;
- HTML `rowspan="0"` spans to the end of its captured row group, not across later groups;
- malformed/overlapping spans remain fail-visible diagnostics rather than silently shifting unrelated cells;
- row groups (`thead`/`tbody`/`tfoot`) and `caption` remain explicit semantic boundaries;
- `border-collapse`, `border-spacing`, `table-layout`, and `caption-side` are retained as computed CSS evidence in Standard and CDP paths even when no authored declaration exists;
- row/column tracks are derived from resolved Browser cell geometry when boundaries are available;
- simple regular tables are suitable for Grid/row-stack rendering downstream;
- complex spans are eligible for Grid/Absolute hybrid rendering while preserving semantic cells;
- incomplete geometry preserves semantic cells and becomes an absolute-semantic candidate rather than fabricated Grid structure;
- visual mismatch alone must not cause unconditional rasterization;
- NODE-19 owns wrapper elimination/semantic render-tree optimization;
- NODE-20 owns compositing/fallback promotion;
- Figma rendering decisions remain downstream.

## NODE-18 Validation

Controlled Bootstrap V3, run `32631457092`, passed the complete repository `pnpm check` and successfully pushed the validated integration as:

```text
7ab3eec9c7e9e989138eed94bc9faed5abe00e23
```

The validated candidate includes:

```text
NODE-18 foundation guardrail
18/18 package lint
strict TypeScript/typecheck
Table Layout Engine fixtures for regular tables, row groups, rowspan/colspan, malformed spans, occupancy and geometry tracks
Browser table runtime/store tests
Standard and CDP computed table CSS evidence
Standard and High Fidelity Browser package validation
build and format checks
```

All temporary NODE-18 bootstrap workflows and the finalization script were removed from the candidate tree before validation/commit.

The bot-triggered follow-up CI #448 was `action_required` with no authoritative read-only jobs. This documentation-only evidence commit is used to trigger the final exact-head read-only frozen-lockfile CI.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-18 formal Exit Gate and squash merge:

```text
NODE-19 — Render Tree Optimizer
```
