# NODE-15 — Multi-Viewport Responsive Capture

## Status

**IMPLEMENTATION COMPLETE — exact-head read-only Exit Gate PASS; final PR closure pending**

## Entry baseline

Merged NODE-14 `main` commit:

```text
6bb5fe537d9dfbcf4cbb32b5223979ea15f019b8
```

Working branch:

```text
feat/node-15-multi-viewport-responsive-capture
```

## Frozen scope

```text
responsive snapshot mode
multiple viewport
snapshot orchestration
stable node matching inputs
```

NODE-16 inference is explicitly outside this node.

## Delivered

### Responsive Capture core

Added:

```text
packages/responsive-capture
@w2f/responsive-capture
ResponsiveCapture 1.0.0
```

The core owns:

- frozen common candidates `1440 / 1280 / 1024 / 768 / 390`;
- reduced default preset `1440 / 768 / 390`;
- current/common/custom request contracts;
- viewport dimension/DPR validation;
- viewport de-duplication and deterministic ordering;
- maximum eight viewport plans;
- deterministic viewport ids;
- deterministic child artifact ids;
- `WtfResponsiveSnapshotRef` projection;
- parent sidecar validation/summary;
- stable-node matching evidence contract;
- orchestration diagnostics.

### High Fidelity viewport orchestration

CDP runtime now supports nested session reuse.

Synthetic captures use:

```text
Emulation.setDeviceMetricsOverride
```

and always execute:

```text
Emulation.clearDeviceMetricsOverride
```

in `finally` before the outer owner detaches.

NODE-09 DOMSnapshot, NODE-13 loaded-resource recovery and NODE-14 raster tile capture can reuse the same active debugger session instead of attempting nested attachments.

### Standard capability boundary

Standard supports Current Viewport responsive capture only.

Standard never calls `window.resizeTo`, does not resize the Chrome window and does not claim Common/Custom synthetic support.

### Per-viewport evidence

Every responsive viewport receives a deterministic child artifact id and reuses the complete capture chain:

```text
RawSnapshot
CSS Cascade
EnvironmentCapture
AssetCapture
PixelGroundTruth
```

This preserves active media/container rules, selected responsive assets/currentSrc, geometry and pixel truth for every captured viewport.

Responsive High Fidelity child captures skip the legacy NODE-09 duplicate single reference screenshot because NODE-14 PixelGroundTruth is authoritative.

### Stable node matching inputs

Browser runtime reuses `@w2f/stable-identity` to assign stable identities independently in every child RawSnapshot under the same normalized document scope.

Stored evidence:

```text
captureNodeId
stableNodeId
confidence
signatureHash
sourceParentCaptureNodeId
sourceParentStableNodeId
```

No final cross-snapshot mapping/rule inference is performed.

### Parent persistence

Added:

```text
apps/browser-extension/src/runtime/responsive-capture-store.ts
```

IndexedDB:

```text
Database: w2f-responsive-capture
Store: captures
Key: responsive:<jobId>
```

### Job/protocol integration

Shell protocol advances to `1.4.0` and adds:

```text
W2F_START_RESPONSIVE_JOB
```

Job mode adds:

```text
responsive
```

Running job state persists the deterministic responsive viewport plan so cancellation can derive and remove child artifacts.

Responsive completion receipt contains:

```text
storageKey
mode
plannedViewportCount
capturedSnapshotCount
stableNodeEvidenceCount
diagnosticCount
viewportWidths
```

### Popup UI

Popup now exposes:

```text
Current Viewport
Common Breakpoints 1440 / 768 / 390
Custom
```

Standard disables Common/Custom based on live shell capability. Custom UI accepts widths; the protocol/core can already accept optional explicit height/DPR.

### Browser packaging

Browser runtime packaging includes:

```text
@w2f/responsive-capture
@w2f/stable-identity
@w2f/w2f-schema
```

Added:

```text
validate-node-15-package.mjs
```

Both Standard and High Fidelity builds must pass it.

### Tests

