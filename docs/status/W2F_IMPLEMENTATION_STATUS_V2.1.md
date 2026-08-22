# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-10 — Text / Inline / Pseudo Capture  
**Current State:** NEXT — begins after PR #13 merge  
**Date:** 2026-08-23

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
- NODE-02 — DONE / shared schema CI PASS / PR #6 merged
- NODE-03 — DONE / IR CI PASS / PR #7 merged
- NODE-04 — DONE / stable identity CI PASS / PR #8 merged
- NODE-05 — DONE / Browser MV3 shell CI PASS / PR #9 merged
- NODE-06 — DONE / source providers & offline CI PASS / PR #10 merged
- NODE-07 — DONE / region selector & redaction CI PASS / PR #11 merged
- NODE-08 — DONE / Standard DOM capture CI PASS / PR #12 merged
- NODE-09 — DONE / CDP High Fidelity dual-profile CI PASS / PR #13 pending final docs CI/merge
- NODE-10 — NEXT after PR #13 merge
- NODE-11+ — TODO

## NODE-09 Snapshot

NODE-09 preserves the NODE-08 adapter-neutral `RawSnapshot` boundary and adds an optional Chrome DevTools Protocol evidence path.

High Fidelity evidence includes:

- `DOMSnapshot.captureSnapshot`;
- `Page.getLayoutMetrics`;
- `Page.getFrameTree`;
- `Page.captureScreenshot`;
- DPR evaluation;
- paint order;
- backend node IDs;
- browser page zoom / visual viewport evidence;
- explicit unavailable-frame diagnostics.

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

## NODE-09 Code Exit Gate

Final standard read-only frozen-lockfile code/security/build run:

```text
32586474296
```

validated commit:

```text
ef953d3a72f8a070c194423b7d22dd30e1f97737
```

All formal gates passed:

- dependency-free foundation validation;
- frozen lockfile install;
- lint;
- strict typecheck;
- complete tests;
- Standard Browser build/package validation;
- High Fidelity Browser build/package validation;
- format check.

Normative NODE-09 docs:

- `docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md`;
- `docs/adr/ADR-0009-cdp-high-fidelity-permission-and-raw-snapshot-boundary.md`;
- `docs/nodes/NODE-09_CDP_HIGH_FIDELITY_ADAPTER.md`.

## Blockers

No implementation blocker remains. Final docs/status standard CI and PR #13 merge are the only transition gates before NODE-10.

## Next

Merge PR #13 after final docs/status CI, then proceed to `NODE-10 — Text / Inline / Pseudo Capture` from the merged `main` baseline.
