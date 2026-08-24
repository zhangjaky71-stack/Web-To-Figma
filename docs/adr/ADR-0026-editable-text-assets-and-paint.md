# ADR-0026 — Preserve Editability While Applying Text, Assets and Paint

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owner:** NODE-26

## Context

NODE-25 intentionally created a neutral, transactional Figma scene graph. That established hierarchy, fractional geometry, z-order and source/revision identity but left text, images, SVG and paint visually empty. The product acceptance baseline requires a real editable reconstruction, not a screenshot and not blank substitutes for captured resources.

Figma and the browser do not share an identical rendering model. A correct implementation therefore needs a deterministic native mapping for representable semantics, explicit font/asset fallback evidence, and a later hybrid/raster path for semantics that cannot be represented faithfully.

## Decision

NODE-26 will enrich the NODE-25 scene graph in-place using these rules:

1. **Text stays text.** Captured text is reconstructed as `TextNode` with per-run style ranges. Font loading is explicit and substitutions are counted rather than hidden.
2. **Assets stay local.** The Figma UI passes only NODE-23 validated embedded payloads from the parsed `.wtf`; the main runtime does not fetch external resources.
3. **SVG stays editable.** Only sanitized SVG payloads are converted to Figma SVG/vector nodes. SVG is not rasterized merely for implementation convenience.
4. **Native paint first.** Solid fills, common gradients, image fills, radii, strokes, shadows, opacity and equivalent blend modes use Figma-native properties.
5. **Identity survives replacement.** Text/SVG replacement preserves sibling index, geometry, name and all W2F pluginData.
6. **Failure remains transactional.** A fatal NODE-26 mutation failure rolls back the complete import root created by NODE-25.
7. **Unsupported fidelity is explicit.** Browser effects without a faithful native Figma representation are left to the NODE-24 capability decision plus NODE-28 hybrid/raster execution; NODE-26 must not counterfeit fidelity with empty layers.

## Consequences

### Positive

- imported text is genuinely editable;
- embedded images are visible without network access;
- SVG remains an editable vector hierarchy;
- core CSS paint survives as Figma-native styling;
- source mapping and revision metadata remain usable for future re-import/update workflows;
- the implementation continues to honor the high-fidelity acceptance standard without collapsing the whole page into a screenshot.

### Tradeoffs

- missing local fonts can change line breaking and therefore visual fidelity;
- Figma cannot natively encode every CSS border/filter/mask/gradient primitive exactly;
- native text/vector editability sometimes conflicts with pixel-perfect browser raster output.

Those tradeoffs are intentional and measurable. NODE-29 compares the result against Pixel Ground Truth, while NODE-28 supplies selective raster fallback only where the capability policy requires it.

## Rejected alternatives

### Rasterize every text/asset subtree

Rejected because it violates the editable-layer acceptance contract and destroys useful Figma semantics.

### Fetch fonts/images again during Figma import

Rejected because it makes imports nondeterministic, breaks offline/local files, expands security/network permissions and can retrieve content different from the captured revision.

### Store raw resources inside pluginData

Rejected because pluginData is for compact identity/revision metadata, not full IR or binary payload storage.
