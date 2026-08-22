# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-10 — Text / Inline / Pseudo Capture  
**Current State:** NEXT — begins after PR #13 merge  
**Date:** 2026-08-23

> Canonical live status is `docs/IMPLEMENTATION_STATUS.md`. This file is a compatibility/status snapshot and must not override the canonical status file.

## Progress

- NODE-00 — DONE / PASS / PR #3 merged
- NODE-01 — DONE / frozen-lockfile CI PASS / PR #4 merged
- NODE-02 — DONE / shared schema CI PASS / PR #6 merged
- NODE-03 — DONE / IR CI PASS / PR #7 merged
- NODE-04 — DONE / stable identity CI PASS / PR #8 merged
- NODE-05 — DONE / Browser MV3 shell CI PASS / PR #9 merged
- NODE-06 — DONE / source providers & offline CI PASS / PR #10 merged
- NODE-07 — DONE / region selector & redaction CI PASS / PR #11 merged
- NODE-08 — DONE / Standard DOM capture CI PASS / PR #12 merged
- NODE-09 — DONE / CDP High Fidelity dual-profile CI PASS / PR #13 ready to merge
- NODE-10 — NEXT after PR #13 merge
- NODE-11+ — TODO

## NODE-09 Snapshot

NODE-09 preserves the NODE-08 adapter-neutral `RawSnapshot` boundary and adds an optional Chrome DevTools Protocol evidence path covering DOMSnapshot, layout metrics, frame tree, screenshot, DPR, paint order, backend node IDs and browser scale evidence.

Standard Browser permissions remain:

```text
activeTab
scripting
storage
```

High Fidelity adds only:

```text
debugger
```

No broad host permissions or static content scripts are added. CDP capture always detaches through `finally`, and CDP failure explicitly falls back to Standard capture with diagnostics.

Reference screenshot evidence is stored in IndexedDB separately from RawSnapshot and compact `chrome.storage.local` job state.

## Validation

Code/security/build standard read-only frozen-lockfile run:

```text
32586474296
```

Docs/status standard read-only frozen-lockfile run:

```text
32586638192
```

Both passed the complete repository quality gates, including Standard and High Fidelity Browser package validation.

Normative NODE-09 docs:

- `docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md`;
- `docs/adr/ADR-0009-cdp-high-fidelity-permission-and-raw-snapshot-boundary.md`;
- `docs/nodes/NODE-09_CDP_HIGH_FIDELITY_ADAPTER.md`.

## Blockers

No implementation blocker remains. PR #13 merge is the only transition gate before NODE-10.

## Next

Merge PR #13, then proceed to `NODE-10 — Text / Inline / Pseudo Capture` from the merged `main` baseline.
