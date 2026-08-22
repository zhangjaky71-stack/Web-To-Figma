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
| 09 | CDP High Fidelity Adapter | IN PROGRESS | - | branch `feat/node-09-cdp-high-fidelity-adapter` |
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

NODE-09 starts from merged NODE-08 `main` commit:

```text
7bd71bf95247148414b0eb49e580a297a3667a38
```

The adapter MUST normalize CDP evidence into the same `RawSnapshot` contract introduced by NODE-08. It must not introduce a parallel capture model.

## NODE-08 Completion

PR #12 was squash merged into `main` as:

```text
7bd71bf95247148414b0eb49e580a297a3667a38
```

Final branch CI after status/docs update:

```text
32583854755
```

validated head:

```text
ec13b1b8d2bffd4581c3a417c85eef5f6c81c94e
```

Every formal gate passed: foundation, Node 24/pnpm 11.22.0, frozen install, lint, TypeScript 6.0.3 typecheck, full tests, Browser build/package validation and Prettier 3.9.6.

NODE-08 delivered:

- shared adapter-neutral RawSnapshot;
- Standard DOM capture;
- FrameContext and IR frame preservation;
- explicit ScaleContext evidence;
- open Shadow DOM + composed mapping;
- same-origin iframe traversal + inaccessible-frame diagnostics;
- scroll-container evidence;
- Region + Redact/Exclude integration;
- privacy filtering;
- Browser full-page/post-region capture;
- IndexedDB RawSnapshot persistence;
- Chrome-resolvable packaged capture runtime.

Normative docs:

- `docs/STANDARD_DOM_CAPTURE_V2.md`;
- `docs/adr/ADR-0008-adapter-neutral-raw-snapshot-and-standard-capture.md`;
- `docs/nodes/NODE-08_STANDARD_DOM_CAPTURE.md`.

## NODE-09 Entry Conditions

- [x] NODE-08 PR #12 merged
- [x] NODE-08 RawSnapshot contract frozen for adapter normalization
- [x] FrameContext available
- [x] ScaleContext available
- [x] Standard capture remains fallback path
- [x] NODE-09 branch created from merged `main`

## Blockers

None at NODE-09 entry.

## Next

Implement NODE-09 CDP High Fidelity Adapter against the frozen V2/V2.1 NODE-09 requirements. Standard capture remains available as fallback and comparison evidence.
