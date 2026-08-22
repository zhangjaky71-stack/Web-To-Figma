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
| 05 | Browser Extension Shell | DONE | Loadable MV3 package + frozen-lockfile GitHub Actions PASS | PR #9 |
| 06 | Source Providers & Offline | NEXT | - | - |
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

`NODE-06 — Source Providers & Offline`

## NODE-05 Completion

NODE-05 replaces the compile-only Browser workspace shell with a real Chromium Manifest V3 extension application.

Implemented in `apps/browser-extension`:

- Manifest V3 source manifest;
- module background service worker;
- popup with Full page / Select area shell actions;
- options/status surface;
- typed runtime message protocol;
- persistent capture-job state in `chrome.storage.local`;
- user-action content bridge injection through `chrome.scripting`;
- page probe evidence for URL/title/document size/viewport/DPR;
- deterministic extension build and packaging pipeline;
- loadable unpacked output in `apps/browser-extension/dist`;
- package/security validation;
- Browser integration with NODE-02 schema, NODE-03 IR and NODE-04 stable identity packages.

NODE-05 permission posture is intentionally minimal:

```text
activeTab
scripting
storage
```

There are no broad default host permissions and no always-on static content scripts. File/local-folder source permissions are deferred to NODE-06; debugger/CDP permissions are deferred to NODE-09.

## NODE-05 Validation

The first cloud run exposed an obsolete NODE-01 assumption that the Browser build script must equal a raw `tsc` command. The dependency-free foundation validator was evolved to accept and verify the real extension package pipeline while preserving TypeScript and MV3 invariants.

The real Browser shell then passed:

- foundation validation;
- frozen-lockfile installation;
- ESLint;
- TypeScript 6.0.3 typecheck;
- 11 Browser shell/job/protocol tests;
- full repository Vitest suite;
- deterministic Browser build;
- Browser extension package/security validator;
- repository build;
- pinned Prettier 3.9.6 format check.

The temporary formatting workflow was removed and standard read-only CI restored:

```text
permissions:
  contents: read

pnpm install --frozen-lockfile
```

Final read-only GitHub Actions run:

```text
32567397560
```

validated commit:

```text
e3f284875c0e2977048fb25823fe2dc4c4a018e5
```

with every formal gate **PASS**.

Normative documentation:

- `docs/BROWSER_EXTENSION_SHELL_V2.md`;
- `docs/adr/ADR-0005-browser-extension-mv3-shell-and-permission-boundary.md`;
- `docs/nodes/NODE-05_BROWSER_EXTENSION_SHELL.md`;
- `apps/browser-extension/README.md`.

## NODE-05 Exit Criteria

- [x] production Manifest V3 shell
- [x] popup
- [x] module service worker
- [x] content bridge
- [x] typed message protocol
- [x] persistent job state
- [x] least-privilege permission boundary
- [x] Browser shared-contract integration
- [x] loadable unpacked extension package
- [x] deterministic build/package validator
- [x] Browser shell tests
- [x] temporary write-enabled workflow removed
- [x] standard read-only frozen-lockfile CI restored
- [x] final frozen-lockfile CI passes

## Blockers

None.

## Next

Proceed to `NODE-06 — Source Providers & Offline`.

NODE-06 implements the frozen V2 source-provider abstraction and the three required providers:

```text
HttpPageProvider
FileTabProvider
LocalFolderProvider
```

It must add capability checks, relative-URL resolution and explicit host/local permission behavior without weakening the NODE-05 least-privilege default shell.
