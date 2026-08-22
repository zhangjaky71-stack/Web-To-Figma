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
| 03 | W2F IR V2 | DONE | IR roundtrip/reference validation + frozen-lockfile GitHub Actions PASS | PR #7 merged |
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping + frozen-lockfile GitHub Actions PASS | PR #8 |
| 05 | Browser Extension Shell | NEXT | - | - |
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

`NODE-05 — Browser Extension Shell`

## NODE-04 Completion

NODE-04 implements the deterministic stable identity layer reserved by the frozen V2/V2.1 architecture and NODE-03 IR.

Implemented in `packages/stable-identity`:

- stable algorithm version `1.0.0`;
- normalized HTTP/file/local-folder/opaque document locators;
- deterministic `documentId` and `sourceFingerprint`;
- distinct per-capture `captureId`;
- deterministic revision identity and optional parent revision linkage;
- stable node evidence from source scope, semantic ancestry, tag/role, stable ID/data attributes, meaningful classes, normalized text and asset fingerprints;
- filtering of React/Radix/Headless UI hydration IDs, UUID/timestamp/hash-like runtime values, unstable framework data attributes, CSS-module hashes and utility-class noise;
- explainable confidence/evidence scoring;
- lower-confidence structural fallback;
- deterministic same-capture collision disambiguation;
- cross-capture `matched` / `added` / `removed` / `ambiguous` mapping;
- fail-visible ambiguity instead of array-order pairing;
- immutable application of stable identities to NODE-03 Source Graph nodes;
- explicit reporting of unmapped Source Nodes and unused assignments.

Browser Extension now consumes `@w2f/stable-identity` through the workspace rather than defining app-local identity logic.

## NODE-04 Validation

The first real cloud validation found an `exactOptionalPropertyTypes` incompatibility in normalized signal typing. It was corrected without weakening strict TypeScript settings.

The controlled bootstrap then passed and wrote canonical Prettier formatting plus the authoritative workspace lockfile.

The bootstrap workflow was removed and standard read-only CI restored with:

```text
pnpm install --frozen-lockfile
```

GitHub Actions run `32566068160` passed on commit:

```text
d7882c58deecfdfffa6b6d2187dddcee58c5e5b9
```

Validated gates:

- foundation validation: **PASS**;
- Node.js 24 / pnpm 11.22.0: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Vitest: **PASS**;
- build: **PASS**;
- Prettier format check: **PASS**.

Normative documentation:

- `docs/STABLE_IDENTITY_SOURCE_MAPPING_V2.md`;
- `docs/adr/ADR-0004-stable-identity-and-source-mapping.md`;
- `docs/nodes/NODE-04_STABLE_IDENTITY_SOURCE_MAPPING.md`.

## NODE-04 Exit Criteria

- [x] document/capture/revision identity implemented
- [x] stable node evidence and confidence implemented
- [x] volatile runtime signals filtered
- [x] deterministic collision handling implemented
- [x] cross-capture mapping implemented
- [x] ambiguous duplicate mapping is fail-visible
- [x] Source Graph identity application implemented
- [x] repeat-capture stability tests implemented
- [x] Browser consumes shared identity package
- [x] authoritative workspace lockfile updated
- [x] bootstrap workflow removed
- [x] frozen-lockfile CI restored
- [x] frozen-lockfile CI passes

## Blockers

None.

## Next

Proceed to `NODE-05 — Browser Extension Shell`.

NODE-05 owns the production browser-extension shell: Manifest V3, runtime entrypoints, background/service-worker lifecycle, content-script bridge, popup/options UI surfaces, permissions/capability boundaries and extension build packaging. It must consume the file/IR/identity contracts from NODE-02/03/04 instead of redefining them.
