# NODE-24 — Figma Capability Resolver

**Status:** IN PROGRESS  
**Entry baseline:** `23cad5727ac66be448a187e02a6513a854136782`  
**Branch:** `feat/node-24-figma-capability-resolver`

## Frozen scope

- [ ] create `packages/figma-capability-resolver`
- [ ] define Capability Registry
- [ ] accept IR feature + node type + parent context + Figma API capability
- [ ] resolve `NATIVE / EMULATED / WRAPPER / ABSOLUTE / RASTER / UNSUPPORTED`
- [ ] expose deterministic downgrade reasons
- [ ] apply Fidelity / Balanced / Design Friendly RenderProfile policy
- [ ] preserve revision metadata and stable source mapping in the plan contract
- [ ] default token policy to literal values
- [ ] keep Figma node creation outside the package
- [ ] keep actual hybrid/raster rendering in NODE-28
- [ ] permanent NODE-24 foundation gate
- [ ] frozen lockfile update if workspace topology changes
- [ ] repository-wide `pnpm check`
- [ ] exact-head read-only CI
- [ ] squash merge to `main`

## Architecture contract

The resolver is the policy boundary between validated W2F IR and renderer implementation.

Input model:

```text
IR feature
+ node type
+ parent context
+ current Figma API capability
+ RenderProfile
```

Output model:

```text
NATIVE
EMULATED
WRAPPER
ABSOLUTE
RASTER
UNSUPPORTED
```

Capability Registry support states:

```text
native
emulated
partial
unsupported
```

The renderer must consume resolution plans instead of directly branching on platform support throughout rendering code.

## RenderProfile policy

The frozen V2.1 policy layer is:

```text
Fidelity
Balanced
Design Friendly
```

The registry describes what Figma can do. RenderProfile determines which valid strategy is preferred when more than one representation is possible.

Profile policy must never invent unsupported platform capabilities. Every downgrade records a deterministic reason.

## Examples

### Fill sizing

```text
IR wants FILL
→ valid Auto Layout child?
  yes → NATIVE
  no  → wrapper can establish valid context?
        yes → WRAPPER
        no  → ABSOLUTE / fixed+constraints plan
```

### Unsupported complex visual

```text
IR requests a visual the current Figma capability registry cannot represent safely
→ Fidelity may select RASTER
→ Balanced may select EMULATED or RASTER according to fidelity/editability policy
→ Design Friendly prefers an editable approximation when safe
→ if no safe strategy exists → UNSUPPORTED
```

NODE-24 only emits this plan; NODE-28 executes raster fallback.

## Initial capability registry targets

The Baseline names representative platform capabilities including:

```text
grid
gridSpan
minMaxSizing
svgImport
textMixedStyles
absoluteInAutoLayout
imageTransform
```

The implementation may add registry keys only where they are needed by existing V2 IR/render requirements, without expanding V2 scope.

## Exit gate

NODE-24 is complete only when the exact PR head passes:

```text
validate:foundation
frozen pnpm install
lint
typecheck
test
build
format check
```

and the resolver has deterministic fixtures covering native, emulated, wrapper, absolute, raster and unsupported outcomes across all three RenderProfiles.
