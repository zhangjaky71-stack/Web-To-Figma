# ADR-0006 — Source Provider Boundary and Offline Access

## Status

Accepted for NODE-06.

## Context

The Browser capture pipeline must support three source classes frozen by the V2 Baseline:

```text
HTTP(S) page
file:// browser tab
user-selected local folder
```

Treating these sources as equivalent creates incorrect permission assumptions, fragile relative-URL handling and privacy risk around local paths.

Manifest V3 service workers are also ephemeral, so source capability cannot depend on transient global state.

## Decision

Create one shared package:

```text
@w2f/source-providers
```

with three explicit providers:

```text
HttpPageProvider
FileTabProvider
LocalFolderProvider
```

Each provider owns capability checks, source normalization and reference resolution for its source class.

Browser runtime consumes this package rather than duplicating source classification.

## Capability before capture

Source support and source availability are separate concepts.

The provider returns structured capability evidence before content injection or later capture work begins.

Blocked permissions remain explicit and include a required user action where applicable.

## File-tab permission decision

Do not add broad manifest host permissions to make `file:` pages appear automatically available.

Instead Browser runtime calls:

```text
chrome.extension.isAllowedFileSchemeAccess()
```

and reports `file-scheme-access-disabled` when the Chrome user setting is off.

## Local-folder access decision

A local folder must originate from an explicit extension-page user selection.

The source model stores:

- an opaque root ID;
- a display root name;
- root-relative entries;
- an entry document.

It does not require an absolute operating-system root path.

All local relative resolution is constrained to the selected root.

## Permission decision

Keep the NODE-05 install-time permission set unchanged:

```text
activeTab
scripting
storage
```

NODE-06 does not add `<all_urls>`, broad `host_permissions`, `debugger`, or always-on content scripts.

## Browser packaging decision

The Browser extension runtime must remain directly loadable by Chrome.

Because native extension ES modules do not resolve pnpm workspace bare specifiers, package the compiled source-provider modules with the extension and rewrite Browser runtime imports to a relative packaged path.

The package validator rejects unresolved `@w2f/*` runtime imports.

This avoids duplicating provider logic while keeping the built extension executable without a Node module resolver.

## Missing-resource decision

A missing root-relative local resource remains a local reference with `exists: false`.

Do not silently reinterpret it as a network URL.

This preserves authored offline semantics and gives later asset/diagnostic nodes accurate evidence.

## Consequences

Positive:

- one source-provider contract for later capture/asset nodes;
- permission failures are observable rather than implicit;
- local root traversal is blocked early;
- Browser default permissions stay minimal;
- offline relative references remain deterministic;
- final extension runtime is Chrome-resolvable.

Trade-offs:

- local-folder selection is session-scoped at NODE-06;
- `file:` tab resolution may use machine-local file URLs internally;
- later portable packaging must sanitize machine-specific local locator data;
- runtime packaging includes compiled provider modules as extension assets.

## Rejected alternatives

### Add broad host permissions now

Rejected because it weakens NODE-05 least privilege and is unnecessary for the frozen NODE-06 requirements.

### Treat file URLs as available whenever the scheme is `file:`

Rejected because Chrome has a separate user-controlled file URL access setting.

### Serialize absolute local-folder paths

Rejected because it is unnecessary for root-relative resolution and creates avoidable privacy coupling to one machine.

### Duplicate provider logic in the Browser service worker

Rejected because later capture/asset nodes need the same normalization semantics and duplicated logic would drift.

### Leave workspace package imports in `dist`

Rejected because Chrome cannot resolve pnpm workspace bare module specifiers at runtime.
