# NODE-25 — Basic Figma Renderer

**Status:** IN PROGRESS  
**Entry baseline:** `e9e4d1e92fa1db7c6e5c050f1b55ed39f688d354`  
**Branch:** `feat/node-25-basic-figma-renderer`

## Frozen scope

V2 Baseline limits NODE-25 to the basic Figma scene graph:

- [ ] root
- [ ] frames
- [ ] hierarchy
- [ ] geometry
- [ ] naming
- [ ] pluginData
- [ ] z-order

NODE-25 does **not** own:

- text/font/image/SVG/gradient/border/shadow/clip/mask rendering — NODE-26;
- Auto Layout/Grid/FILL/HUG/FIXED/min-max/constraints — NODE-27;
- actual raster/hybrid fallback execution — NODE-28.

## Package boundary

Create `packages/figma-renderer` with a Figma API adapter interface so deterministic unit/contract tests do not require a live Figma runtime.

The renderer consumes validated W2F IR plus NODE-24 capability plans. It must not parse `.wtf` archives and must not re-implement capability policy.

## Basic node contract

NODE-25 reconstructs frame/rectangle-like scene nodes sufficient to rebuild a box-only fixture with:

- deterministic parent/child hierarchy;
- source render-tree order preserved as Figma z-order;
- double-precision x/y/width/height until the Figma API boundary;
- deterministic layer naming with safe fallback names;
- stable W2F identity metadata attached through pluginData;
- revision hashes/source mapping carried forward for later incremental/QA use.

## Import transaction

All real Figma mutations happen inside an import transaction:

```text
BEGIN IMPORT
→ create temporary root `__W2F_IMPORTING__`
→ create the basic scene under that root
→ validate renderer result
→ COMMIT: rename/finalize/select/viewport
OR
→ ROLLBACK: remove temporary root
```

A fatal renderer error must not leave a partial imported page in the user's document.

## PluginData policy

Important created nodes store compact identity/debug/sync metadata only, including the NODE-25 equivalents of:

```text
w2f.nodeId
w2f.sourceNodeIds
w2f.sourceStableIds
w2f.renderStrategy
w2f.revisionHashes
w2f.importVersion
```

Do not store the full IR or large payloads in pluginData.

## V2.1 invariants

Across NODE-22~28 the renderer must preserve:

- revision metadata;
- stable source mapping;
- literal token values as the default token policy;
- RenderProfile policy decisions from NODE-24.

NODE-25 must not reinterpret those policy decisions.

## Z-order

Render Tree `childIds` order is authoritative for basic sibling ordering. Creation/append order must be deterministic and tests must prove the same IR yields the same hierarchy/order repeatedly.

## Initial fixtures

Required deterministic fixtures:

1. empty/root document shell;
2. nested frames/containers;
3. rectangle-like leaf nodes;
4. fractional geometry;
5. stable naming fallback;
6. pluginData identity/revision/stable-source mapping;
7. sibling z-order;
8. transaction commit;
9. transaction rollback after injected fatal adapter failure;
10. selected-subtree rendering contract without rendering unselected siblings.

## Exit gate

NODE-25 is complete only when the exact PR head passes:

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

and a box-only W2F Render Tree can be reconstructed through the renderer adapter with correct root, frame hierarchy, geometry, naming, pluginData, z-order, commit, and rollback semantics.
