# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-01 — Monorepo Foundation  
**Current State:** IN PROGRESS / BLOCKED  
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

- NODE-00 — DONE / PASS / merged in PR #3
- NODE-01 — IN PROGRESS / PR #4 / blocker #5
- NODE-02+ — TODO

## NODE-01 Implemented

- pnpm/Turborepo workspace foundation
- Node.js 24 LTS policy
- TypeScript/ESLint/Prettier/Vitest baseline
- browser-extension shell
- figma-plugin shell
- shared-utils proof package
- source-only build configs
- `.wtf` constants and tests
- dependency-free foundation validator
- bootstrap/frozen lockfile policy
- GitHub Actions CI workflow
- local static/runtime/build-compat validation

## Current Blocker

GitHub Actions cannot currently execute even a minimal GitHub-hosted `ubuntu-latest` diagnostic job in this private repository. Multiple attempts fail before any workflow step executes (`steps=[]` / `steps=null`).

GitHub public status reports Actions operational, so the blocker is treated as repository/account-specific until Actions settings, hosted-runner permission, or private-repository billing/budget is corrected.

Tracked in:

`Issue #5 — BLOCKER: GitHub Actions jobs fail before first step`

Until Actions executes jobs, the project cannot generate and validate the authoritative initial `pnpm-lock.yaml` through the pinned pnpm toolchain or complete the required frozen-lockfile pipeline.

## Exit Criteria Remaining

- GitHub Actions runner executes successfully
- `pnpm-lock.yaml` generated and committed
- CI uses `pnpm install --frozen-lockfile`
- lint/typecheck/test/build/format all pass under pinned versions

Do not advance to NODE-02 until these gates pass.
