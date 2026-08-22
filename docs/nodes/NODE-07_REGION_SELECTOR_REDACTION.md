# NODE-07 — Region Selector & Redaction

## Status

**IN PROGRESS — core selector implementation landed; cloud validation pending**

## Goal

Implement the frozen V2 interactive region-selection/redaction layer on top of the NODE-05 Browser shell and NODE-06 source preflight without prematurely implementing NODE-08 DOM capture.

Authoritative scope:

```text
free rect
smart snap / smart element
keyboard
edge auto-scroll
selection root
root clip
exclude / redaction
```

## Implemented

### Versioned selection contract

Added:

```text
apps/browser-extension/src/runtime/region-selection.ts
```

Contract version:

```text
1.0.0
```

Persisted geometry is `document-css-px` using unrounded JavaScript/JSON double-precision values.

### Interactive content runtime

`apps/browser-extension/src/runtime/content-script.ts` now provides an isolated page overlay with:

- Free Rectangle drag selection;
- Smart Element hover/click selection;
- rendered hit testing with `document.elementsFromPoint`;
- lightweight element-edge snap;
- `Alt` snap bypass;
- edge auto-scroll during drag;
- wheel page scrolling while selector is active;
- size feedback;
- `Esc` cancel;
- `Enter` confirm;
- Arrow 1 CSS px movement;
- Shift+Arrow 10 CSS px movement;
- Redact mask rectangles;
- Exclude mask rectangles;
- Undo latest mask via UI or Delete/Backspace;
- mask clipping to the selected region;
- root hint + root clip output;
- deterministic listener/overlay cleanup.

The overlay is hosted in a closed Shadow DOM and is injected only after explicit user action.

### Browser orchestration

Protocol shell version advanced to:

```text
1.1.0
```

Content protocol adds:

```text
W2F_SELECT_REGION
W2F_CANCEL_REGION_SELECTION
W2F_CONTENT_REGION_RESULT
W2F_CONTENT_SELECTION_CANCELLED
```

Region job phases:

```text
selecting-region
region-selection-complete
selection-cancelled
region-selection-failed
```

Successful region evidence is persisted in `CaptureJobState.region` after structural validation.

### Popup result UX

The popup reports:

- Free vs Smart result;
- selected CSS-pixel size;
- number of masks.

### Packaging boundary

The Browser package validator now requires `runtime/region-selection.js` and verifies the final content runtime contains NODE-07 selection/cancellation paths while remaining a classic injected script.

## Explicit non-goals

NODE-07 does not implement:

- DOM Source Graph extraction;
- final rectangle intersection tree traversal;
- computed style capture;
- Shadow DOM capture;
- iframe capture;
- asset capture;
- W2F packaging;
- redacted Source/Render node creation.

Those remain NODE-08+ responsibilities.

## Privacy and permissions

NODE-07 reads interaction geometry and limited Smart/root metadata only. It does not read form values, cookies, local/session storage, authorization headers or auth tokens.

V2 automatic safety rules remain mandatory for NODE-08+ regardless of manual mask usage.

Manifest permissions remain exactly:

```text
activeTab
scripting
storage
```

## Tests added/updated

- `test/region-selection.test.ts`
- Browser foundation contract version assertions
- region protocol response validation
- region evidence persistence/rejection tests
- package/runtime validation

## Definition of Done

- [x] versioned region-selection contract
- [x] double-precision document-space geometry
- [x] Free Rectangle selection
- [x] Smart Element selection
- [x] edge snap + explicit bypass
- [x] keyboard confirm/cancel/nudge
- [x] edge auto-scroll
- [x] wheel scrolling while active
- [x] selection root hint
- [x] explicit root clip
- [x] Redact tool
- [x] Exclude tool
- [x] masks clipped to selected region
- [x] session cleanup/cancellation path
- [x] job-state region persistence
- [x] Browser protocol integration
- [x] popup selection summary
- [x] package validator knows region runtime
- [x] permission boundary preserved
- [ ] dependency-free foundation validator updated for NODE-07 invariants
- [ ] lint/typecheck/tests pass in GitHub Actions
- [ ] Browser build/package validator passes in GitHub Actions
- [ ] pinned Prettier check passes
- [ ] final standard frozen-lockfile CI passes
- [ ] PR merged

## Exit rule

Do not begin NODE-08 implementation until NODE-07's completed branch passes the standard read-only frozen-lockfile CI and the NODE-07 PR is merged.

## Next

After completion:

```text
NODE-08 — Standard DOM Capture
```
