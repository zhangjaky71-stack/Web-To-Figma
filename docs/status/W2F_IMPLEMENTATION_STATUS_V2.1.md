# W2F Implementation Status — V2.1 Snapshot

**Export Package Format:** `.wtf` (`application/x-wtf`)  
**Implementation Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Architecture Status:** FROZEN FOR IMPLEMENTATION  
**Current Node:** NODE-01 — Monorepo Foundation  
**Current State:** IN PROGRESS / BLOCKED  
**Date:** 2026-08-21

> Canonical live status is `docs/IMPLEMENTATION_STATUS.md`. This file is a compatibility/status snapshot and must not override the canonical status file.

## Baseline Documents

1. `docs/PRODUCT_BASELINE_V2.md`
2. `docs/ACCEPTANCE_CONTRACT_V2.md`
3. `docs/CAPTURE_SEMANTICS.md`
4. `docs/KNOWN_LIMITATIONS.md`
5. `docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md`
6. `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md`
7. `docs/adr/ADR-0000-architecture-baseline-freeze.md`

## Progress

- NODE-00 — DONE / PASS / merged in PR #3
- NODE-01 — IN PROGRESS / PR #4
- NODE-02+ — TODO

## NODE-01 Implemented

- pnpm/Turborepo workspace foundation
- Node.js 24 LTS policy
- TypeScript/ESLint/Prettier/Vitest baseline
- browser-extension shell
- figma-plugin shell
- shared-utils proof package
- `.wtf` constants and tests
- GitHub Actions CI workflow
- local static JSON/YAML/ESM validation

## Current Blocker

GitHub Actions cannot currently execute even a minimal `ubuntu-latest` diagnostic job in this repository. The diagnostic contains only `echo`, `node --version`, and `npm --version`, so the blocker is classified as repository/Actions execution-environment level rather than W2F source code.

Until Actions executes jobs, the project cannot generate/commit the first `pnpm-lock.yaml` through CI or validate the required frozen-lockfile pipeline.

## Exit Criteria Remaining

- GitHub Actions runner executes successfully
- `pnpm-lock.yaml` committed
- CI uses `pnpm install --frozen-lockfile`
- lint/typecheck/test/build/format all pass

Do not advance to NODE-02 until these gates pass.
