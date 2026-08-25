# W2F Implementation Status

**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts + High-Fidelity Capture/Import Acceptance Standard  
**Portable package:** `.wtf`  
**MIME:** `application/x-wtf`  
**Architecture:** FROZEN FOR IMPLEMENTATION  
**Updated:** 2026-08-24

## Roadmap

| NODE | Name | Status | Validation | Commit/PR |
|---|---|---|---|---|
| 00 | Product Baseline & Acceptance Contract | DONE | PASS | PR #3 merged |
| 01 | Monorepo Foundation | DONE | Frozen-lockfile CI PASS | PR #4 merged |
| 02 | W2F File Spec V2 | DONE | Shared schema + frozen-lockfile CI PASS | PR #6 merged |
| 03 | W2F IR V2 | DONE | IR roundtrip/reference + frozen-lockfile CI PASS | PR #7 merged |
| 04 | Stable Identity & Source Mapping | DONE | Repeat-capture identity/mapping PASS | PR #8 merged |
| 05 | Browser Extension Shell | DONE | MV3 package + CI PASS | PR #9 merged |
| 06 | Source Providers & Offline | DONE | Runtime/package + CI PASS | PR #10 merged |
| 07 | Region Selector & Redaction | DONE | Runtime/package + CI PASS | PR #11 merged |
| 08 | Standard DOM Capture | DONE | Capture/runtime/package + CI PASS | PR #12 merged |
| 09 | CDP High Fidelity Adapter | DONE | Dual-profile/runtime/package + CI PASS | PR #13 merged |
| 10 | Text / Inline / Pseudo Capture | DONE | Exact-head read-only CI PASS | PR #14 merged |
| 11 | CSS Cascade & Authored Semantics | DONE | Exact-head read-only CI PASS | PR #15 merged as `6e303818` |
| 12 | Media / Container / Environment Capture | DONE | Exact-head CI #310 PASS | PR #16 merged as `b9cdca4d` |
| 13 | Asset Resolver | DONE | Exact-head CI #328 PASS | PR #17 merged as `07978a58` |
| 14 | Pixel Ground Truth & Raster Engine | DONE | Exact-head CI #337 PASS | PR #18 merged as `6bb5fe53` |
| 15 | Multi-Viewport Responsive Capture | DONE | Exact-head CI #350 PASS | PR #19 merged as `68cfbeac` |
| 16 | Responsive Inference Engine | DONE | Exact-head CI #375 PASS | PR #20 merged as `7cfb91fe` |
| 17 | Base Layout Analyzer | DONE | Exact-head CI #422 PASS | PR #21 merged as `0b103261` |
| 18 | Table Layout Engine | DONE | Exact-head CI #449 PASS | PR #22 merged as `7cd56101` |
| 19 | Render Tree Optimizer | DONE | Exact-head CI #477 PASS | PR #23 merged as `030f433a` |
| 20 | Compositing & Fallback Boundary | DONE | Exact-head CI #503 PASS | PR #24 merged as `f0d10cdb` |
| 21 | WTF Packager | DONE | Exact-head CI #540 PASS | PR #25 merged as `5395d1eb` |
| 22 | Figma Plugin Shell & File Intake | DONE | Exact-head CI #571 PASS | PR #26 merged as `84ebc5ed` |
| 23 | Secure Parser & Migration | DONE | Exact-head CI #624 PASS | PR #27 merged as `23cad572` |
| 24 | Figma Capability Resolver | DONE | Exact-head CI #630 PASS | PR #28 merged as `e9e4d1e9` |
| 25 | Basic Figma Renderer | DONE | Bootstrap CI #638 + exact-head CI #640 PASS | PR #29 merged as `35d9a18b` |
| 26 | Text / Font / Asset / Paint Renderer | DONE | Exact-head CI #651 PASS | PR #31 merged as `f6247ddc` |
| 27 | Figma Responsive Layout Renderer | IMPLEMENTING | Candidate CI in progress | PR #32 / `node-27-responsive-layout` |
| 28 | Hybrid Native / Raster Renderer | TODO | - | - |
| 29 | Visual / Structure / Editability QA | TODO | - | - |
| 30 | Responsive / Determinism / Performance QA | TODO | - | - |
| 31 | Real-world Compatibility & Release Candidate | TODO | - | - |

## Current Node

`NODE-27 — Figma Responsive Layout Renderer`

Entry baseline:

```text
f6247ddc6770a08c540dd5052936e788ca0c2b0e
```

Working branch:

```text
node-27-responsive-layout
```

Pull request:

```text
#32
```

## NODE-26 Closure

NODE-26 was merged to `main` via PR #31 as:

```text
f6247ddc6770a08c540dd5052936e788ca0c2b0e
```

The merge records exact-head CI #651 passing Foundation, frozen install, Lint, Typecheck, Tests, Build, Format check, and packaged Figma plugin validation.

NODE-26 now owns editable text reconstruction, local font resolution, per-run text styling, embedded image paints, sanitized SVG reconstruction, native fills/gradients, border/radius, shadows, opacity/blend mapping and full-root rollback on visual-render failure. NODE-27 builds on those native nodes rather than replacing them.

## NODE-27 Frozen Scope

NODE-27 is limited to responsive/native layout reconstruction:

```text
Flex -> Figma Auto Layout
row / row-reverse / column / column-reverse
nowrap / wrap
gap + independent wrapped-track gap
four-side padding
primary/counter-axis alignment
FILL / HUG / FIXED sizing
flex-grow mapping
min/max width and height
absolute/fixed child layout positioning + constraints
native Figma GRID where captured semantics are faithfully representable
```

The W2F IR already carries the required evidence through `flexContainer`, `flexItem`, `gridContainer`, `gridItem`, axis sizing, padding/effective gaps and absolute constraints. NODE-27 must consume that evidence and must not re-infer layout from screenshots.

## Fidelity Policy

Unsupported browser layout semantics must never be silently approximated. If Figma lacks an exact native equivalent, NODE-27 keeps the NODE-25/NODE-26 source geometry and records the mapping as non-native-compatible. Examples include `wrap-reverse` and main-axis spacing modes without an exact Figma equivalent.

NODE-28 remains responsible for selective hybrid/raster fallback. NODE-29 remains responsible for Pixel Ground Truth visual/editability QA.

## Current NODE-27 Implementation

The branch currently contains:

- a deterministic Flex/Auto Layout planner in `@w2f/figma-renderer`;
- native-compatible mapping for direction, wrapping, gap, padding and alignment;
- FILL/HUG/FIXED and `flex-grow` planning;
- min/max sizing evidence;
- protection for absolute children;
- a Figma runtime mapper using native Auto Layout properties;
- import-pipeline integration after NODE-26 visual node replacement;
- explicit skip accounting for unsupported exact-Flex mappings;
- unit tests covering row/column, wrap, gap, padding, grow, min/max, absolute children and unsupported semantics.

See `docs/nodes/NODE-27_FIGMA_RESPONSIVE_LAYOUT_RENDERER.md` for the frozen contract.

## Blockers

No product or architecture blocker is known. GitHub CI may expose strict TypeScript/Figma API or formatting issues; these must be fixed without weakening NODE-22/23 security, NODE-25 transaction invariants or NODE-26 visual fidelity.

## Next

Finish candidate CI for the native Flex path, then implement and validate the faithful native GRID path and remaining constraint/min-max cases. Add a permanent NODE-27 validator, run exact-head read-only CI, mark PR #32 ready and merge only when the exact head is green. Then begin NODE-28.
