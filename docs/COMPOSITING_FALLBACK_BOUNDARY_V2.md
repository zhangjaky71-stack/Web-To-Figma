# Compositing & Fallback Boundary V2

## Purpose

NODE-20 determines the smallest safe raster fallback subtree after NODE-19 has frozen the Render Tree hierarchy. It analyzes pixel dependencies; it does not re-optimize hierarchy and does not decide final Figma API capability support.

## Evidence

The engine consumes the `WtfRenderTree` produced by NODE-19, including paint evidence for blend mode, filter, backdrop filter, mask, opacity and isolation, plus existing render strategies and semantic node kinds.

The core is deterministic and Browser-global free.

## Local fallback seeds

The following are local raster candidates before compositing promotion:

- canvas;
- captured video frame;
- existing `raster` or `fallback` RenderNodes;
- nodes already marked `unsupported`;
- `mix-blend-mode` and `backdrop-filter` nodes whose final pixels directly depend on a backdrop.

A local Canvas/WebGL-like visual remains local when independent. NODE-20 must not rasterize an otherwise independent parent merely to simplify implementation.

## Backdrop dependency

`mix-blend-mode` and `backdrop-filter` cannot be reconstructed from the foreground node alone. Their safe boundary includes the nearest captured subtree that contains the required sibling/ancestor backdrop. Transparent single-child wrappers are crossed until the first meaningful backdrop contributor, sibling group, isolation boundary, or Render Tree root.

`isolation:isolate` terminates backdrop dependency promotion because it defines an isolated compositing group.

## Flattening dependency

`filter`, mask and group opacity can require a subtree to be flattened as one visual unit. These effects do not automatically become raster fallbacks: final capability support belongs to NODE-24.

However, when a descendant already requires raster fallback, splitting that descendant from native siblings underneath a filter, mask or multi-child opacity group can change pixels. The boundary is therefore promoted to the effect owner. Promotion repeats through nested group effects until stable.

## Minimal safe boundary

The target is the smallest safe fallback subtree, not the smallest DOM node.

Nested or overlapping candidates are deterministically merged under the outer required boundary. Each boundary stores:

- root RenderNode;
- member RenderNodes;
- trigger RenderNodes;
- effects;
- promotion state;
- confidence;
- reasons and source references;
- captured root bounds.

Only boundary roots are changed to `renderStrategy = raster`. Render Tree hierarchy and source mappings remain unchanged.

## Downstream boundary

- NODE-21 packages the resulting data into `.wtf`.
- NODE-24 resolves current Figma API capability.
- NODE-28 materializes native/raster hybrid output.

NODE-20 must not hardcode current Figma feature support.

## Exit gate

NODE-20 requires deterministic unit fixtures, Browser sidecar persistence, Standard/CDP receipt integration, Standard + High Fidelity package validation, permanent foundation guardrails, and exact-head frozen-lockfile CI covering lint, typecheck, tests, build and format.
