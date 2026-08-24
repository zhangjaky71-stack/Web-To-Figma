# NODE-27 — Figma Responsive Layout Renderer

## Entry baseline

- `main`: `f6247ddc6770a08c540dd5052936e788ca0c2b0e`
- NODE-26: merged via PR #31 after exact-head CI #651 PASS
- Working branch: `node-27-responsive-layout`
- Pull request: #32

## Goal

Translate the responsive/layout semantics already captured in W2F IR into editable Figma-native layout behavior without weakening NODE-26 visual fidelity.

NODE-27 does **not** re-infer CSS from screenshots. It consumes the existing IR evidence:

- `layout.mode`
- `flexContainer` / `flexItem`
- `gridContainer` / `gridItem`
- `sizing.width` / `sizing.height`
- min/max sizing
- padding and effective row/column gap
- absolute constraints
- responsive decisions produced by earlier capture/inference nodes

## Frozen implementation scope

### Flex → Figma Auto Layout

Map exact/native-compatible semantics:

- `row` / `row-reverse` → horizontal Auto Layout + deterministic child ordering
- `column` / `column-reverse` → vertical Auto Layout + deterministic child ordering
- `nowrap` / `wrap`
- main/counter-axis alignment
- row/column gap
- four-side padding
- `flex-grow` and captured FILL sizing
- captured HUG/FIXED sizing
- min/max width/height
- absolute/fixed children kept inside the Auto Layout frame using Figma absolute layout positioning

### Fidelity boundary

Do not silently approximate CSS semantics that Figma cannot represent exactly. Examples include:

- `wrap-reverse`
- `space-around` / `space-evenly` when no exact native equivalent exists
- unsupported mixed per-item alignment semantics

For these cases, keep the NODE-26 source geometry path and record the mapping as non-native-compatible. NODE-28 owns hybrid/raster fallback execution. NODE-29 owns Pixel Ground Truth visual, structure, and editability QA for the rendered result.

### Grid

Map grid to Figma native `GRID` only where captured tracks/spans can be represented faithfully. Unsupported grid semantics remain explicit and must not be flattened into a fake Auto Layout.

### Constraints

For absolute children, preserve explicit left/right/top/bottom intent using Figma constraints where possible. Position and size evidence from NODE-25 remains the fallback source of truth.

## Runtime ordering

The import pipeline is:

```text
NODE-25 hierarchy + geometry
        ↓
NODE-26 text / image / SVG / paint
        ↓
NODE-27 layout reconstruction
        ↓
commit / rollback
```

Layout is applied after NODE-26 node replacement so TextNode/SVG replacements receive the final parent Auto Layout behavior rather than losing layout metadata during replacement.

## Non-negotiable invariants

- no network access;
- `.wtf` validated local evidence only;
- source/stable/revision pluginData survives;
- unsupported semantics are explicit, not silently approximated;
- a fatal layout mutation must still be covered by the existing full-root rollback boundary;
- NODE-27 must not introduce whole-page rasterization;
- literal token policy remains unchanged.

## Exit gate

NODE-27 may merge only when the exact branch head passes:

1. foundation validation;
2. frozen-lockfile install;
3. lint;
4. TypeScript typecheck;
5. unit/runtime tests;
6. build;
7. packaged Figma plugin validation;
8. format check.

NODE-28 begins only after NODE-27 is merged.
