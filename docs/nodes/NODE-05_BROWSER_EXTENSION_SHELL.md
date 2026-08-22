# NODE-05 — Browser Extension Shell

## Status

**DONE — PASS**

## Goal

Replace the NODE-01 compile-only Browser workspace shell with a real Chromium Manifest V3 application shell that later capture nodes can extend without redefining protocol, identity or runtime lifecycle boundaries.

V2 Baseline NODE-05 requires:

```text
popup
service worker
content
message protocol
job state
```

## Implemented product shell

Canonical application:

```text
apps/browser-extension
```

Implemented loadable package structure:

```text
dist/
├ manifest.json
├ popup.html
├ options.html
├ shell.css
└ runtime/
   ├ service-worker.js
   ├ content-script.js
   ├ popup.js
   ├ options.js
   ├ protocol.js
   └ job-state.js
```

## Manifest V3

Implemented:

- `manifest_version: 3`;
- module background service worker;
- action popup;
- options UI;
- self-only extension-page CSP.

NODE-05 permissions are exactly:

```text
activeTab
scripting
storage
```

No broad host permissions and no static always-on content scripts are declared.

## Service worker

`src/runtime/service-worker.ts` implements:

- persistent job reads/writes through `chrome.storage.local`;
- active-tab resolution;
- user-action content bridge injection;
- typed page-probe request/response handling;
- job completion/failure/cancellation;
- fail-visible injection/protocol errors.

The worker does not rely on long-lived module-global job state.

## Content bridge

`src/runtime/content-script.ts` is intentionally a classic injected script.

It is injected with `chrome.scripting.executeScript` only after a user invokes a shell job.

NODE-05 probes:

- URL;
- title;
- document width/height;
- viewport width/height;
- DPR.

It does not capture DOM/CSS/assets yet.

## Message protocol

`src/runtime/protocol.ts` defines and validates:

```text
W2F_GET_SHELL_INFO
W2F_GET_JOB_STATE
W2F_START_JOB
W2F_CANCEL_JOB
W2F_PROBE_PAGE
W2F_CONTENT_PROBE_RESULT
```

Malformed and unknown messages are rejected before consumption.

Shell version:

```text
1.0.0
```

The shell explicitly reports:

```text
captureImplemented: false
```

so the NODE-05 probe cannot be mistaken for completed W2F capture functionality.

## Persistent job state

`src/runtime/job-state.ts` defines:

```text
mode:
  full-page
  region

status:
  idle
  queued
  running
  completed
  failed
  cancelled
```

State includes timestamps, phase, tab, page probe and error evidence when available.

Terminal-state restart is rejected.

Storage key:

```text
w2f.captureJob.v1
```

## Popup/options surfaces

Popup:

- Full page shell action;
- Select area shell action;
- job status/details;
- cancellation;
- options entrypoint;
- clear statement that NODE-05 is shell verification rather than real capture.

Options/status page:

- shell and manifest version;
- permission posture;
- last persisted job;
- status refresh.

## Shared contract integration

The Browser workspace still consumes:

```text
@w2f/w2f-schema
@w2f/w2f-ir
@w2f/stable-identity
```

`src/index.ts` exposes the schema, IR, stable-identity and shell versions together.

NODE-05 does not redefine `.wtf`, Semantic IR or stable identity.

## Deterministic build/package

The Browser build now performs:

```text
clean dist/.build
→ tsc -p tsconfig.build.json
→ package static + runtime files
→ remove temporary compiler staging
→ validate extension package
```

Final output is directly loadable from:

```text
apps/browser-extension/dist
```

## Package validator

`validate-extension-package.mjs` verifies:

- required manifest/runtime/UI files exist;
- Manifest V3 and service-worker entrypoint;
- popup/options entrypoints;
- exact least-privilege permission set;
- no broad host permissions;
- no static content scripts;
- self-only CSP;
- local popup/options scripts;
- no remote HTTP(S) runtime-code URLs;
- injected content script contains no ESM imports/exports.

The dependency-free root foundation validator was upgraded to recognize and enforce this real Browser build contract instead of requiring the old exact `tsc`-only command.

## Tests

Browser suite includes 11 tests across:

```text
test/index.test.ts
test/job-state.test.ts
test/protocol.test.ts
```

Coverage includes:

- shared schema/IR/stable-identity/shell versions;
- deterministic job creation;
- job transition evidence;
- terminal-state protection;
- protocol request allowlist;
- invalid mode/message rejection;
- page-probe response validation;
- success/failure response envelopes.

## Cloud validation history

### Run 32566540441

The first NODE-05 PR run stopped at the dependency-free foundation validator because NODE-01 still required the Browser `build` command to equal exactly:

```text
tsc -p tsconfig.build.json
```

The validator was evolved to preserve the TypeScript requirement while additionally validating NODE-05 package/manifest invariants.

### Run 32566583015

After the validator update:

- foundation: **PASS**;
- frozen lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Browser tests: **11 PASS**;
- all repository tests: **PASS**;
- build: **PASS**;
- Browser extension package validation: **PASS**.

Only canonical Prettier formatting remained.

### Run 32566633555

A controlled format bootstrap used the repository-pinned Prettier 3.9.6, then reran foundation, frozen install, lint, typecheck, tests, build/package validation and format check. All passed.

### Run 32566752960

The NODE-05 documentation formatting pass completed successfully with the same pinned toolchain and package validator.

### Final read-only run 32567397560

The temporary formatting workflow was removed and the canonical read-only quality workflow restored:

```text
permissions:
  contents: read

pnpm install --frozen-lockfile
```

Commit validated:

```text
e3f284875c0e2977048fb25823fe2dc4c4a018e5
```

Final gates:

- foundation validation: **PASS**;
- Node.js 24 / pnpm 11.22.0: **PASS**;
- frozen-lockfile install: **PASS**;
- lint: **PASS**;
- TypeScript 6.0.3 typecheck: **PASS**;
- Browser shell tests: **PASS**;
- full repository Vitest: **PASS**;
- Browser extension build/package validation: **PASS**;
- repository build: **PASS**;
- Prettier format check: **PASS**.

## Normative documentation

- `docs/BROWSER_EXTENSION_SHELL_V2.md`
- `docs/adr/ADR-0005-browser-extension-mv3-shell-and-permission-boundary.md`
- `apps/browser-extension/README.md`
- `apps/browser-extension`

## Definition of Done

- [x] Manifest V3 source manifest
- [x] popup surface
- [x] options/status surface
- [x] module service worker
- [x] user-action injected content bridge
- [x] typed message protocol
- [x] persistent job state
- [x] shell full-page/region entry actions
- [x] least-privilege permission boundary
- [x] no broad default host access
- [x] Browser remains connected to NODE-02/03/04 packages
- [x] loadable `dist` packaging pipeline
- [x] package/security validator
- [x] dependency-free foundation validator updated
- [x] runtime/job/protocol tests
- [x] cloud typecheck/test/build/package validation passes
- [x] canonical pinned formatting applied
- [x] temporary formatting workflow removed
- [x] standard read-only frozen-lockfile CI restored
- [x] final frozen-lockfile CI passes on completed NODE-05 head

## Exit rule

**Satisfied. NODE-05 is DONE / PASS.**

## Next

Proceed to:

```text
NODE-06 — Source Providers & Offline
```

NODE-06 implements `HttpPageProvider`, `FileTabProvider` and `LocalFolderProvider`, including capability checks, relative URL resolution and explicit local/host permission behavior on top of the NODE-05 runtime shell.