Core tests cover:

- frozen common/default width contracts;
- current viewport planning;
- common planning;
- custom normalization/de-duplication/order;
- viewport count/dimension limits;
- WtfResponsiveSnapshotRef projection;
- stable matching evidence preservation;
- deterministic child artifact ids.

Browser tests cover:

- stable IDs surviving capture-local node id changes;
- stable parent linkage;
- captured viewport/plan mismatch rejection;
- ResponsiveCapture IndexedDB namespace/key;
- nested CDP single-attach behavior;
- device metrics restoration on success and failure.

## Controlled bootstrap evidence

NODE-15 Bootstrap #9, run `32627415523`, completed successfully. Its final repository-shape validation ran complete `pnpm check` after removing the temporary bootstrap workflow and passed:

- NODE-08 through NODE-15 foundation validation;
- canonical lockfile refresh;
- all package lint tasks;
- all typecheck tasks;
- all tests, including Browser Extension 15 test files / 50 tests;
- Standard Browser build and package validators;
- High Fidelity Browser build and package validators;
- canonical format check.

The bootstrap pushed finalization commit:

```text
6d8b1c1809d2467ef8ae08f117e1fd68d212beb5
```

The final tree at that commit contains only permanent `ci.yml` and `diagnostic.yml` workflows. GitHub marked the bot-triggered CI #349 as `action_required` without running jobs, so a normal evidence-only commit was used to trigger the authoritative exact-head read-only CI.

## Exact-head read-only Exit Gate

Standard read-only CI run `32627504377` (#350) completed successfully on head:

```text
adc3d1dfce62fca5167fd5b18ad9e98eae494228
```

The permanent CI verified:

- NODE-08 through NODE-15 foundation validation;
- `pnpm install --frozen-lockfile`;
- all lint tasks;
- all TypeScript typecheck tasks;
- all tests;
- Standard Browser build and all package validators;
- High Fidelity Browser build and all package validators;
- canonical Prettier format check.

NODE-15 implementation Exit Gate is therefore PASS. The remaining actions are PR readiness and squash merge only.

## Definition of Done

- [x] `@w2f/responsive-capture` package
- [x] `ResponsiveCapture 1.0.0` sidecar
- [x] frozen common candidates
- [x] reduced default `1440 / 768 / 390`
- [x] current/common/custom request model
- [x] deterministic viewport plans
- [x] bounded custom viewport validation
- [x] frozen `WtfResponsiveSnapshotRef` reuse
- [x] deterministic child artifact ids
- [x] High Fidelity synthetic viewport orchestration
- [x] nested CDP session reuse
- [x] `Emulation.clearDeviceMetricsOverride` finally restoration
- [x] Standard Current Viewport capability
- [x] Standard no window-resize fabrication
- [x] child RawSnapshot persistence
- [x] child CSS Cascade persistence
- [x] child EnvironmentCapture persistence
- [x] child AssetCapture persistence
- [x] child PixelGroundTruth persistence
- [x] stable identity assignment per snapshot
- [x] stable parent linkage preservation
- [x] no NODE-16 inference
- [x] parent ResponsiveCapture IndexedDB persistence
- [x] responsive job state/receipt
- [x] cancellation child cleanup plan
- [x] Browser popup responsive modes
- [x] Browser runtime package integration
- [x] Standard/High Fidelity NODE-15 package validator
- [x] core tests
- [x] Browser stable/runtime/store/CDP tests
- [x] normative Responsive Capture V2 document
- [x] ADR-0015
- [x] NODE-15 foundation guardrail wired
- [x] authoritative workspace lockfile refreshed
- [x] canonical formatting PASS
- [x] complete `pnpm check` PASS
- [x] Standard package validation PASS
- [x] High Fidelity package validation PASS
- [x] temporary bootstrap absent from final tree
- [x] exact-head read-only frozen-lockfile CI PASS
- [ ] PR ready
- [ ] PR squash merged

## Next

```text
NODE-16 — Responsive Inference Engine
```
