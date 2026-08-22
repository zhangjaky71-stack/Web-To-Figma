# NODE-06 — Source Providers & Offline

## Status

**DONE — final standard read-only frozen-lockfile GitHub Actions PASS**

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

NODE-06 options UI contains a direct user directory input using `webkitdirectory`.

It derives root-relative paths from the selected `FileList`, locates an HTML entry document and runs `LocalFolderProvider` capability validation.

The selection is intentionally session-local. NODE-06 does not fake persistent filesystem access after the extension page is closed.

## Browser active-tab integration

Added:

```text
apps/browser-extension/src/runtime/source-runtime.ts
```

The service worker resolves source capability before content-shell injection.

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

`CaptureJobState` supports:

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

Browser tests also cover:

- source-provider contract version;
- `W2F_GET_SOURCE_CAPABILITY` protocol request;
- source capability response envelope;
- source descriptor persistence in capture jobs;
- malformed persisted source rejection.

## Cloud validation history

The first PR CI correctly failed frozen installation before the new workspace importer existed.

Controlled bootstrap generated the authoritative workspace lockfile and canonical formatting. The final canonical-format bot commit was:

```text
252efa7a27adc42d9c744cd94c78a66d041e585d
```

The temporary write-enabled bootstrap workflow was then removed in:

```text
09e31c5e1bfb4efde5f3da3222a0329a26cd32ed
```

Standard read-only GitHub Actions run:

```text
32570905251
```

validated that commit with every formal gate **PASS**:

- dependency-free foundation validation;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- source-provider tests;
- Browser integration tests;
- full repository Vitest suite;
- Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

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
- [x] canonical formatting passes on completed branch
- [x] temporary NODE-06 bootstrap workflow removed
- [x] final standard read-only frozen-lockfile CI passes

## Exit rule

Satisfied. NODE-06 is DONE.

## Next

Proceed to:

```text
NODE-07 — Region Selector & Redaction
```
