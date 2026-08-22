# Source Providers & Offline V2

**Status:** NODE-06 implementation contract  
**Baseline:** V2 Baseline + V2.1 Addendum + NODE-02/03/04/05 shared contracts  
**Provider contract version:** `1.0.0`

## 1. Purpose

NODE-06 freezes the source-provider boundary between Browser runtime access and later capture engines.

The required providers are:

```text
HttpPageProvider
FileTabProvider
LocalFolderProvider
```

The provider layer owns source capability checks, source normalization and relative-reference semantics. It does not capture DOM/CSS/layout yet.

## 2. Shared package

Canonical implementation:

```text
packages/source-providers
```

Package:

```text
@w2f/source-providers
```

Browser Extension consumes the package through `workspace:*`.

## 3. Source-provider contract

A source provider must expose:

```text
kind
getCapability(input)
open(input)
```

Capability output is explicit and fail-visible:

```text
provider
supported
available
code
reason
requiredUserAction?
```

A source is not treated as available merely because its URL shape is recognized.

## 4. Capability codes

NODE-06 defines:

```text
ready
unsupported-scheme
file-scheme-access-disabled
missing-local-folder-selection
invalid-local-folder-selection
```

Required user actions are modeled separately:

```text
enable-file-url-access
choose-local-folder
```

This lets Browser UI explain blocked access without converting a permission problem into a generic capture failure.

## 5. HttpPageProvider

`HttpPageProvider` supports:

```text
http:
https:
```

It provides:

- normalized source descriptor;
- HTTP(S) relative-URL resolution;
- credential removal from serialized URLs;
- explicit rejection of unsupported schemes;
- `javascript:` / `vbscript:` references marked non-resolvable.

NODE-06 does not add broad HTTP host permissions. Current-tab access stays behind NODE-05 `activeTab` and user invocation.

## 6. FileTabProvider

`FileTabProvider` supports:

```text
file:
```

Recognition of a `file:` URL does not imply permission.

Browser runtime must call:

```text
chrome.extension.isAllowedFileSchemeAccess()
```

before reporting the source available.

When Chrome file URL access is disabled, capability is:

```text
supported: true
available: false
code: file-scheme-access-disabled
requiredUserAction: enable-file-url-access
```

When enabled, the provider resolves relative `file:` resources against the current local document.

### Local-path privacy

A `file:` base URL is runtime-local resolution state. Later portable packaging must not expose machine-specific absolute file paths as user-facing portable identity without an explicit sanitization decision.

NODE-06 does not upload or transmit local file paths.

## 7. LocalFolderProvider

`LocalFolderProvider` represents a user-selected local directory independently of a browser `file:` tab.

Required selection input:

```text
opaque rootId
rootName
entry document path
root-relative file entries
```

The provider does not require or serialize an absolute operating-system directory path.

Its portable-safe local locator shape is:

```text
local-folder://<opaque-root-id>/<relative-path>
```

The root ID is opaque. Directory traversal outside the selected root is rejected.

## 8. Local-folder user gesture

The Browser options surface provides an explicit directory input:

```html
<input type="file" webkitdirectory multiple />
```

The extension derives only root-relative paths from `File.webkitRelativePath`.

It builds a session-local index and chooses an entry HTML document using this order:

```text
/index.html
nested */index.html
first *.html or *.htm
```

If no HTML document exists, capability remains unavailable.

The current NODE-06 UI does not claim persistent folder access after the extension page is closed. Long-lived source-handle persistence is not fabricated where the platform contract does not provide it.

## 9. Local-folder relative resolution

Relative references are resolved against the selected entry document.

Supported examples:

```text
../assets/logo.svg
/styles/app.css
./script.js
#fragment
?query=1
```

Resolution preserves query/fragment suffixes while normalizing root-relative file paths.

Paths such as:

```text
../../../../secret.txt
C:/outside/file.txt
/absolute/os/path
```

cannot escape the selected local-folder root.

## 10. Missing local resources

