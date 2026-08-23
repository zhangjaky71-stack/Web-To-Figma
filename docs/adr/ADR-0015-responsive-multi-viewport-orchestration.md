# ADR-0015 — Multi-Viewport Responsive Capture Orchestration

## Status

Accepted for NODE-15 implementation; formal Exit Gate pending.

## Context

The frozen V2 architecture requires multiple responsive snapshots so later inference can compare browser truth across viewport widths. Existing capture sidecars are keyed by one job id, High Fidelity already owns an explicit debugger capability, and NODE-04 already defines stable identity semantics.

NODE-15 must add multi-viewport evidence without:

- changing RawSnapshot/W2F V2 contracts;
- mutating the user's browser window in Standard mode;
- losing child sidecar evidence through key overwrite;
- allowing nested debugger attach conflicts;
- implementing NODE-16 inference early.

## Decision

Introduce `ResponsiveCapture 1.0.0` as an additive parent sidecar.

### Capture modes

Support:

```text
current
common
custom
```

Freeze common candidates `1440, 1280, 1024, 768, 390`, with reduced default `1440 / 768 / 390`.

### Standard capability

Standard supports only current viewport responsive evidence. It does not resize browser windows or synthesize breakpoints.

### High Fidelity capability

Common/Custom use `Emulation.setDeviceMetricsOverride` under the existing debugger permission.

Every override must be cleared in `finally`.

### Nested CDP reuse

Use one outer CDP session for one responsive viewport and allow DOMSnapshot/resource/raster helpers to reuse that attached session. This prevents duplicate debugger attachment while preserving existing NODE-09/13/14 helpers.

### Child artifact identities

Every responsive viewport uses a deterministic derived job/artifact id. Existing Raw/CSS/Environment/Asset/Pixel stores remain unchanged and cannot overwrite another viewport's evidence.

### Stable matching evidence

Reuse NODE-04 stable identity assignment on every viewport capture. Store assignment ids, confidence, signatures and parent linkage as NODE-16 inputs.

Do not calculate final cross-snapshot matches or responsive rules in NODE-15.

## Consequences

### Positive

- multiple browser-truth snapshots with frozen W2F references;
- existing sidecar contracts remain compatible;
- media/container/currentSrc/pixel evidence is independently captured at each viewport;
- stable identity inputs are available to NODE-16;
- Standard remains least-privilege and non-mutating;
- High Fidelity restores the user's tab after every synthetic viewport;
- child artifacts are transactionally cleanable.

### Costs

- High Fidelity multi-viewport capture is intentionally heavier than current-view capture;
- each synthetic width may produce a full Raw/CSS/Environment/Asset/Pixel evidence set;
- default Common mode is limited to three widths to control cost;
- CDP session ownership becomes a shared runtime concern and requires strict `try/finally` discipline.

## Rejected alternatives

### Resize the Chrome window in Standard mode

Rejected. It visibly mutates the user's workspace, depends on window chrome dimensions and is not deterministic enough for browser-truth evidence.

### Scroll/zoom to fake responsive widths

Rejected. It does not change CSS viewport width semantics and can alter sticky/lazy/animation state.

### Store all viewports under the parent job id

Rejected. Existing sidecar stores would overwrite earlier viewport captures.

### Infer breakpoints during capture

Rejected. NODE-15 is evidence acquisition; NODE-16 is the responsive inference boundary.

### Create a second debugger attachment for nested asset/raster capture

Rejected. Chrome debugger attachment is exclusive and nested attach would fail or race the outer responsive override.

## Follow-up

NODE-16 consumes ResponsiveCapture + child sidecars to perform cross-snapshot mapping and responsive inference. NODE-21 packages responsive refs/artifacts into `.wtf`, and NODE-27 later renders responsive layout behavior in Figma.
