# NODE-25 — Basic Figma Renderer

**Status:** EXIT GATE CANDIDATE  
**Entry baseline:** `e9e4d1e92fa1db7c6e5c050f1b55ed39f688d354`  
**Branch:** `feat/node-25-basic-figma-renderer`  
**PR:** #29

## Frozen scope

V2 Baseline limits NODE-25 to the basic Figma scene graph:

- [x] root
- [x] frames
- [x] hierarchy
- [x] geometry
- [x] naming
- [x] pluginData
- [x] z-order

NODE-25 does **not** own:

- text/font/image/SVG/gradient/border/shadow/clip/mask rendering — NODE-26;
- Auto Layout/Grid/FILL/HUG/FIXED/min-max/constraints — NODE-27;
- actual raster/hybrid fallback execution — NODE-28.

## Package boundary

`packages/figma-renderer` exposes a platform-independent planner + transaction engine behind `W2fBasicFigmaAdapter<TNode>`.

The renderer consumes validated W2F IR and carries NODE-24 policy evidence forward. It does not parse `.wtf` archives and does not re-implement capability policy.

The live adapter is isolated in:

```text
apps/figma-plugin/src/figma-basic-adapter.ts
```

## Basic node contract

NODE-25 reconstructs frame/rectangle-like scene nodes sufficient to rebuild a box-only fixture with:

- deterministic parent/child hierarchy;
- Render Tree `childIds` order preserved as Figma z-order;
- double-precision source geometry preserved until the concrete Figma API boundary;
- absolute page geometry converted to parent-local Figma coordinates;
- deterministic layer naming with safe fallback names;
- stable W2F identity metadata attached through pluginData;
- revision hashes/source mapping carried forward for later incremental/QA use.

Basic placeholders are deliberately neutral. Frame/Rectangle nodes have no fabricated paint; NODE-26 owns the real text/assets/paint reconstruction.

## Import transaction

All real Figma mutations happen inside an import transaction:

```text
BEGIN IMPORT
→ create temporary root `__W2F_IMPORTING__`
→ create the basic scene under that root
→ validate renderer result
→ COMMIT: rename + mark committed + select + viewport
OR
→ ROLLBACK: remove temporary root
```

A fatal renderer/adapter error must not leave a partial imported page in the user's document.

Whole-page imports reuse the transaction root as the Render Tree root so no permanent extra wrapper is required. Selected Sections use one synthetic transaction root when needed to hold one or more selected roots safely.

## PluginData policy

Important created nodes store compact identity/debug/sync metadata only, including:

```text
w2f.nodeId
w2f.sourceNodeIds
w2f.sourceStableIds
w2f.sourceKind
w2f.sourceTag
w2f.sourceSelector
w2f.renderStrategy
w2f.revisionHashes
w2f.importVersion
w2f.tokenPolicy
w2f.renderProfile
```

Root metadata additionally carries document/capture/revision identity and transaction state.

Do not store the full IR or large payloads in pluginData.

## V2.1 invariants

Across NODE-22~28 the renderer preserves:

- revision metadata;
- stable source mapping;
- literal token values as the default token policy;
- RenderProfile policy decisions from NODE-24.

NODE-25 does not reinterpret those policy decisions.

## UI / Main handoff

Only data that already passed NODE-23 secure parsing may reach the basic renderer.

The versioned protocol adds:

```text
W2F_RENDER_BASIC_REQUEST
W2F_RENDER_RESULT
```

Whole Page sends the validated Render Tree root. Selected Sections maps selected section IDs to Render Tree root IDs. Canvas Drop preserves its absolute drop point as the destination for the transaction root.

## Deterministic fixtures

Implemented fixtures cover:

- [x] nested frames/containers;
- [x] rectangle-like leaf nodes;
- [x] fractional geometry and parent-local conversion;
- [x] stable naming fallback;
- [x] pluginData identity/revision/stable-source mapping;
- [x] sibling z-order;
- [x] transaction commit;
- [x] transaction rollback after injected adapter failure;
- [x] selected-subtree rendering without unselected siblings;
- [x] malformed-tree rejection before mutation;
- [x] repeat-plan determinism.

## Bootstrap validation

Controlled Bootstrap CI #638 (`32680383507`) passed the complete repository `pnpm check` and produced candidate:

```text
9b07b67f20a8f67caacda94ee93d4d5b6d16e2f5
```

The candidate contains the permanent foundation import, refreshed frozen lockfile, formatted implementation and the narrowed historical NODE-22/NODE-23 guardrails required for the legitimate NODE-25 phase transition.

## Validation checklist

- [x] renderer core implemented
- [x] live Figma adapter implemented
- [x] Choose/UI Drop/Canvas Drop renderer handoff implemented
- [x] Figma bundle validator extended
- [x] permanent NODE-25 validator authored
- [x] ADR-0025 authored
- [x] permanent foundation import
- [x] frozen lockfile refresh
- [x] repository-wide `pnpm check`
- [ ] exact-head read-only CI
- [ ] squash merge to `main`

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

and a box-only W2F Render Tree can be reconstructed through the renderer adapter with correct root, frame hierarchy, geometry, naming, pluginData, z-order, commit and rollback semantics.
