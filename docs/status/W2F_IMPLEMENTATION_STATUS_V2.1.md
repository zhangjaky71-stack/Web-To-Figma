# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-07 — Region Selector & Redaction  
**Current State:** NEXT  
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
- NODE-06 — DONE / source providers & offline CI PASS / PR #10
- NODE-07 — NEXT
- NODE-08+ — TODO

## NODE-06 Completed

NODE-06 establishes the shared source-provider layer required by later Browser capture and asset nodes:

```text
HttpPageProvider
FileTabProvider
LocalFolderProvider
```

Implemented behavior includes:

- explicit source capability checks and required user actions;
- HTTP/file/local-folder relative reference resolution;
- Chrome file-scheme access preflight;
- explicit user local-folder selection;
- root-scoped local folder indexing;
- local path traversal protection;
- missing local resource evidence;
- Browser service-worker source preflight;
- source descriptor persistence in capture job state;
- Chrome-resolvable packaging of shared provider runtime modules;
- validation that no unresolved `@w2f/*` bare runtime import reaches the final extension package.

Browser permissions remain:

```text
activeTab
scripting
storage
```

No broad host permissions, `<all_urls>`, debugger permission or static content script was added.

## NODE-06 Final Validation

Temporary bootstrap workflow removed.

Final standard read-only frozen-lockfile GitHub Actions run:

```text
32570905251
```

validated commit:

```text
09e31c5e1bfb4efde5f3da3222a0329a26cd32ed
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

None.

## Next

Proceed to `NODE-07 — Region Selector & Redaction` after PR #10 is merged.
