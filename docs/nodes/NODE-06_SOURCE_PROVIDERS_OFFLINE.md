# NODE-06 — Source Providers & Offline

## Status

**IN PROGRESS — implementation and cloud functional validation complete; final documentation/CI closeout pending**

## Goal

Implement the frozen V2 source-provider abstraction for online pages and offline/local sources without weakening the NODE-05 least-privilege Browser shell.

Required V2 scope:

```text
HttpPageProvider
FileTabProvider
LocalFolderProvider
local access
relative URL
permissions
capability check
```

## Shared package

Implemented:

```text
packages/source-providers
@w2f/source-providers
```

Contract version:

```text
1.0.0
```

The package is pure source/provider logic and can be reused by later capture and asset nodes.

## HttpPageProvider

Implemented:

- HTTP(S) capability detection;
- normalized source descriptors;
- credential removal from serialized HTTP URLs;
- deterministic relative URL resolution;
- unsafe execution schemes reported as unsupported.

No broad HTTP host permission is added.

## FileTabProvider

Implemented:

- `file:` scheme capability detection;
- explicit distinction between supported and currently available;
- required user action `enable-file-url-access` when Chrome file access is disabled;
- relative local-file resolution when access is enabled.

Browser runtime checks:

```text
chrome.extension.isAllowedFileSchemeAccess()
```

before declaring a local file tab available.

## LocalFolderProvider

Implemented:

- explicit user-selected root model;
- opaque root identity;
- root-relative entry index;
- entry HTML document;
- `local-folder://` virtual locator;
- document-relative and root-relative resolution;
- query/fragment preservation;
- missing-resource `exists: false` evidence;
- duplicate normalized-entry rejection;
- path traversal rejection;
- explicit remote absolute references preserved as network references.

Absolute local-folder operating-system root paths are not required by the provider contract.

## Browser local-folder selection

NODE-06 options UI now contains a direct user directory input using `webkitdirectory`.

It derives root-relative paths from the selected `FileList`, locates an HTML entry document and runs `LocalFolderProvider` capability validation.

The selection is intentionally described as session-local. NODE-06 does not fake persistent filesystem access after the extension page is closed.

## Browser active-tab integration

Added:

```text
apps/browser-extension/src/runtime/source-runtime.ts
```

The service worker now resolves source capability before content-shell injection.

Job startup sequence:

```text
active tab
→ scheme/file-access capability
→ shared provider registry
→ source descriptor
→ persist source in job
→ inject content bridge
→ page probe
```

Unavailable/unsupported sources fail visibly before capture work proceeds.

Protocol adds:

```text
W2F_GET_SOURCE_CAPABILITY
```

## Persistent source evidence

`CaptureJobState` now supports:

```text
source?: SourceDescriptor
```

Persisted source values are validated on read from `chrome.storage.local`.

## Browser runtime packaging

A real extension runtime cannot resolve:

```text
@w2f/source-providers
```

as a pnpm workspace bare specifier.

NODE-06 therefore extends the Browser packaging pipeline to:

- build the shared provider package first through Turborepo;
- copy provider compiled JS into `dist/runtime/source-providers/`;
- rewrite Browser runtime package imports to `./source-providers/index.js`;
- reject unresolved `@w2f/*` runtime imports in the extension package validator.

This keeps one shared implementation while maintaining a loadable Chrome package.

## Permission boundary

Browser manifest remains exactly:

```text
activeTab
scripting
storage
```

NODE-06 adds no:

```text
host_permissions
<all_urls>
debugger
static content_scripts
```

File access remains a Chrome user setting checked at runtime. Local-folder access remains a user-selected extension-page action.

## Tests

Source-provider package:

```text
packages/source-providers/test/providers.test.ts
packages/source-providers/test/local-folder.test.ts
```

13 tests cover:

- HTTP source support;
- credential stripping;
- HTTP relative references;
- unsafe URL handling;
- disabled/enabled file scheme access behavior;
- file-relative references;
- deterministic tab provider selection;
- unsupported browser-internal schemes;
- missing local-folder selection;
- root-scoped local folder descriptors;
- local relative resolution;
- missing local resources;
- traversal protection;
- explicit remote resources;
- duplicate normalized entries.

Browser tests now also cover:

- source-provider contract version;
- `W2F_GET_SOURCE_CAPABILITY` protocol request;
- source capability response envelope;
- source descriptor persistence in capture jobs;
- malformed persisted source rejection.

## Cloud validation history

The first PR CI correctly failed frozen installation before the new workspace importer existed.

Controlled bootstrap generated the authoritative lockfile and canonical source formatting in commit:

```text
0331e3d6c8d12898ebbad0c1e6f5ff34a9d4c8b6
```

After the lockfile update, standard frozen-lockfile CI reached all functional gates.

Run `32568086710` passed:

- foundation validation;
- Node.js 24 / pnpm 11.22.0;
- frozen-lockfile install;
- lint;
- TypeScript 6.0.3 typecheck;
- source-provider tests;
- Browser integration tests;
- full repository tests;
- Browser extension build;
- Browser package validator.

It exposed only canonical formatting differences in two newly edited Browser packaging files.

Run `32568197155` repeated all functional gates successfully after local-folder UI integration and again reduced remaining work to canonical formatting only.

## Normative documentation

- `docs/SOURCE_PROVIDERS_OFFLINE_V2.md`
- `docs/adr/ADR-0006-source-provider-boundary-and-offline-access.md`
- `packages/source-providers`

## Definition of Done

- [x] shared source-providers package created
- [x] `HttpPageProvider`
- [x] `FileTabProvider`
- [x] `LocalFolderProvider`
- [x] structured capability model
- [x] explicit required user actions
- [x] HTTP/file relative URL resolution
- [x] local-folder relative resolution
- [x] local root traversal protection
- [x] local missing-resource evidence
- [x] Chrome file-scheme access preflight
- [x] explicit user local-folder selection surface
- [x] Browser service-worker source preflight
- [x] source descriptor persisted in job state
- [x] Browser protocol source capability request
- [x] Browser remains least-privilege
- [x] source-provider workspace lockfile importer generated
- [x] provider runtime packaged for Chrome resolution
- [x] unresolved workspace runtime imports rejected
- [x] source-provider tests pass
- [x] Browser integration tests pass
- [x] Browser package validation passes
- [ ] canonical formatting passes on completed branch
- [ ] temporary NODE-06 bootstrap workflow removed
- [ ] final standard read-only frozen-lockfile CI passes

## Exit rule

NODE-06 becomes DONE only after canonical formatting is clean, the temporary bootstrap workflow is removed, and the completed branch passes the standard read-only frozen-lockfile CI.

## Next

After completion proceed to:

```text
NODE-07 — Region Selector & Redaction
```
