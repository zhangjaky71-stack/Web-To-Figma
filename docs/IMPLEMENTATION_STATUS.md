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
| 08 | Standard DOM Capture | DONE | RawSnapshot/Standard capture/runtime/package + frozen-lockfile GitHub Actions PASS | PR #12 ready to merge |
| 09 | CDP High Fidelity Adapter | NEXT | - | - |
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

`NODE-09 — CDP High Fidelity Adapter`

> NODE-09 implementation must not begin until PR #12 is merged into `main`.

## NODE-08 Completion

NODE-08 implements the frozen V2/V2.1 Standard DOM capture path and establishes the adapter-neutral RawSnapshot boundary that NODE-09 CDP must also target.

Implemented:

- shared `@w2f/capture-core` RawSnapshot contract;
- `FrameContext` schema and IR preservation;
- explicit `ScaleContext` model separating DPR, browser page zoom, CSS zoom and visual viewport scale;
- `@w2f/standard-capture-adapter`;
- Element/Text/Document traversal;
- unrounded double-precision geometry/client rect evidence;
- computed visibility evidence;
- open Shadow DOM traversal;
- slot/composed-parent inference via `assignedNodes({ flatten: true })`;
- same-origin iframe recursion;
- inaccessible iframe frame records and diagnostics;
- scroll-container evidence and primary application scroll-root heuristic;
- region intersection + structural ancestor closure;
- Redact/Exclude application before captured content leaves the page;
- protected form/auth/cookie/session/token data filtering;
- Browser Full Page Standard capture;
- Browser post-region Standard capture;
- IndexedDB RawSnapshot persistence with compact `chrome.storage.local` receipt;
- cancellation-race protection;
- Chrome-resolvable packaged capture runtime with unresolved workspace-import rejection.

Standard capture does not fabricate browser zoom evidence that page APIs cannot reliably separate. Those fields are explicitly represented as unavailable for the Standard path and remain available for higher-fidelity evidence in NODE-09.

The Browser extension remains least-privilege:

```text
activeTab
scripting
storage
```

NODE-08 adds no `debugger`, broad `host_permissions` or static content scripts.

## NODE-08 Validation

All temporary write-enabled bootstrap/patch workflows have been removed.

Final standard read-only GitHub Actions run:

```text
32582370051
```

validated commit:

```text
4dc6ccc369dc9f332dd4119e2324e873e6127603
```

Every formal gate **PASS**:

- dependency-free foundation validation including NODE-08 contract invariants;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- full repository Vitest suite;
- deterministic Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

Normative documentation:

- `docs/STANDARD_DOM_CAPTURE_V2.md`;
- `docs/adr/ADR-0008-adapter-neutral-raw-snapshot-and-standard-capture.md`;
- `docs/nodes/NODE-08_STANDARD_DOM_CAPTURE.md`.

## NODE-08 Exit Criteria

- [x] adapter-neutral RawSnapshot contract
- [x] Standard DOM capture adapter
- [x] DOM/Text geometry and visibility evidence
- [x] open Shadow DOM + composed-tree inference
- [x] iframe/origin-aware FrameContext
- [x] explicit ScaleContext without fabricated zoom values
- [x] scroll-root evidence
- [x] Region + Redact/Exclude integration
- [x] automatic privacy filtering
- [x] Browser Full Page/Region capture orchestration
- [x] IndexedDB snapshot persistence
- [x] package/runtime validation
- [x] authoritative lockfile updated
- [x] temporary write-enabled workflows removed
- [x] final standard read-only frozen-lockfile CI passes
- [x] validation evidence written to normative status/docs
- [ ] PR #12 merged

## Blockers

No implementation or CI blockers remain for NODE-08. PR #12 only requires merge.

## Next

Merge PR #12, then create NODE-09 from the merged `main` baseline and begin `CDP High Fidelity Adapter` implementation against the same RawSnapshot contract.
