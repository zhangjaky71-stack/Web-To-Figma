# W2F Region Selector & Redaction V2

Status: NODE-07 implementation contract  
Baseline: V2 Baseline + V2.1 Addendum  
Scope owner: Browser Extension

## 1. Purpose

NODE-07 turns the NODE-05 `Select area` shell action into an explicit user-controlled region-selection layer. It produces deterministic selection geometry and exclusion/redaction evidence for later capture nodes.

NODE-07 does **not** serialize the DOM, compute final intersection trees, capture assets, or build W2F Source/Render Trees. Those begin in NODE-08 and later nodes.

## 2. Required interaction modes

The selector supports both:

```text
Free Rectangle
Smart Element
```

Free Rectangle is required because a useful design region may span multiple DOM branches. Smart Element accelerates selection but does not replace free rectangle selection.

## 3. Region geometry contract

Persisted geometry uses document CSS pixels:

```text
coordinateSpace = document-css-px
```

Geometry is stored as JavaScript/JSON double-precision numbers. NODE-07 must not round persisted geometry to integer pixels.

```ts
interface RegionRect {
  x: number
  y: number
  width: number
  height: number
}
```

The shared Browser result is:

```ts
interface RegionSelectionResult {
  version: "1.0.0"
  coordinateSpace: "document-css-px"
  mode: "free-rect" | "smart-element"
  bounds: RegionRect
  viewportBounds: RegionRect
  selectionRoot: RegionSelectionRoot
  exclusions: RegionExclusion[]
}
```

`viewportBounds` is transient placement evidence for the confirmation viewport. `bounds` is the authoritative document-space region.

## 4. Selection root and root clip

NODE-07 records a root hint rather than serializing an intersection tree.

```ts
interface RegionSelectionRoot {
  kind: "document" | "element"
  bounds: RegionRect
  clip: RegionRect
  tagName?: string
  id?: string
  role?: string
  ariaLabel?: string
}
```

For Smart Element mode, the selected element is the preferred root.

For Free Rectangle mode, the selector walks from the element under the selection interaction toward ancestors and chooses an ancestor whose geometry contains the selected rectangle. If no safe element root is found, the document root is used.

The selected rectangle is always retained as `clip`. NODE-08 must use this clip when it later builds the actual intersection tree. NODE-07 must not guess or serialize NODE-08 Source Graph content.

## 5. Smart element and snap behavior

Smart hit testing uses the browser's rendered hit-test order through `document.elementsFromPoint`.

Candidates exclude:

- zero-size boxes;
- `display:none`;
- `visibility:hidden`;
- the W2F overlay itself.

`html`/`body` are de-prioritized when a more specific visible candidate exists.

Free Rectangle mode also provides lightweight edge snapping. The pointer may snap to nearby candidate element edges within the fixed interaction threshold. Holding `Alt` bypasses snap for precise manual placement.

This is an interaction aid only. Persisted selection geometry is the final user-confirmed rectangle, not a DOM ownership claim.

## 6. Keyboard contract

While selection mode is active:

```text
Esc                 Cancel selection
Enter               Confirm selection
Arrow               Move selection by 1 CSS px
Shift + Arrow       Move selection by 10 CSS px
Delete / Backspace  Remove most recent exclusion/redaction
```

Keyboard movement is clamped to current document bounds. Existing mask rectangles move with the main selection.

## 7. Edge auto-scroll

Dragging near viewport edges triggers bounded incremental document scrolling.

Auto-scroll:

- runs only while a drag is active;
- stops when the drag ends or the selector is cleaned up;
- updates selection geometry in document coordinates after scrolling;
- never performs unbounded infinite-page loading.

Wheel input on the overlay is forwarded to document scrolling so a user can navigate the page while selecting.

## 8. Exclude Area and Redaction

After a main region exists, the user can create zero or more mask rectangles:

```ts
type RegionExclusionKind = "redact" | "exclude"
```

```ts
interface RegionExclusion {
  id: string
  kind: RegionExclusionKind
  bounds: RegionRect
}
```

Every mask is clipped to the main selected region before it is persisted.

Semantic intent:

- `redact`: content exists but must not be captured; later capture/render stages must represent this as an explicit redacted area/node or solid placeholder according to the renderer policy.
- `exclude`: omit the marked area from the requested capture scope according to later intersection/capture policy.

NODE-07 records intent and geometry. NODE-08+ perform actual node-level redaction/exclusion.

## 9. Privacy boundary

NODE-07 overlay must not read or persist form values, cookies, localStorage, sessionStorage, request headers, auth tokens, or page source content.

The V2 default safety rules remain mandatory for later capture:

- password input values are never saved;
- auth tokens are not saved;
- cookies are not saved;
- local/session storage is not saved;
- authorization headers are not saved.

Manual redaction is an additional user-control mechanism; it is not a replacement for those automatic safety rules.

## 10. Isolation and cleanup

The overlay is injected only after the explicit Browser action and is hosted in an isolated Shadow DOM.

Cleanup must remove:

- overlay host;
- keyboard listeners;
- scroll listeners;
- animation-frame auto-scroll work;
- active selection session state.

`Esc`, toolbar Cancel, Browser job cancellation, and confirmation all terminate the selection session cleanly.

## 11. Browser job integration

For region mode:

```text
source preflight
→ inject content runtime
→ selecting-region
→ user selection
→ region-selection-complete | selection-cancelled | region-selection-failed
```

Successful `CaptureJobState` stores:

```text
source
page
region
```

The region job is considered complete at NODE-07 when the selection contract is recorded. Actual DOM capture remains `captureImplemented: false` until later nodes.

## 12. Permission boundary

NODE-07 adds no permissions.

The Manifest V3 permission set remains exactly:

```text
activeTab
scripting
storage
```

No broad `host_permissions`, `<all_urls>`, static content script, or debugger permission is introduced.

## 13. Acceptance gates

NODE-07 is complete only when:

- Free Rectangle works;
- Smart Element works;
- edge snap works with explicit bypass;
- keyboard confirm/cancel/nudge works;
- edge auto-scroll works;
- root hint + root clip are emitted;
- Redact and Exclude rectangles are emitted and clipped to selection;
- geometry contract preserves double precision;
- cancellation cleans up the overlay;
- job state persists validated region evidence;
- Browser package remains loadable and least-privilege;
- tests, typecheck, build/package validation and pinned format check pass in standard frozen-lockfile CI.
