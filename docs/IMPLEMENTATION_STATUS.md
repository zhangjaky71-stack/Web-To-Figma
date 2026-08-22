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
| 06 | Source Providers & Offline | DONE | Source-provider/runtime/package + frozen-lockfile GitHub Actions PASS | PR #10 merged |
| 07 | Region Selector & Redaction | DONE | Region interaction/runtime/package + frozen-lockfile GitHub Actions PASS | PR #11 merge pending |
| 08 | Standard DOM Capture | NEXT | - | - |
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

`NODE-08 — Standard DOM Capture`

> NODE-08 implementation must not begin until PR #11 is merged into `main`.

## NODE-07 Completion

NODE-07 implements the frozen V2 interactive region-selection and redaction boundary on top of the Browser shell and source-provider preflight.

Implemented in `apps/browser-extension`:

- versioned `RegionSelectionResult` contract;
- unrounded double-precision `document-css-px` geometry;
- Free Rectangle drag selection;
- Smart Element hover/click selection;
- rendered hit testing via `document.elementsFromPoint`;
- lightweight element-edge snap with `Alt` bypass;
- `Esc` cancel and `Enter` confirm;
- Arrow 1 CSS px and Shift+Arrow 10 CSS px movement;
- edge auto-scroll during drag;
- wheel scrolling while selector is active;
- selection root hint and explicit root clip;
- Redact and Exclude masks clipped to the selected region;
- deterministic overlay/listener cleanup;
- region protocol request/result/cancellation paths;
- structurally validated region evidence persisted in capture job state;
- popup result summary;
- Browser package/runtime validation for the NODE-07 runtime.

The interaction overlay is isolated in a closed Shadow DOM and remains user-action injected.

The Browser extension remains least-privilege:

```text
activeTab
scripting
storage
```

NODE-07 adds no broad `host_permissions`, `<all_urls>`, debugger permission or static content scripts. It does not read cookies, local/session storage, authorization headers, auth tokens or form values.

NODE-07 deliberately does not serialize DOM or implement NODE-08 Standard DOM Capture.

## NODE-07 Validation

The temporary write-enabled formatter has been removed.

Final standard read-only GitHub Actions run:

```text
32577222247
```

validated commit:

```text
d342db88388490dcaf3eaab4c3399aaa902dc3d1
```

with every formal gate **PASS**:

- dependency-free foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- full repository Vitest suite;
- Browser region-selection/protocol/job-state tests;
- deterministic Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

Normative documentation:

- `docs/REGION_SELECTOR_REDACTION_V2.md`;
- `docs/adr/ADR-0007-region-selection-and-redaction-boundary.md`;
- `docs/nodes/NODE-07_REGION_SELECTOR_REDACTION.md`.

## NODE-07 Exit Criteria

- [x] versioned region-selection contract
- [x] double-precision document-space geometry
- [x] Free Rectangle + Smart Element modes
- [x] snap bypass and keyboard controls
- [x] edge auto-scroll and active wheel scrolling
- [x] selection root + root clip
- [x] Redact + Exclude masks clipped to selection
- [x] deterministic cleanup/cancellation
- [x] protocol/job-state/popup integration
- [x] permission and privacy boundary preserved
- [x] foundation invariants updated
- [x] tests/typecheck/build/package validation pass
- [x] temporary write-enabled formatter removed
- [x] final standard read-only frozen-lockfile CI passes

## Blockers

None for NODE-07 implementation. PR #11 must be merged before NODE-08 work starts.

## Next

Merge PR #11, then proceed to `NODE-08 — Standard DOM Capture` from the merged `main` baseline.
