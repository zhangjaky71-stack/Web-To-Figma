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
| 21 | WTF Packager | IN PROGRESS | Implementation starting from merged NODE-20 | `feat/node-21-wtf-packager` |
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

`NODE-21 — WTF Packager`

Entry baseline:

```text
f0d10cdbec3fe805468a0ff8a8ccce701e4896c6
```

Working branch:

```text
feat/node-21-wtf-packager
```

## NODE-20 Closure

NODE-20 PR #24 passed final exact-head read-only CI #503 (`32637903639`) on:

```text
6070b76be8dc9728c3f03c95a16c25b6dad7c8d6
```

and was squash merged into `main` as:

```text
f0d10cdbec3fe805468a0ff8a8ccce701e4896c6
```

The merged tree contains deterministic minimal-safe compositing/fallback boundaries, Browser compositing sidecar persistence, Standard/CDP receipt metrics, NODE-14 Pixel Ground Truth fallback requests, dual-profile package validation and permanent NODE-20 guardrails.

## NODE-21 Frozen Scope

The V2 Baseline defines NODE-21 as the final Browser Capture phase node and requires:

```text
files
manifests
references
feature flags
checksums
zip
download
```

Exit outcome:

```text
Web -> .wtf
```

The frozen V2 File Spec remains authoritative. NODE-21 must not redefine manifest fields, canonical entrypoint paths, path rules, feature vocabulary, checksum semantics or security ceilings.

## Packager Principles

- use `@w2f/w2f-schema` as the single format contract;
- emit canonical required payload entrypoints exactly as frozen by `WTF_DEFAULT_ENTRYPOINTS`;
- inventory every non-reserved payload in `manifest.files`;
- reserve `manifest.json` and `checksums.json` outside `manifest.files`;
- serialize protocol JSON canonically before hashing;
- compute lowercase SHA-256 over exact uncompressed payload bytes;
- make `checksums.json.files` match the manifest inventory exactly;
- include binary assets, reference tiles and fallback raster payloads through portable relative paths;
- generate deterministic ZIP bytes from identical logical input;
- package generation is writer-side only; NODE-23 owns hostile archive parsing, zip-bomb/zip-slip enforcement, migration and SVG sanitization;
- Browser export/download is the only UI/runtime responsibility added here; Figma intake begins at NODE-22.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-21 formal Exit Gate and squash merge:

```text
NODE-22 — Figma Plugin Shell & File Intake
```
