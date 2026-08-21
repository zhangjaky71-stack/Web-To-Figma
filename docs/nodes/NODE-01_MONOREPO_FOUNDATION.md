# NODE-01 — Monorepo Foundation

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

## CI

GitHub Actions runs on Node.js 24 and executes the same quality gates on pull requests and pushes to main.

The first branch run generates `pnpm-lock.yaml` as an artifact because the assistant execution container cannot access the npm registry. After that artifact is committed, CI is switched to `--frozen-lockfile`.

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
- [x] GitHub Actions CI
- [ ] lockfile committed
- [ ] CI passes on GitHub with frozen lockfile
