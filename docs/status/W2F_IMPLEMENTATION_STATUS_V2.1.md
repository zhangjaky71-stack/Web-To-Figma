# W2F Implementation Status

**Export Package Format:** `.wtf` (`application/x-wtf`)  

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-01 — Monorepo Foundation  
**Date:** 2026-08-21

## Baseline Documents

1. `docs/PRODUCT_BASELINE_V2.md`
2. `docs/ACCEPTANCE_CONTRACT_V2.md`
3. `docs/CAPTURE_SEMANTICS.md`
4. `docs/KNOWN_LIMITATIONS.md`
5. `docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md` (reassembled canonical form)
6. `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md`
7. `docs/adr/ADR-0000-architecture-baseline-freeze.md`

## Core V2.1 Schema Reservations

- Token Graph
- Structural Fingerprint
- Incremental Merge Metadata
- Scroll Root Model
- Composed Tree Mapping
- Geometry Precision Policy

## Main Roadmap

| NODE | Name | Status |
|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE |
| 01 | Monorepo Foundation | READY |
| 02 | W2F File Spec V2 | TODO |
| 03 | W2F IR V2 | TODO |
| 04 | Stable Identity & Source Mapping | TODO |
| 05 | Browser Extension Shell | TODO |
| 06 | Source Providers & Offline | TODO |
| 07 | Region Selector & Redaction | TODO |
| 08 | Standard DOM Capture | TODO |
| 09 | CDP High Fidelity Adapter | TODO |
| 10 | Text / Inline / Pseudo Capture | TODO |
| 11 | CSS Cascade & Authored Semantics | TODO |
| 12 | Media / Container / Environment Capture | TODO |
| 13 | Asset Resolver | TODO |
| 14 | Pixel Ground Truth & Raster Engine | TODO |
| 15 | Multi-Viewport Responsive Capture | TODO |
| 16 | Responsive Inference Engine | TODO |
| 17 | Base Layout Analyzer | TODO |
| 18 | Table Layout Engine | TODO |
| 19 | Render Tree Optimizer | TODO |
| 20 | Compositing & Fallback Boundary | TODO |
| 21 | W2F Packager | TODO |
| 22 | Figma Plugin Shell & File Intake | TODO |
| 23 | Secure Parser & Migration | TODO |
| 24 | Figma Capability Resolver | TODO |
| 25 | Basic Figma Renderer | TODO |
| 26 | Text / Font / Asset / Paint Renderer | TODO |
| 27 | Figma Responsive Layout Renderer | TODO |
| 28 | Hybrid Native / Raster Renderer | TODO |
| 29 | Visual / Structure / Editability QA | TODO |
| 30 | Responsive / Determinism / Performance QA | TODO |
| 31 | Real-world Compatibility & Release Candidate | TODO |

## NODE-00 Deliverables

- [x] Product baseline
- [x] P0/P1/P2 scope
- [x] non-goals
- [x] acceptance metrics and release gates
- [x] capture semantics
- [x] known limitations
- [x] architecture freeze ADR
- [x] `.wtf` format contract

## Architecture Rule

Do not create a V3 or expand the architecture again unless an implementation blocker, material platform/API change, security incompatibility, or non-compatible schema requirement requires it and an ADR is accepted.

## Blockers

None.

## Next Action

Execute `NODE-01 — Monorepo Foundation`.
