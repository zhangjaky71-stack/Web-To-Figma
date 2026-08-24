# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-24

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
| 25 | Basic Figma Renderer | EXIT GATE CANDIDATE | Bootstrap CI #638 full `pnpm check` PASS; exact-head CI pending | PR #29; candidate `9b07b67f` |
| 26 | Text / Font / Asset / Paint Renderer | TODO | - | - |
| 27 | Figma Responsive Layout Renderer | TODO | - | - |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-25 — Basic Figma Renderer`

Entry baseline:

```text
e9e4d1e92fa1db7c6e5c050f1b55ed39f688d354
```

Working branch / PR:

```text
feat/node-25-basic-figma-renderer
PR #29
```

## NODE-24 Closure

NODE-24 PR #28 passed exact-head read-only CI #630 (`32675390107`) on:

```text
7ad4a38ebd5297d93b3078b049471c02e02775e0
```

and was squash merged into `main` as:

```text
e9e4d1e92fa1db7c6e5c050f1b55ed39f688d354
```

The merged tree provides the versioned Figma Capability Registry and deterministic `NATIVE / EMULATED / WRAPPER / ABSOLUTE / RASTER / UNSUPPORTED` policy boundary across Fidelity, Balanced and Design Friendly profiles while preserving revision/stable-source/literal-token invariants.

## NODE-25 Frozen Scope

V2 limits NODE-25 to:

```text
root
frames
hierarchy
geometry
naming
pluginData
z-order
```

Text/font/assets/paint remain NODE-26. Auto Layout/Grid/responsive sizing remain NODE-27. Hybrid/raster execution remains NODE-28.

## NODE-25 Implementation

`packages/figma-renderer` separates deterministic planning from Figma mutation through an adapter contract.

The planner validates the Render Tree before mutation, preserves fractional geometry and converts page coordinates to parent-local coordinates without rounding. Render Tree `childIds` order remains authoritative for Figma sibling z-order.

The real Figma adapter creates neutral Frame/Rectangle basics only. A temporary `__W2F_IMPORTING__` root owns the transaction: successful imports are finalized/selected/focused, while fatal adapter failures delete that root so partial imports do not remain in the document.

Compact pluginData carries identity, source/stable mapping, render strategy, revision hashes, document revision identity, RenderProfile and literal-token policy. Full IR is not stored in pluginData.

Whole Page and Selected Sections both consume data only after NODE-23 secure parsing. Canvas Drop coordinates are preserved as the import destination when present.

## NODE-25 Bootstrap Closure

The first Bootstrap pass correctly exposed historical NODE-22/NODE-23 guardrails that still asserted rendering could never advance. Those guardrails were narrowed without weakening their intake/parser security responsibilities.

Controlled Bootstrap CI #638 (`32680383507`) then completed the NODE-25 closure successfully and pushed validated candidate:

```text
9b07b67f20a8f67caacda94ee93d4d5b6d16e2f5
```

The successful closure validated:

- permanent NODE-25 foundation gate;
- refreshed frozen workspace lockfile;
- repository-wide lint;
- strict TypeScript typecheck including Figma typings;
- renderer and protocol tests;
- repository-wide build including Figma bundle/package validation;
- format check.

Before candidate handoff the temporary write-enabled Bootstrap workflow/finalizer/failure log were removed and normal read-only CI was restored.

## Blockers

No product/architecture blocker is known.

## Next

Run exact-head read-only frozen-lockfile CI on the normal evidence commit. Only after that exact head is fully green may PR #29 be marked Ready and squash merged to `main`, after which NODE-26 begins.
