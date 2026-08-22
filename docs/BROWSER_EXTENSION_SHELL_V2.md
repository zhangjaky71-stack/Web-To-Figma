# Browser Extension Shell V2

**Status:** NODE-05 implementation contract  
**Baseline:** V2 Baseline + V2.1 Addendum + NODE-02/03/04 shared contracts  
**Shell version:** `1.0.0`

## 1. Purpose

NODE-05 establishes the production Chromium Manifest V3 application shell used by later browser-capture nodes.

It owns:

```text
popup
service worker
content bridge
message protocol
persistent job state
loadable extension packaging
```

It does **not** claim that DOM/CSS/assets are captured yet.

## 2. Manifest V3 contract

Canonical source manifest:

```text
apps/browser-extension/static/manifest.json
```

Required runtime entrypoints:

```text
background.service_worker = runtime/service-worker.js
background.type = module
action.default_popup = popup.html
options_ui.page = options.html
```

The service worker is registered by the manifest. No page-side `navigator.serviceWorker.register()` is used.

## 3. Least-privilege permission boundary

NODE-05 install-time permissions are exactly:

```text
activeTab
scripting
storage
```

The shell intentionally declares no broad `host_permissions` and no always-on `content_scripts`.

The content bridge is injected only after the user invokes the extension on the active tab.

Rationale:

- `activeTab` provides temporary user-invoked access;
- `scripting` performs the explicit content-bridge injection;
- `storage` persists job state across service-worker termination;
- broad/local source permissions belong to NODE-06 capability requests;
- debugger/CDP permission belongs to NODE-09 rather than the default shell.

## 4. Service-worker lifecycle

The MV3 service worker is treated as ephemeral.

No capture job depends on mutable module globals surviving indefinitely.

Canonical persistent job state is written to:

```text
chrome.storage.local["w2f.captureJob.v1"]
```

This keeps the shell recoverable when Chrome suspends and later restarts the extension service worker.

## 5. Job state model

NODE-05 defines:

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

A job stores:

```text
jobId
mode
status
phase
createdAt
updatedAt
tabId?
page probe?
error?
```

Terminal jobs cannot be transitioned back into a running state.

The current shell completes only a **page probe**. Later nodes replace/extend job phases with real source-provider, capture, normalization, asset and packaging phases.

## 6. Message protocol

Shared shell protocol source:

```text
apps/browser-extension/src/runtime/protocol.ts
```

Shell requests:

```text
W2F_GET_SHELL_INFO
W2F_GET_JOB_STATE
W2F_START_JOB
W2F_CANCEL_JOB
```

Service-worker → content request:

```text
W2F_PROBE_PAGE
```

Content → service-worker response:

```text
W2F_CONTENT_PROBE_RESULT
```

Unknown or malformed messages are rejected rather than being implicitly trusted.

## 7. Content bridge

The content bridge is packaged as:

```text
runtime/content-script.js
```

It is a classic injected script rather than an ES module because it is loaded through `chrome.scripting.executeScript({ files: [...] })`.

Repeated injection is idempotent through a page-isolated shell marker.

NODE-05 probe evidence includes only:

```text
location URL
document title
document width/height
viewport width/height
DPR
```

No DOM/CSS source capture is performed at this node.

## 8. Popup

The popup provides two roadmap-aligned entry actions:

```text
Full page
Select area
```

At NODE-05 these actions start shell-probe jobs only.

The UI reports persistent job status and can request cancellation while a job is non-terminal.

The popup does not fabricate `.wtf` output or report capture completion beyond the shell probe.

## 9. Options/status surface

The options page exposes:

- shell/manifest version;
- current permission posture;
- last persisted shell job;
- refresh status.

It is an observability surface, not a source-provider or capture-settings implementation.

## 10. Shared-contract integration

The Browser Extension continues to consume:

```text
@w2f/w2f-schema
@w2f/w2f-ir
@w2f/stable-identity
```

`src/index.ts` verifies shared schema, IR, stable-identity and shell versions in one workspace.

Browser-facing runtime files do not redefine the portable `.wtf` format or Semantic IR.

## 11. Build/package contract

Build command:

```text
pnpm --filter @w2f/browser-extension build
```

Pipeline:

```text
clean
→ TypeScript compile into temporary staging
→ copy static MV3 assets
→ copy runtime JS into dist/runtime
→ remove staging
→ validate loadable package
```

Final unpacked extension:

```text
apps/browser-extension/dist/
```

The output is intentionally separate from raw TypeScript compiler staging so package-only files are explicit and deterministic.

## 12. Package validation

`validate-extension-package.mjs` verifies:

- Manifest V3;
- service-worker path and module type;
- popup/options entrypoints;
- exact NODE-05 permission set;
- no broad host permissions;
- no static content-script declaration;
- self-only extension-page CSP;
- required runtime files exist;
- popup/options use local module entrypoints;
- runtime JS contains no remote HTTP(S) code URLs;
- injected content script contains no ESM import/export syntax.

The root dependency-free foundation validator also checks the key MV3 and permission invariants before dependency installation.

## 13. Security and privacy posture

NODE-05 follows Local First and least privilege:

- no webpage content upload path exists;
- no remote runtime code exists;
- no default all-sites host access exists;
- content access is tied to user invocation;
- state is local extension storage;
- future permissions must be added by the node that needs them and justified there.

## 14. Non-goals

NODE-05 does not implement:

- HTTP/file/local-folder source providers — NODE-06;
- region selector behavior — NODE-07;
- DOM/source capture — NODE-08;
- CDP/debugger capture — NODE-09;
- authored CSS/media/environment capture — NODE-11/12;
- asset resolution — NODE-13;
- `.wtf` archive generation/download — NODE-21.

## 15. Definition of Done

NODE-05 is complete when:

- Manifest V3 shell is loadable from `dist`;
- popup/service worker/content/message/job-state paths compile and test;
- job state survives service-worker lifecycle through `chrome.storage.local`;
- permission boundary is enforced by tests/validators;
- content bridge is user-action injected;
- Browser remains connected to NODE-02/03/04 shared contracts;
- package validator passes in CI;
- standard frozen-lockfile CI passes on the completed branch.
