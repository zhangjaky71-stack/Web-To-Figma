# NODE-07 — Region Selector & Redaction

## Status

**DONE / PASS — final read-only frozen-lockfile CI passed; PR #11 merge pending**

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

## Final validation

The temporary write-enabled formatter has been removed.

Final standard read-only GitHub Actions run:

```text
32577222247
```

Validated commit:

```text
d342db88388490dcaf3eaab4c3399aaa902dc3d1
```

Every formal gate passed:

- dependency-free foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- full repository Vitest suite;
- Browser NODE-07 selection/protocol/job-state tests;
- deterministic Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

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
- [x] dependency-free foundation validator updated for NODE-07 invariants
- [x] lint/typecheck/tests pass in GitHub Actions
- [x] Browser build/package validator passes in GitHub Actions
- [x] pinned Prettier check passes
- [x] temporary write-enabled formatter removed
- [x] final standard frozen-lockfile CI passes
- [ ] PR #11 merged

## Exit rule

NODE-07 implementation is complete and validated. Do not begin NODE-08 implementation until PR #11 is merged into `main`.

## Next

After PR #11 merge:

```text
NODE-08 — Standard DOM Capture
```
