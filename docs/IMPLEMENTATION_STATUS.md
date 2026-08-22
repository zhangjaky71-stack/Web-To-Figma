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
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping + frozen-lockfile GitHub Actions PASS | PR #8 merged |
| 05 | Browser Extension Shell | DONE | Loadable MV3 package + frozen-lockfile GitHub Actions PASS | PR #9 merged |
| 06 | Source Providers & Offline | DONE | Source-provider/runtime/package + frozen-lockfile GitHub Actions PASS | PR #10 |
| 07 | Region Selector & Redaction | NEXT | - | - |
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

`NODE-07 — Region Selector & Redaction`

## NODE-06 Completion

NODE-06 implements the frozen V2 source-provider boundary used by later Browser capture and asset-resolution nodes.

Implemented in `packages/source-providers` and `apps/browser-extension`:

- shared `@w2f/source-providers` contract package;
- `HttpPageProvider`;
- `FileTabProvider`;
- `LocalFolderProvider`;
- structured source capability results and required user actions;
- HTTP/file relative reference resolution;
- root-scoped local-folder relative resolution;
- missing local-resource evidence without silent network fallback;
- root traversal and normalized duplicate-entry protection;
- Chrome `file://` access preflight;
- explicit user local-folder selection surface;
- Browser service-worker source preflight before content injection;
- source descriptor persistence in capture job state;
- `W2F_GET_SOURCE_CAPABILITY` protocol support;
- packaged Chrome-resolvable source-provider runtime modules;
- package validator rejection of unresolved `@w2f/*` Browser runtime imports.

The Browser extension remains least-privilege:

```text
activeTab
scripting
storage
```

NODE-06 adds no broad `host_permissions`, `<all_urls>`, debugger permission or static content scripts. File access remains a Chrome user setting checked at runtime; local-folder access requires explicit user selection.

## NODE-06 Validation

The new workspace importer is committed in the authoritative `pnpm-lock.yaml` and the temporary write-enabled bootstrap has been removed.

Final standard read-only GitHub Actions run:

```text
32570905251
```

validated commit:

```text
09e31c5e1bfb4efde5f3da3222a0329a26cd32ed
```

with every formal gate **PASS**:

- dependency-free foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- source-provider tests;
- Browser integration tests;
- full repository Vitest suite;
- deterministic Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

Normative documentation:

- `docs/SOURCE_PROVIDERS_OFFLINE_V2.md`;
- `docs/adr/ADR-0006-source-provider-boundary-and-offline-access.md`;
- `docs/nodes/NODE-06_SOURCE_PROVIDERS_OFFLINE.md`;
- `packages/source-providers`.

## NODE-06 Exit Criteria

- [x] shared source-provider package
- [x] `HttpPageProvider`
- [x] `FileTabProvider`
- [x] `LocalFolderProvider`
- [x] explicit capability/required-action model
- [x] HTTP/file/local-folder reference resolution
- [x] local root traversal protection
- [x] missing local resource evidence
- [x] Chrome file access preflight
- [x] explicit local-folder selection surface
- [x] Browser source preflight and persisted descriptor
- [x] Chrome-resolvable packaged provider runtime
- [x] Browser least-privilege boundary preserved
- [x] tests/typecheck/build/package validation pass
- [x] authoritative lockfile updated
- [x] temporary write-enabled bootstrap removed
- [x] final standard read-only frozen-lockfile CI passes

## Blockers

None.

## Next

Proceed to `NODE-07 — Region Selector & Redaction`.

NODE-07 must implement the interactive region-selection/redaction layer on top of the NODE-05 Browser shell and NODE-06 source preflight while preserving deterministic geometry and explicit user control. It must not implement NODE-08 DOM extraction prematurely.