When a relative local-folder resource is not in the selected index, the provider returns:

```text
kind: local-folder
resolvable: true
exists: false
```

It does not silently transform the missing local path into a network request.

Later asset handling can therefore emit accurate diagnostics rather than hiding offline incompleteness.

## 11. Explicit remote resources from offline pages

A selected local document may intentionally reference an absolute remote URL.

For example:

```text
https://cdn.example.com/site.css
```

The provider preserves that as a network reference.

Whether a later capture stage is allowed and able to fetch it is a separate capability/asset-policy decision. NODE-06 only preserves the authored reference semantics.

## 12. Active-tab provider registry

Browser active-tab resolution delegates to the shared package:

```text
resolveTabSource
```

Selection is deterministic:

```text
http/https -> HttpPageProvider
file       -> FileTabProvider
other      -> unsupported-scheme
```

Browser-internal pages such as `chrome://` remain unsupported and fail-visible.

## 13. Browser integration

Canonical Browser adapter:

```text
apps/browser-extension/src/runtime/source-runtime.ts
```

Before the NODE-05 shell injects the content bridge, the service worker:

1. resolves the current active tab;
2. performs file-scheme capability checks when needed;
3. resolves the source through the shared registry;
4. rejects unavailable/unsupported sources;
5. stores the resulting source descriptor in the local capture job;
6. only then injects the content bridge.

Protocol adds:

```text
W2F_GET_SOURCE_CAPABILITY
```

for source capability inspection.

## 14. Job-state integration

`CaptureJobState` now stores optional source evidence:

```text
source?: SourceDescriptor
```

Persisted source descriptors are runtime-validated before being accepted from `chrome.storage.local`.

This makes later capture diagnostics source-aware without relying on transient service-worker globals.

## 15. Browser runtime packaging

Chrome native ES modules cannot resolve workspace package specifiers such as:

```text
@w2f/source-providers
```

Therefore the Browser packaging pipeline:

1. builds `@w2f/source-providers` through the Turborepo dependency graph;
2. copies its compiled runtime modules into:

```text
apps/browser-extension/dist/runtime/source-providers/
```

3. rewrites Browser runtime imports to the packaged relative entrypoint:

```text
./source-providers/index.js
```

4. validates that no unresolved `@w2f/*` runtime imports remain.

This preserves one shared provider implementation while producing a Chrome-loadable extension.

## 16. Permission boundary

NODE-06 intentionally preserves the NODE-05 install-time manifest permissions:

```text
activeTab
scripting
storage
```

It does not add:

```text
<all_urls>
broad host_permissions
debugger
always-on content_scripts
```

File URL access is a Chrome user-controlled extension setting checked at runtime.

Local-folder access is an explicit extension-page user selection.

CDP/debugger access remains NODE-09.

## 17. Security rules

NODE-06 enforces:

- no silent capability escalation;
- no automatic broad host permission request;
- no local-root traversal;
- no credential-bearing serialized HTTP URLs;
- no `javascript:` execution-reference interpretation;
- no silent local-missing-to-network fallback;
- no unresolved workspace package imports in the built extension;
- no remote runtime code.

## 18. Non-goals

NODE-06 does not implement:

- region selection/redaction — NODE-07;
- DOM/Shadow DOM/iframe capture — NODE-08;
- CDP — NODE-09;
- CSS authored semantics — NODE-11;
- asset byte collection/dedup — NODE-13;
- `.wtf` package creation — NODE-21.

## 19. Definition of Done

NODE-06 is complete when:

- all three required providers exist in the shared package;
- HTTP/file/local-folder capabilities are explicit;
- file URL access is checked through Chrome;
- local-folder access requires direct user selection;
- relative references are deterministic;
- selected-root traversal is blocked;
- Browser jobs persist source evidence;
- the final Chrome package contains resolvable provider runtime modules;
- source-provider and Browser integration tests pass;
- temporary bootstrap workflow is removed;
- standard read-only frozen-lockfile CI passes on the completed branch.
