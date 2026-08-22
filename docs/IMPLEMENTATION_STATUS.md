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
| 09 | CDP High Fidelity Adapter | DONE | CDP/dual-profile/runtime/package + frozen-lockfile GitHub Actions PASS | PR #13 ready after final docs CI |
| 10 | Text / Inline / Pseudo Capture | NEXT | - | - |
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

`NODE-10 — Text / Inline / Pseudo Capture`

> NODE-10 implementation begins only after PR #13 is merged into `main`.

## NODE-09 Completion

NODE-09 implements the optional Chrome DevTools Protocol High Fidelity capture path while keeping NODE-08 Standard capture as the least-privilege default/fallback and preserving one shared RawSnapshot boundary.

Delivered:

- `@w2f/cdp-capture-adapter`;
- Chrome debugger attach/sendCommand/detach runtime;
- `DOMSnapshot.captureSnapshot` with paint-order and DOM-rect evidence;
- `Page.getLayoutMetrics`;
- `Page.getFrameTree`;
- `Page.captureScreenshot`;
- separate DPR, browser-page-zoom and visual-viewport evidence;
- backend node ID and paint-order RawSnapshot evidence;
- frame-aware normalization and unavailable-frame diagnostics;
- NODE-07 Region/Redact/Exclude integration;
- explicit CDP-to-Standard fallback diagnostics;
- reference screenshot IndexedDB persistence;
- Standard and High Fidelity manifest/build isolation;
- recursive Browser runtime import/package validation;
- dependency-free NODE-09 foundation invariants.

## Permission boundary

Standard build remains:

```text
activeTab
scripting
storage
```

High Fidelity adds only:

```text
debugger
```

Neither build adds broad host permissions or static content scripts.

## NODE-09 Validation

The temporary write-enabled bootstrap workflow has been removed. Generated `dist-high-fidelity/` output is excluded from Git.

Final standard read-only code/security/build Exit Gate:

```text
32586474296
```

validated commit:

```text
ef953d3a72f8a070c194423b7d22dd30e1f97737
```

Every formal gate **PASS**:

- NODE-08, NODE-09 and global dependency-free foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 strict typecheck;
- full repository Vitest suite;
- Standard Browser package build/validation;
- High Fidelity Browser package build/validation;
- pinned Prettier 3.9.6 format check.

Normative documentation:

- `docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md`;
- `docs/adr/ADR-0009-cdp-high-fidelity-permission-and-raw-snapshot-boundary.md`;
- `docs/nodes/NODE-09_CDP_HIGH_FIDELITY_ADAPTER.md`.

## NODE-09 Exit Criteria

- [x] same RawSnapshot contract for Standard/CDP
- [x] CDP platform adapter with safe attach/detach
- [x] DOMSnapshot/layout metrics/frame tree/screenshot evidence
- [x] paint order/backend node evidence
- [x] explicit ScaleContext evidence
- [x] frame diagnostics without fabricated documents
- [x] Region/Redact/Exclude semantics
- [x] explicit Standard fallback
- [x] screenshot IndexedDB persistence
- [x] Standard/High Fidelity permission isolation
- [x] dual-profile package validation
- [x] authoritative 11-workspace lockfile
- [x] temporary write-enabled workflow removed
- [x] generated High Fidelity output excluded from Git
- [x] standard read-only frozen-lockfile code Exit Gate passed
- [x] normative documentation written
- [ ] final docs/status-only standard CI passed
- [ ] PR #13 merged

## Blockers

No implementation, security, test or build blocker remains. Only final docs/status CI and PR #13 merge remain before NODE-10.

## Next

Run the final docs/status-only standard CI, merge PR #13, then create NODE-10 from the merged `main` baseline and begin `Text / Inline / Pseudo Capture`.
