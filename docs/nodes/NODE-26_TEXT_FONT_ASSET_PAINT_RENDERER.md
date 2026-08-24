# NODE-26 — Text / Font / Asset / Paint Renderer

**Status:** IN PROGRESS  
**Entry baseline:** `f46d69a8e13f4fad80b03f26f0dc9acddb6db383`  
**Branch:** `feat/node-26-text-font-asset-paint-renderer`

## Frozen scope

NODE-26 owns the native/editable Figma reconstruction of:

- text;
- mixed text runs;
- font resolution and explicit substitution diagnostics;
- images;
- SVG/vector import;
- solid and gradient fills;
- borders and per-corner radius where Figma can represent them;
- drop/inner shadows;
- clip/mask behavior that is representable without taking ownership of NODE-28 raster fallback.

NODE-26 does **not** own:

- Auto Layout, Grid, FILL/HUG/FIXED, min/max sizing or responsive constraints — NODE-27;
- execution of hybrid/native-raster fallback — NODE-28;
- whole-page screenshot import — forbidden by the high-fidelity acceptance standard.

## Mandatory high-fidelity acceptance standard

`docs/W2F_HIGH_FIDELITY_CAPTURE_IMPORT_ACCEPTANCE_STANDARD_V1.md` is an implementation gate.

NODE-26 therefore must preserve the following rules:

1. normal web text is rendered as Figma `TextNode` whenever the required font is available or an explicit accepted mapping exists;
2. mixed font/weight/color ranges remain one editable text node with Figma range APIs rather than being flattened;
3. missing fonts must never be silently substituted — Level B substitutions are reported, while Level C must remain an explicit local visual/editability fallback boundary for NODE-28 rather than pretending to be fully editable;
4. real image bytes from the validated `.wtf` package are used; empty rectangles/URL labels are not acceptable image imports;
5. SVG stays vector-first through Figma SVG import when the NODE-23 sanitizer has accepted it;
6. gradients map to Figma gradient paints instead of screenshots;
7. box shadows map to `DROP_SHADOW` / `INNER_SHADOW` where representable;
8. four-side border and four-corner radius differences are preserved, using native properties or explicit helper shapes when one Figma node is insufficient;
9. revision metadata, stable source mapping, RenderProfile evidence and literal token values continue from NODE-22~25.

## Architecture

Extend the existing `@w2f/figma-renderer` package rather than creating a second competing renderer.

The split remains:

```text
validated W2F IR
      ↓
deterministic render planning
      ↓
Figma adapter contract
      ↓
NODE-25 transaction
      ↓
real Figma nodes
```

The planning layer must stay testable without the global `figma` object.

## Text and font plan

The planner consumes `WtfTextModel` / `WtfTextRun` and emits deterministic text plans containing:

- characters;
- range start/end;
- resolved family/style candidate;
- font size;
- line height;
- letter spacing;
- text alignment;
- text decoration;
- run color/opacity;
- source/revision metadata.

The runtime uses `figma.loadFontAsync()` before any mutation that changes rendered text. Font availability is resolved against fonts visible to Figma; no network font loading is attempted by the plugin.

## Asset plan

The UI-side secure parser already owns validated package bytes. NODE-26 transports only validated asset records and required byte payloads to the main sandbox.

Image assets are keyed by content identity (`sha256` when present, otherwise asset id) and reused through an in-import cache. Figma image paints use `imageHash`, never a remote URL.

SVG payloads use only the sanitizer-approved string from NODE-23 and are imported vector-first with `figma.createNodeFromSvg()`.

## Paint plan

Map W2F paint evidence deterministically:

- `solid` → `SOLID`;
- `linear-gradient` → `GRADIENT_LINEAR`;
- `radial-gradient` → `GRADIENT_RADIAL`;
- `conic-gradient` → `GRADIENT_ANGULAR` when policy/capability permits, otherwise explicit fallback evidence;
- `image` → `IMAGE` paint;
- CSS box shadows → Figma shadow effects;
- uniform borders → native stroke;
- non-uniform borders → helper-shape plan when needed for fidelity;
- overflow/clip evidence → native `clipsContent` where semantically equivalent; complex mask/raster execution remains NODE-28.

## Font policy

### Level A — exact

Use the exact available Figma font family/style and create editable text.

### Level B — explicit mapping

A deterministic mapping may be used, but the result must record a font-substitution diagnostic/report entry.

### Level C — unavailable

Do not silently substitute Inter/Arial. Produce an explicit unresolved-font result that can be routed to NODE-28 visual fallback while preserving original text/font metadata for later relink.

## Required deterministic fixtures

- basic editable text;
- mixed text runs in one TextNode;
- line-height/letter-spacing/alignment/decoration;
- exact font match;
- explicit Level B font substitution reporting;
- Level C unresolved font without silent defaulting;
- image byte import and hash reuse;
- sanitizer-approved SVG vector import;
- malicious/unsanitized SVG never reaching the adapter;
- solid fill;
- linear/radial/conic gradient planning;
- uniform and non-uniform borders/radius;
- drop and inner shadow;
- clipping;
- transaction rollback after injected text/asset/paint adapter failure;
- deterministic repeated plans.

## Exit gate

NODE-26 is complete only after the exact PR head passes:

```text
validate:foundation
frozen pnpm install
lint
typecheck
test
build
Figma package validation
format check
```

and the implementation proves that native editable text/assets/paint are reconstructed from validated W2F IR without whole-page screenshot substitution or silent missing-font deception.
