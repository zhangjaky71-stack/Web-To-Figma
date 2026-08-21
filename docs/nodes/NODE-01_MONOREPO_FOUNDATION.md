# NODE-01 — Monorepo Foundation

## Status

**IN PROGRESS — external CI runner blocker**

## Goal

Create a reproducible, CI-enforced TypeScript monorepo foundation for the W2F browser extension, Figma plugin, and shared packages.

## Toolchain

- Node.js 24 LTS
- pnpm 11.22.0
- Turborepo 2.10.11
- TypeScript 6.0.3
- ESLint 10.8.1 + typescript-eslint 8.67.0
- Prettier 3.9.6
- Vitest 4.1.11

TypeScript 6.0.3 is intentionally pinned instead of TypeScript 7 because the current typescript-eslint support range is `<6.1.0`.

## Workspace

```text
apps/
  browser-extension/
  figma-plugin/
packages/
  shared-utils/
```

Domain packages are created by their owning NODE to avoid empty architecture shells.

## Required commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Validation completed

The assistant execution container cannot access the npm registry, so dependency installation cannot be performed locally. Static validation completed successfully for:

- all JSON files;
- YAML workflow/workspace files;
- ESM syntax of `eslint.config.mjs`;
- repository structure and `.wtf` constants.

## GitHub Actions diagnostic

PR #4 successfully triggers GitHub Actions, but both the real CI job and a minimal diagnostic job containing only `echo`, `node --version`, and `npm --version` immediately fail before producing usable step logs/artifacts.

Observed runs:

- CI run `32477712350` — failure;
- CI run `32477835968` — failure;
- CI run `32477926703` — failure;
- Diagnostic run `32477926786` — failure.

Because the minimal runner-only diagnostic fails too, this is classified as a repository/GitHub Actions execution-environment blocker rather than a W2F source-code failure.

The diagnostic workflow is retained as manual-only so it no longer creates noise on every PR commit.

## Definition of Done

- [x] pnpm workspace configured
- [x] Turborepo task graph configured
- [x] strict shared TypeScript config
- [x] ESLint flat config
- [x] Prettier config
- [x] browser-extension compile/test shell
- [x] figma-plugin compile/test shell
- [x] shared-utils proof package
- [x] `.wtf` constants protected by tests
- [x] GitHub Actions CI workflow committed
- [x] local static JSON/YAML/ESM validation
- [ ] GitHub Actions runner executes a trivial workflow
- [ ] lockfile generated and committed
- [ ] CI passes with `--frozen-lockfile`

## Exit rule

NODE-01 must remain IN PROGRESS until the Actions environment can execute jobs, `pnpm-lock.yaml` is committed, and the frozen-lockfile quality pipeline passes. Do not advance the canonical implementation status to NODE-02 before those gates pass.
