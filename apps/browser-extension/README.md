# Browser Extension

Chromium Manifest V3 capture application for Web-To-Figma.

## NODE-05 shell

Build the loadable extension from the repository root:

```bash
pnpm --filter @w2f/browser-extension build
```

The unpacked extension is emitted to:

```text
apps/browser-extension/dist/
```

Load that directory from `chrome://extensions` with Developer mode enabled.

The NODE-05 package contains:

```text
manifest.json
popup.html
options.html
shell.css
runtime/
  service-worker.js
  content-script.js
  popup.js
  options.js
  protocol.js
  job-state.js
```

The build runs a package validator after TypeScript compilation. It verifies Manifest V3 entrypoints, the least-privilege permission boundary, self-only extension CSP, the classic injected content script, and the absence of remote runtime code URLs.

## Permission boundary

NODE-05 requests only:

```text
activeTab
scripting
storage
```

It intentionally has no broad `host_permissions` and no always-on `content_scripts`. The content bridge is injected after the user invokes the extension on the active tab.

Source-provider/local-file permissions are implemented in NODE-06 and high-fidelity debugger access belongs to NODE-09.

## Current behavior

The popup can start a full-page or region **shell probe**. The service worker injects the content bridge, reads basic page/viewport geometry, and persists the job result in `chrome.storage.local`.

This proves MV3 runtime lifecycle, messaging and job-state orchestration only. It does not yet capture DOM/CSS/assets or emit `.wtf`; those are implemented by later roadmap nodes.
