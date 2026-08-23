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
| 22 | Figma Plugin Shell & File Intake | EXIT GATE CANDIDATE | Bootstrap CI #569 full `pnpm check` PASS; exact-head read-only CI pending | PR #26 |
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

`NODE-22 — Figma Plugin Shell & File Intake`

Entry baseline:

```text
5395d1eb3c29187f6a07cacccd6b6ddfab4890ee
```

Working branch:

```text
feat/node-22-figma-plugin-shell-file-intake
```

## NODE-21 Closure

NODE-21 PR #25 passed final exact-head read-only CI #540 (`32643983427`) on:

```text
62724c3a9f03ae0980427823b4fee8d69e8ceab0
```

and was squash merged into `main` as:

```text
5395d1eb3c29187f6a07cacccd6b6ddfab4890ee
```

The merged tree closes Phase B with deterministic `.wtf` packaging, manifest/checksum inventory, reference/assets payloads, ZIP output, Browser package persistence and local download for both Standard and High Fidelity extension profiles.

## NODE-22 Frozen Scope

V2 requires:

```text
main / ui
choose
drop
progress
import modes
section outline
```

V2 partial import requires Whole Page and Selected Sections backed by the Render Tree section model.

V2.1 additionally requires NODE-22~28 Figma Import/Render to preserve:

- revision metadata;
- stable source mapping;
- literal token values by default;
- RenderProfile policy.

## NODE-22 Boundary

NODE-22 is the shell and file-intake boundary only:

- accept local `.wtf` file bytes from UI choose/drop and active-plugin Canvas drop;
- keep main ↔ UI communication versioned and typed;
- model file intake, progress, import profile/mode and section selection;
- preserve parser/render handoff metadata without interpreting untrusted archive internals;
- do not unzip or trust archive content in the shell.

NODE-23 owns schema/version parsing, ZIP security, checksums, SVG sanitization and migration. NODE-24+ own capability resolution and rendering.

## NODE-22 Exit-Gate Candidate

Controlled Bootstrap CI #569 (`32646508846`) completed successfully and ran the final candidate through repository-wide `pnpm check`, including:

- permanent NODE-22 foundation validation;
- lint across all workspaces;
- TypeScript typecheck across all workspaces;
- all Vitest suites;
- loadable Figma main/UI esbuild bundle;
- Figma manifest/package validation;
- all existing Browser Extension package builds and validators;
- repository-wide formatting check.

The validated implementation candidate produced by the controlled Bootstrap is:

```text
9d5964b13ff96b165330e579c3f0b09f8d0acbcb
```

The candidate also pins Figma typings/esbuild, uses pnpm `allowBuilds` only for `esbuild@0.28.2`, rejects invalid/over-limit UI files before full `arrayBuffer()` allocation, and preserves the NODE-23 secure-parser boundary.

Temporary Bootstrap workflow/finalizer and diagnostic failure log are absent from the candidate. GitHub marked bot-origin synchronize CI #570 as `action_required`; this documentation-only user-origin commit triggers the formal exact-head read-only CI without changing implementation behavior.

## Blockers

No product/architecture blocker is known.

## Next

After NODE-22 formal exact-head Exit Gate and squash merge:

```text
NODE-23 — Secure Parser & Migration
```
