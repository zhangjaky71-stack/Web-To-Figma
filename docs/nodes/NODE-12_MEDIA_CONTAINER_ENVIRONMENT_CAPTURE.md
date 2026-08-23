# NODE-12 — Media / Container / Environment Capture

## Status

**IMPLEMENTED — formal read-only frozen-lockfile Exit Gate pending**

## Entry baseline

NODE-12 starts from merged NODE-11 `main` commit:

```text
6e3038184c29b63ad5c346c413d2675aeba52513
```

Working branch / PR:

```text
feat/node-12-media-container-environment-capture
PR #16
```

## Goal

Capture the browser environment, media-query state and container-query/container context needed to explain the current rendered snapshot while preserving browser authority, missing-evidence semantics and the frozen NODE-15/NODE-16 responsive boundary.

## Delivered

### Platform-neutral environment package

Added:

```text
packages/environment-capture
@w2f/environment-capture
```

Sidecar version:

```text
EnvironmentCapture 1.0.0
```

The package normalizes environment/media/container evidence deterministically and maps it onto existing W2F IR contracts.

### RawSnapshot compatibility

NODE-12 keeps:

```text
RawSnapshot 1.0.0
```

unchanged.

The environment sidecar is associated with one raw snapshot by deterministic snapshot identity instead of expanding the validated RawSnapshot contract.

### Environment evidence

Captured evidence includes:

- browser identity/version;
- platform and language;
- writing direction;
- color scheme;
- reduced motion;
- viewport size;
- DPR;
- visual viewport scale when observed;
- browser page zoom when observed;
- explicit page-zoom and CSS-zoom availability.

Standard capture preserves unavailable page zoom rather than fabricating `1`. High Fidelity reuses CDP layout-metric page-zoom evidence where available.

### Media-feature evidence

Browser `matchMedia` capture includes current state for:

- color scheme;
- reduced motion;
- contrast preferences;
- reduced transparency;
- forced colors;
- hover / any-hover;
- pointer / any-pointer input capabilities.

Feature records preserve query, result and availability.

### `@media` rule traces

Standard CSSOM acquisition traverses accessible document/adopted/open-shadow/same-origin-frame stylesheets and records:

- query text;
- current activity;
- active snapshot identity;
- affected properties;
- affected captured source nodes;
- stylesheet/rule provenance.

Inactive rules are retained as evidence rather than discarded.

### Container evidence

NODE-12 captures computed `container-name` and `container-type` for captured elements that establish query containers. The sidecar contract also supports writing-mode and logical-size evidence.

### `@container` rule traces

NODE-12 records container name/condition, affected properties/nodes and stylesheet/rule provenance.

Container-query activity is deliberately fail-closed when CSSOM cannot prove it. Missing v1 activity evidence normalizes to:

```text
activeAvailability = unavailable
```

with no fabricated boolean.

### Stable IR bridge

The package maps evidence into existing:

```text
WtfCaptureEnvironment
WtfMediaRuleTrace
WtfContainerQueryInfo
```

Portable environment conversion requires observed page zoom. Container affected nodes are mapped through a caller-supplied stable-ID resolver.

### Browser runtime and persistence

Added:

```text
apps/browser-extension/src/runtime/environment-runtime.ts
apps/browser-extension/src/runtime/environment-store.ts
```

IndexedDB contract:

```text
Database: w2f-environment
Store: captures
Key: environment:<jobId>
```

Both Standard and High Fidelity job paths persist the sidecar and expose environment/media/container counts in `CaptureSnapshotReceipt`.

Cancellation/failure cleanup removes Environment evidence together with RawSnapshot/screenshot and CSS Cascade artifacts.

### Browser packaging

The Browser packaging pipeline now includes `@w2f/environment-capture` as a runtime package so workspace imports are rewritten to packaged relative module paths for loadable Standard and High Fidelity MV3 outputs.

### Guardrails

Added:

```text
scripts/validate-node-12.mjs
```

and wired it into dependency-free foundation validation.

The guardrail checks the sidecar contract, platform-neutral core boundary, Standard CSSOM acquisition, Browser runtime/store integration, job receipt integration, W2F IR reuse and RawSnapshot version preservation.

## Privacy / permissions

NODE-12 does not read cookies, localStorage, sessionStorage or live form textual values.

Standard permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity continues to add only the existing:

```text
debugger
```

No broad host permission or static content script is introduced.

## Validation coverage

Shared behavior tests cover:

- deterministic media/container normalization;
- portable IR conversion;
- unavailable Standard page zoom;
- duplicate identity rejection;
- invalid observed-zoom rejection;
- additive environment evidence compatibility.

Browser tests cover:

- RawSnapshot-to-environment acquisition input;
- Standard unavailable page zoom;
- High Fidelity observed page zoom passthrough;
- deterministic snapshot identity;
- dedicated environment storage namespace/key validation.

Formal repository validation must still prove:

- dependency-free NODE-08 through NODE-12 + foundation guardrails;
- `pnpm install --frozen-lockfile`;
- ESLint;
- strict TypeScript typecheck;
- complete Vitest suite;
- Standard Browser build/package validation;
- High Fidelity Browser build/package validation;
- pinned Prettier format check;
- no temporary write-enabled workflow in the validated tree.

## Definition of Done

- [x] platform-neutral `@w2f/environment-capture` package
- [x] `EnvironmentCapture 1.0.0` sidecar
- [x] `RawSnapshot 1.0.0` unchanged
- [x] runtime environment contract
- [x] Standard page-zoom evidence remains fail-closed
- [x] High Fidelity page-zoom evidence reused
- [x] color-scheme and reduced-motion capture
- [x] extended media-feature capture
- [x] active/inactive `@media` evidence
- [x] media affected-property/source-node evidence
- [x] container-name/container-type evidence
- [x] authored `@container` evidence
- [x] container-query activity does not fabricate unavailable state
- [x] W2F environment/media/container IR mapping
- [x] Standard CSSOM acquisition
- [x] same-origin iframe/open Shadow DOM traversal
- [x] bounded acquisition and explicit diagnostics
- [x] Browser Environment IndexedDB sidecar
- [x] job receipt integration
- [x] cancellation/failure cleanup
- [x] Browser runtime package integration
- [x] shared behavior tests
- [x] Browser runtime/store behavior tests
- [x] authoritative workspace lockfile updated
- [x] dependency-free NODE-12 guardrail
- [x] normative implementation document added
- [x] ADR-0012 added
- [ ] temporary write-enabled workflow removed
- [ ] formal read-only frozen-lockfile CI passes
- [ ] PR #16 marked ready
- [ ] PR #16 squash merged

## Normative documents

- `docs/MEDIA_CONTAINER_ENVIRONMENT_CAPTURE_V2.md`;
- `docs/adr/ADR-0012-media-container-environment-sidecar.md`;
- this node record.

## Explicit non-goals

NODE-12 does not implement multi-viewport orchestration, responsive inference, asset resolution, raster ground truth, final `.wtf` packaging or Figma rendering.

## Next

After NODE-12 formal Exit Gate and squash merge:

```text
NODE-13 — Asset Resolver
```
