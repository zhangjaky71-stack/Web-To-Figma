# Multi-Viewport Responsive Capture V2

## Purpose

NODE-15 captures the same document at multiple viewport conditions and preserves enough deterministic evidence for NODE-16 to perform cross-snapshot responsive inference.

NODE-15 does **not** infer responsive rules. It is an acquisition/orchestration node.

The frozen V2 browser modes are:

```text
Responsive Capture

Current Viewport
Common Breakpoints
Custom
```

Frozen common width candidates:

```text
1440
1280
1024
768
390
```

The default practical Common preset is reduced to:

```text
1440 / 768 / 390
```

This follows the V2 performance/product recommendation while preserving the full candidate list as an explicit contract.

## Sidecar

NODE-15 adds:

```text
ResponsiveCapture 1.0.0
```

The sidecar contains:

- normalized viewport plan;
- frozen `WtfResponsiveSnapshotRef` projections;
- child artifact ids/sidecar references;
- stable-node matching evidence;
- orchestration diagnostics.

It does not version-bump RawSnapshot, W2F Schema or W2F IR.

## Viewport plan

A viewport is normalized as:

```ts
{
  id: string
  width: number
  height: number
  dpr: number
  source: "current" | "synthetic"
}
```

Deterministic id:

```text
viewport:<width>x<height>@<dpr>
```

Limits:

```text
width: 240..10000 CSS px
height: 240..10000 CSS px
DPR: 0.5..8
max viewports: 8
```

Custom duplicates are removed and the final plan is deterministically ordered from larger to smaller width.

## Width-first common capture

The V2 common list is width-based. For Common mode NODE-15 changes width while preserving the current viewport height and DPR.

This is deliberate: changing width, height and DPR simultaneously would make later responsive evidence harder to attribute.

Custom mode may explicitly provide height/DPR; omitted values inherit the current viewport.

## Standard profile

Standard mode supports:

```text
Current Viewport
```

It captures one responsive snapshot using the real current browser viewport.

Standard does **not**:

- resize the browser window;
- call `window.resizeTo`;
- scroll/zoom the page to emulate breakpoints;
- claim Common/Custom synthetic support.

The popup disables Common/Custom controls when the High Fidelity capability is absent.

## High Fidelity profile

Common and Custom synthetic viewports use Chrome DevTools Protocol:

```text
Emulation.setDeviceMetricsOverride
```

with:

```text
width
height
deviceScaleFactor
mobile = false
```

The existing explicit `debugger` permission is reused. No new broad host permission is introduced.

### Nested CDP session reuse

NODE-09/13/14 already use CDP for DOMSnapshot, resource recovery and raster tiles. Responsive orchestration must not attach a second debugger while an override is active.

NODE-15 therefore introduces a nested session boundary:

```text
responsive viewport session
  ├ setDeviceMetricsOverride
  ├ DOMSnapshot capture
  ├ resource recovery
  ├ Pixel Ground Truth tile capture
  └ clearDeviceMetricsOverride
```

Nested CDP operations reuse the outer session.

The outer owner alone detaches.

### Mandatory restoration

Every synthetic viewport is wrapped by `try/finally`:

```text
setDeviceMetricsOverride
→ capture
→ finally clearDeviceMetricsOverride
→ detach
```

Failure, cancellation or downstream sidecar errors must never leave device emulation active on the user's tab.

## Per-viewport child artifact transaction

Every viewport receives a deterministic child artifact identity:

```text
<parentJobId>:responsive:<encodedViewportId>
```

The existing capture pipeline is reused under that identity:

```text
RawSnapshot
CSS Cascade
EnvironmentCapture
AssetCapture
PixelGroundTruth
```

This avoids overwriting stores that are keyed by job id and avoids changing the already frozen sidecar formats.

For responsive High Fidelity children the obsolete NODE-09 single legacy reference screenshot is not duplicated. NODE-14 PixelGroundTruth is the authoritative pixel/tile evidence.

## Responsive snapshot projection

Each completed child produces the already frozen V2 structure:

```ts
interface WtfResponsiveSnapshotRef {
  id: string
  viewport: {
    width: number
    height: number
    dpr: number
  }
  rootNodeId: string
  environmentRef: string
  stateRef?: string
}
```

Captured viewport dimensions are checked against the orchestration plan. A mismatch is a capture failure rather than evidence for a different viewport.

## Environment/media evidence

Because CSS Cascade and EnvironmentCapture are executed separately inside each synthetic viewport, NODE-15 naturally preserves:

- active/inactive media query evidence;
- container query evidence;
- computed/authored style differences;
- browser geometry differences;
- asset/currentSrc changes;
- Pixel Ground Truth for each viewport.

NODE-16 consumes these differences. NODE-15 does not interpret them.

## Stable node matching inputs

NODE-15 reuses `@w2f/stable-identity` from NODE-04.

For each RawSnapshot it builds stable identity inputs from captured evidence including:

- same normalized document locator/document scope;
- tag/namespace/role;
- stable id attribute;
- stable data attributes;
- meaningful class candidates;
- semantic ancestry;
- structural sibling position/document order;
- normalized text evidence.

The ResponsiveCapture sidecar stores per node:

```text
captureNodeId
stableNodeId
confidence
signatureHash
sourceParentCaptureNodeId
sourceParentStableNodeId
```

This is **matching evidence**, not the final cross-snapshot mapping result.

NODE-16 owns:

```text
cross-snapshot match
breakpoint detection
visibility transitions
layout-mode changes
FILL / HUG / FIXED
responsive ranges
rule confidence
```

## Transaction and cancellation

Responsive capture is a parent transaction with N child capture transactions.

The parent job stores the deterministic viewport plan while running. Therefore cancellation can derive every child artifact id and delete:

- RawSnapshot;
- CSS Cascade;
- EnvironmentCapture;
- AssetCapture;
- PixelGroundTruth;
- parent ResponsiveCapture.

Cancellation is checked before and after every viewport capture.

APIs that cannot be aborted mid-command complete their current bounded operation, then observe cancellation and clean up.

## Storage

Parent sidecar IndexedDB:

```text
Database: w2f-responsive-capture
Store: captures
Key: responsive:<jobId>
```

The parent stores references/metadata, not duplicated child binary assets.

## Browser UI

The popup exposes:

```text
Current Viewport
Common Breakpoints 1440 / 768 / 390
Custom widths
```

Custom popup input currently accepts width values; height/DPR inherit the current viewport. The underlying protocol already supports explicit height/DPR for future product UI.

## Privacy and permissions

NODE-15 does not read:

- cookies;
- localStorage;
- sessionStorage;
- passwords/form text values.

It does not add:

- broad host permissions;
- static content scripts;
- browser-window resize permissions.

High Fidelity reuses only the already explicit debugger permission.

## Explicit non-goals

NODE-15 does not implement:

- breakpoint inference;
- responsive rule inference;
- cross-snapshot final match decisions;
- FILL/HUG/FIXED inference;
- visibility-rule generation;
- layout analyzer decisions;
- Figma responsive rendering.

These belong to NODE-16 and later nodes.
