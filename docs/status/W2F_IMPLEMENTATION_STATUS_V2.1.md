# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-08 — Standard DOM Capture  
**Current State:** NEXT — blocked only until PR #11 merge  
**Date:** 2026-08-22

> Canonical live status is `docs/IMPLEMENTATION_STATUS.md`. This file is a compatibility/status snapshot and must not override the canonical status file.

## Baseline Documents

1. `docs/PRODUCT_BASELINE_V2.md`
2. `docs/ACCEPTANCE_CONTRACT_V2.md`
3. `docs/CAPTURE_SEMANTICS.md`
4. `docs/KNOWN_LIMITATIONS.md`
5. `docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md`
6. `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md`
7. `docs/adr/ADR-0000-architecture-baseline-freeze.md`
8. `docs/adr/ADR-0001-node-pnpm-toolchain-and-lockfile-policy.md`

## Progress

- NODE-00 — DONE / PASS / PR #3 merged
- NODE-01 — DONE / frozen-lockfile CI PASS / PR #4 merged
- NODE-02 — DONE / schema CI PASS / PR #6 merged
- NODE-03 — DONE / IR CI PASS / PR #7 merged
- NODE-04 — DONE / stable identity CI PASS / PR #8 merged
- NODE-05 — DONE / Browser MV3 shell CI PASS / PR #9 merged
- NODE-06 — DONE / source providers & offline CI PASS / PR #10 merged
- NODE-07 — DONE / region selector & redaction CI PASS / PR #11 merge pending
- NODE-08 — NEXT after PR #11 merge
- NODE-09+ — TODO

## NODE-07 Completed

NODE-07 establishes the interactive region-selection/redaction boundary consumed by NODE-08 capture:

```text
Free Rectangle
Smart Element
Selection Root + Root Clip
Redact / Exclude
```

Implemented behavior includes:

- versioned selection contract;
- unrounded double-precision document CSS-pixel geometry;
- Free Rectangle drag selection;
- Smart Element rendered hit testing;
- lightweight edge snap with `Alt` bypass;
- keyboard cancel/confirm and 1px / 10px nudge;
- edge auto-scroll and wheel scrolling while active;
- selection-root evidence with explicit root clip;
- Redact and Exclude masks clipped to the selected region;
- closed-Shadow-DOM interaction overlay;
- deterministic cleanup and cancellation;
- service-worker/content protocol integration;
- region evidence persistence in capture job state;
- final Browser package/runtime validation.

Browser permissions remain:

```text
activeTab
scripting
storage
```

No broad host permissions, `<all_urls>`, debugger permission or static content script was added. NODE-07 does not read cookies, local/session storage, authorization headers, auth tokens or form values, and does not perform NODE-08 DOM serialization.

## NODE-07 Final Validation

Temporary write-enabled formatter removed.

Final standard read-only frozen-lockfile GitHub Actions run:

```text
32577222247
```

validated commit:

```text
d342db88388490dcaf3eaab4c3399aaa902dc3d1
```

All formal gates passed:

- foundation validation;
- Node.js 24 / pnpm 11.22.0;
- frozen lockfile install;
- lint;
- typecheck;
- tests;
- build;
- Browser package/runtime validation;
- Prettier format check.

## Blockers

No implementation blocker. PR #11 merge is the only remaining transition gate before NODE-08 implementation.

## Next

Merge PR #11, then proceed to `NODE-08 — Standard DOM Capture` from the merged `main` baseline.
