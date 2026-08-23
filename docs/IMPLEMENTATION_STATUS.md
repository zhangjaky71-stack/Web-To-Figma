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
| 10 | Text / Inline / Pseudo Capture | DONE | Exact-head read-only frozen-lockfile CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | DONE | Exact-head read-only frozen-lockfile CI PASS | PR #15 merged as `6e303818` |
| 12 | Media / Container / Environment Capture | DONE | Exact-head read-only CI #310 PASS | PR #16 merged as `b9cdca4d` |
| 13 | Asset Resolver | DONE | Exact-head read-only CI #328 PASS | PR #17 merged as `07978a58` |
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head read-only CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head read-only CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head read-only CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head read-only CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | DONE | Exact-head read-only CI #449 PASS | PR #22 merged as `7cd56101` |
| 19 | Render Tree Optimizer | DONE | Exact-head read-only CI #477 PASS | PR #23 merged as `030f433a` |
| 20 | Compositing & Fallback Boundary | DONE | Exact-head read-only CI #503 PASS | PR #24 merged as `f0d10cdb` |
| 21 | WTF Packager | DONE | Exact-head read-only CI #540 PASS | PR #25 merged as `5395d1eb` |
| 22 | Figma Plugin Shell & File Intake | DONE | Exact-head read-only CI #571 PASS | PR #26 merged as `84ebc5ed` |
| 23 | Secure Parser & Migration | IN PROGRESS | Implementation starting from merged NODE-22 | `feat/node-23-secure-parser-migration` |
| 24 | Figma Capability Resolver | TODO | - | - |
| 25 | Basic Figma Renderer | TODO | - | - |
| 26 | Text / Font / Asset / Paint Renderer | TODO | - | - |
| 27 | Figma Responsive Layout Renderer | TODO | - | - |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-23 — Secure Parser & Migration`

Entry baseline:

```text
84ebc5eddec06b38dd757aecbcdcf7f49a1a76e1
```

Working branch:

```text
feat/node-23-secure-parser-migration
```

## NODE-22 Closure

NODE-22 PR #26 passed final exact-head read-only CI #571 (`32646653514`) on:

```text
531f6784c2a2b2af3c3d1dcfaef0ca197b8de5c4
```

and was squash merged into `main` as:

```text
84ebc5eddec06b38dd757aecbcdcf7f49a1a76e1
```

The merged tree provides a loadable Local First Figma main/UI shell, Choose/UI Drop/Canvas Drop intake, versioned protocol, progress/import policy, Whole Page / Selected Sections contracts, revision/stable-source/literal-token handoff and package validation while preserving the secure-parser trust boundary.

## NODE-23 Frozen Scope

V2 Baseline requires:

```text
schema
version
zip bomb
zip slip
checksum
SVG sanitize
migration
```

The secure parser must treat every `.wtf` as hostile input. Validation must fail closed before data becomes renderer input.

## NODE-23 Security Order

The implementation follows the frozen security sequence:

1. archive signature/container structure;
2. entry count and declared/compressed/uncompressed limits;
3. portable path normalization, duplicate detection and Zip Slip rejection;
4. required `manifest.json` / `checksums.json` presence;
5. manifest kind/version/schema/feature compatibility;
6. canonical inventory and per-entry size agreement;
7. SHA-256 checksum verification over exact uncompressed bytes;
8. JSON decode/schema/IR validation only after integrity passes;
9. asset MIME/path policy and no nested archive auto-expansion;
10. SVG sanitization before any SVG reaches later Figma rendering;
11. explicit version migration into the current reader model;
12. parser preview / validated document handoff to NODE-22 protocol.

## Boundaries

NODE-23 does not create Figma nodes and does not decide native/emulated/raster capability policy. Those remain NODE-24+ responsibilities.

No `.wtf` HTML or JavaScript is executed. No `eval` is permitted. Parsing remains Local First and data-only.

## Blockers

No product/architecture blocker is known.

## Next

Implement the secure archive reader, bounded ZIP decoder, manifest/checksum/schema validation, SVG sanitizer, migration registry and Figma parser-preview integration, then run the NODE-23 Exit Gate.
