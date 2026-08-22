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
| 01 | Monorepo Foundation | DONE | Frozen-lockfile GitHub Actions pipeline PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile GitHub Actions PASS | PR #6 |
| 03 | W2F IR V2 | NEXT | - | - |
| 04 | Stable Identity & Source Mapping | TODO | - | - |
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

`NODE-03 — W2F IR V2`

## NODE-02 Completion

NODE-02 froze the portable `.wtf` V2 protocol before downstream capture/render implementation.

Implemented:

- shared `packages/w2f-schema` package;
- `.wtf` / `application/x-wtf` / V2 version constants;
- container kind and canonical entrypoints;
- manifest and file-inventory model;
- compatibility and feature negotiation;
- `minReaderVersion` enforcement;
- SHA-256 checksum contract;
- deterministic canonical JSON;
- archive-entry and portable-path validation;
- hard archive/security ceilings;
- capture-target and double-precision geometry contract;
- responsive/state/reference-tile reservations;
- V2.1 Token Graph reservation and validator;
- V2.1 Structural Fingerprint reservation;
- V2.1 Revision Metadata reservation;
- V2.1 Scroll Root reservation;
- V2.1 Composed Tree reservation;
- Browser Extension and Figma Plugin both consuming `@w2f/w2f-schema` via `workspace:*`;
- authoritative workspace lockfile update.

Normative documentation:

- `docs/WTF_FILE_SPEC_V2.md`;
- `docs/adr/ADR-0002-wtf-v2-compatibility-integrity-and-security-contract.md`;
- `docs/nodes/NODE-02_WTF_FILE_SPEC_V2.md`.

## NODE-02 Validation

The bootstrap validation established the shared-schema implementation and produced canonical Prettier/lockfile output.

The bootstrap workflow was then removed and the normal read-only workflow restored with:

```text
pnpm install --frozen-lockfile
```

GitHub Actions run `32564276456` completed successfully with:

- foundation validation: **PASS**;
- Node.js 24 setup: **PASS**;
- pnpm 11.22.0 setup: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Vitest: **PASS**;
- build: **PASS**;
- Prettier format check: **PASS**.

The `w2f-schema` suite contains 15 protocol/security/integrity tests, and both Browser/Figma workspaces compile and test against the same schema package.

## NODE-02 Exit Criteria

- [x] container contract defined
- [x] manifest defined
- [x] compatibility defined
- [x] checksums/inventory defined
- [x] feature flags defined
- [x] source/render/responsive/state/reference entrypoints reserved
- [x] security limits/path rules defined
- [x] V2.1 protocol reservations defined
- [x] Browser and Figma share one schema package
- [x] workspace lockfile updated
- [x] bootstrap workflow removed
- [x] frozen-lockfile CI restored
- [x] frozen-lockfile CI passes

## Blockers

None.

## Next

Proceed to `NODE-03 — W2F IR V2`.

NODE-03 owns the complete Source Graph, Render Tree, layout, paint, text, asset, responsive, state and diagnostic IR. It must build on the portable compatibility/integrity boundaries frozen by NODE-02 rather than redefining them.
