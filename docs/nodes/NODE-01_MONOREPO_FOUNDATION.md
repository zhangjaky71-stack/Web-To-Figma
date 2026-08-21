# NODE-01 — Monorepo Foundation

## Status

**IN PROGRESS — external GitHub Actions runner blocker**

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

TypeScript 6.0.3 is intentionally pinned instead of TypeScript 7 because the current typescript-eslint support range is `>=4.8.4 <6.1.0`; the same typescript-eslint release supports ESLint 10.

## Workspace

```text
apps/
  browser-extension/
  figma-plugin/
packages/
  shared-utils/
scripts/
  validate-foundation.mjs
```

Domain packages are created by their owning NODE to avoid empty architecture shells.

## Build boundary

Each package has separate configs for development/typecheck and production build:

```text
tsconfig.json        → source + tests, noEmit typecheck
tsconfig.build.json  → source only, emits dist
```

This prevents Vitest/test files from leaking into production `dist` output.

`@w2f/shared-utils` therefore exports:

```text
./dist/index.js
./dist/index.d.ts
```

instead of a test-inclusive `dist/src` tree.

## Required commands

```bash
pnpm install --frozen-lockfile
pnpm validate:foundation
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Dependency-free foundation validation

`scripts/validate-foundation.mjs` uses only Node core modules and checks the repository before external packages are available. It validates:

- required workspace/config files exist;
- Node/pnpm pins remain frozen;
- workspace globs remain correct;
- package build/typecheck commands do not drift;
- source-only build configs exist;
- shared-utils exports match build output;
- `.wtf` extension remains `.wtf`;
- `.wtf` MIME remains `application/x-wtf`.

Local execution result:

```text
Foundation validation passed.
```

## Additional local runtime smoke

Because normal npm-registry access is unavailable in the assistant container, a zero-dependency ESM smoke check was also executed using Node's TypeScript type-stripping support.

Verified at runtime:

- `WTF_FILE_EXTENSION === ".wtf"`;
- `WTF_MIME_TYPE === "application/x-wtf"`;
- `capture.WTF` is accepted;
- legacy `capture.w2f` is rejected;
- browser-extension app id is stable;
- Figma-plugin app id is stable.

Result:

```text
runtime smoke passed
```

## Other local validation completed

- JSON parse: PASS;
- YAML parse: PASS;
- `eslint.config.mjs` ESM syntax: PASS;
- monorepo/workspace structure review: PASS;
- dependency-version compatibility review: PASS.

The assistant execution container cannot access the npm registry, so full dependency installation still requires a functioning external runner.

## GitHub Actions diagnostic

PR #4 triggers GitHub Actions, but both the real CI job and a minimal diagnostic job fail before any workflow step executes.

Observed runs:

- CI run `32477712350` — failure before lockfile artifact;
- CI run `32477835968` — failure before lockfile artifact;
- CI run `32477926703` — failure;
- Diagnostic run `32477926786`, attempt 1 — failure;
- Diagnostic run `32477926786`, attempt 2 — failure; `steps=[]`.

Attempt 2 was accepted by GitHub, queued, started, and then failed within seconds without running the single `echo/node/npm` step. This confirms the remaining blocker is at the private-repository GitHub Actions execution environment level rather than inside W2F package installation, source code, lint, tests, or build tasks.

The diagnostic workflow is retained as manual-only so it does not create noise on every PR commit.

## Definition of Done

- [x] pnpm workspace configured
- [x] Turborepo task graph configured
- [x] strict shared TypeScript config
- [x] ESLint flat config
- [x] Prettier config
- [x] browser-extension compile/test shell
- [x] figma-plugin compile/test shell
- [x] shared-utils proof package
- [x] source-only `tsconfig.build.json` configs
- [x] `.wtf` constants protected by tests
- [x] dependency-free foundation validator
- [x] local foundation validator PASS
- [x] local zero-dependency runtime smoke PASS
- [x] GitHub Actions CI workflow committed
- [x] local static JSON/YAML/ESM validation
- [ ] GitHub Actions runner executes a trivial workflow
- [ ] `pnpm-lock.yaml` generated and committed
- [ ] CI switched to `pnpm install --frozen-lockfile`
- [ ] lint passes
- [ ] typecheck passes
- [ ] Vitest tests pass
- [ ] build passes
- [ ] format check passes

## Exit rule

NODE-01 must remain IN PROGRESS until the Actions environment can execute jobs, `pnpm-lock.yaml` is committed, and the frozen-lockfile quality pipeline passes. Do not advance the canonical implementation status to NODE-02 before those gates pass.
