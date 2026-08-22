# ADR-0005 — Browser Extension MV3 Shell and Permission Boundary

**Status:** Accepted  
**Date:** 2026-08-22  
**NODE:** 05

## Context

The browser side now moves from protocol/IR foundation into a real Chromium extension. The shell must survive Manifest V3 service-worker lifecycle constraints, expose the full-page/region product entrypoints, and prepare later capture nodes without prematurely requesting broad access to every website.

NODE-05 also needs a build output that can be loaded as an unpacked extension rather than a TypeScript-only compile proof.

## Decision

W2F Capture uses Manifest V3 with:

```text
popup
module service worker
dynamically injected content bridge
chrome.storage.local job state
typed internal message protocol
```

### Permission decision

NODE-05 requests exactly:

```text
activeTab
scripting
storage
```

It does not declare broad `host_permissions` or static all-site `content_scripts`.

The user invokes the extension action, after which the service worker injects the content bridge into the active tab through `chrome.scripting`.

Permissions required by later capabilities are owned by those nodes:

- local/offline/source-provider access: NODE-06;
- debugger/CDP high-fidelity access: NODE-09.

### Service-worker state decision

Capture job state is persisted in `chrome.storage.local` rather than relying on service-worker globals.

This accommodates MV3 worker suspension/restart and makes job state inspectable from popup/options surfaces.

### Packaging decision

The TypeScript compiler writes to temporary staging. The extension packager then copies only the browser runtime plus static MV3 files into:

```text
apps/browser-extension/dist
```

The staging directory is deleted before build completion.

A package validator is mandatory in the build command.

## Consequences

Positive:

- the extension follows current Manifest V3 lifecycle semantics;
- users do not grant all-sites access merely to install NODE-05;
- later permissions remain capability-specific and explainable;
- persistent jobs survive worker restarts;
- `dist` is directly loadable through Chromium developer mode;
- package/security drift fails CI.

Trade-offs:

- some later source-provider flows will need explicit optional host/local permissions;
- restricted browser pages cannot be injected through `activeTab` and must fail visibly;
- content-script injection occurs per user-initiated job rather than being always resident.

## Rejected alternatives

### Always-on `<all_urls>` content script

Rejected because it grants broader access than NODE-05 needs and weakens the Local First / least-privilege posture.

### Broad host permissions at install time

Rejected because NODE-05 does not yet implement source-provider behavior that justifies them.

### Long-lived in-memory service-worker job state

Rejected because Manifest V3 service workers are not guaranteed to remain alive.

### TypeScript output alone as the extension build

Rejected because a successful compiler invocation does not prove that the manifest, HTML surfaces and referenced runtime files form a loadable extension.

### Remote-hosted runtime modules

Rejected. Extension runtime code must remain local/self-contained and compatible with the self-only MV3 extension-page CSP.
