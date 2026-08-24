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
| 23 | Secure Parser & Migration | DONE | Exact-head read-only CI #624 PASS | PR #27 merged as `23cad572` |
| 24 | Figma Capability Resolver | EXIT GATE CANDIDATE | Bootstrap CI #628 PASS; exact-head read-only CI pending | PR #28; candidate `b328b666` |
| 25 | Basic Figma Renderer | TODO | - | - |
| 26 | Text / Font / Asset / Paint Renderer | TODO | - | - |
| 27 | Figma Responsive Layout Renderer | TODO | - | - |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-24 — Figma Capability Resolver`

Entry baseline:

```text
23cad5727ac66be448a187e02a6513a854136782
```

Working branch:

```text
feat/node-24-figma-capability-resolver
```

## NODE-23 Closure

NODE-23 PR #27 passed exact-head read-only CI #624 (`32674601511`) on:

```text
a011a484023ce33bdfcc33f916ec137f96cb1667
```

and was squash merged into `main` as:

```text
23cad5727ac66be448a187e02a6513a854136782
```

The merged tree provides the hostile `.wtf` trust boundary: bounded ZIP parsing, Zip Slip/duplicate/shared-local-header rejection, CRC32 + exact-byte SHA-256 integrity, manifest/checksum/IR validation, asset and nested-archive policy, SVG sanitization, explicit V2 migration and validated Figma parser-preview integration.

## NODE-24 Frozen Scope

The V2 Baseline defines an independent Figma capability resolver. It accepts:

```text
IR feature
+ node type
+ parent context
+ current Figma API capability
+ RenderProfile policy
```

and resolves to one deterministic renderer strategy:

```text
NATIVE
EMULATED
WRAPPER
ABSOLUTE
RASTER
UNSUPPORTED
```

The Capability Registry records platform support as:

```text
native
emulated
partial
unsupported
```

NODE-24 prevents NODE-25+ renderers from scattering direct Figma API capability conditionals.

## NODE-24 V2.1 Requirements

Across Figma import/render the implementation preserves revision metadata and stable source mapping, defaults to literal token values, and applies the frozen RenderProfile policy:

```text
Fidelity
Balanced
Design Friendly
```

NODE-24 creates policy/plans only. It does not create Figma scene nodes and does not execute raster fallback; those remain NODE-25+ / NODE-28 responsibilities.

## NODE-24 Bootstrap Closure

Controlled Bootstrap CI #628 (`32675192567`) passed the full repository `pnpm check` and pushed the validated candidate:

```text
b328b666cf27d30c66a185fc7337318588671987
```

The candidate contains the refreshed frozen lockfile, permanent NODE-24 foundation integration, formatted resolver package, deterministic six-outcome fixtures and ADR. Before candidate handoff, the temporary write-enabled bootstrap job and finalizer were removed and the normal read-only CI workflow was restored.

## NODE-24 Capability Snapshot

The versioned registry snapshot is:

```text
figma-plugin-api-2026-08-24
@figma/plugin-typings 1.134.0
```

Registry facts and W2F policy remain separated. The resolver selects deterministic Native/Emulated/Wrapper/Absolute/Raster/Unsupported plans, records downgrade reasons, and carries stable-source/revision/literal-token invariants forward for NODE-25+.

## Blockers

No product/architecture blocker is known.

## Next

Run exact-head read-only frozen-lockfile CI on this normal evidence commit. Only after the exact head is fully green may PR #28 be marked Ready and squash merged to `main`, after which NODE-25 begins.
