# W2F Standard DOM Capture V2

**Status:** IMPLEMENTED — pending final NODE-08 Exit Gate  
**Baseline:** V2 Baseline + V2.1 Addendum + NODE-00 Contracts  
**Adapter:** `standard`  
**RawSnapshot:** `1.0.0`

## 1. Purpose

NODE-08 implements the browser-API Standard capture path. It captures the **Current Rendered Application State** into an adapter-neutral `RawSnapshot` without using Chrome DevTools Protocol.

`RawSnapshot` is shared by the Standard path and NODE-09 CDP path. Downstream normalization and rendering must not need to know which adapter produced the evidence except for diagnostics/capability decisions.

## 2. Capture output

A Standard capture records:

- document and supported DOM nodes;
- Text nodes;
- open Shadow DOM and ShadowRoot boundaries;
- Slot nodes and composed-parent inference;
- same-origin iframe content;
- inaccessible/cross-origin iframe boundaries and diagnostics;
- unrounded browser geometry;
- client rect fragments;
- visibility evidence;
- source metadata and sanitized attributes;
- source/composed/slot/shadow relationships;
- frame context;
- scroll-container evidence;
- capture target and Redact/Exclude geometry;
- explicit scale evidence;
- capture diagnostics.

NODE-08 does not implement CDP DOMSnapshot, full authored CSS cascade extraction, pseudo-element text reconstruction, asset localization, pixel reference tiles, responsive multi-viewport capture, or Figma rendering.

## 3. Adapter-neutral RawSnapshot

Shared contract lives in:

```text
packages/capture-core
```

Version:

```text
1.0.0
```

The adapter field is:

```ts
type RawCaptureAdapter = "standard" | "cdp"
```

Both NODE-08 and NODE-09 therefore converge on one normalization boundary.

The runtime validator is intentionally self-contained so the final Chrome extension does not need to ship the entire W2F schema runtime merely to validate capture persistence.

## 4. Geometry

Coordinates use browser CSS-pixel document space and JavaScript/JSON IEEE-754 number semantics.

Capture code does not call `Math.round()` for geometry.

The Standard adapter records `getBoundingClientRect()` / `getClientRects()` evidence translated into document coordinates. Quantization is a later renderer responsibility.

## 5. Source and composed tree

The Raw node contract carries `NodeRelationships`:

```text
sourceParentId
composedParentId
renderParentId
assignedSlotId
shadowHostId
```

The Standard path preserves source DOM parentage and uses:

```js
slot.assignedNodes({ flatten: true })
```

to infer supported composed relationships.

Open Shadow DOM is traversed. Closed Shadow DOM is not bypassed and remains a documented Standard-path limitation.

## 6. FrameContext

Shared schema:

```text
packages/w2f-schema/src/frame-context.ts
```

Each Raw node carries:

```ts
interface FrameContext {
  frameId: string
  parentFrameId?: string
  origin?: string
  url?: string
}
```

The W2F IR SourceNode also reserves optional `frameContext` so frame identity is not discarded during RawSnapshot → IR normalization.

Same-origin iframe documents are recursively traversed when browser APIs allow access. Inaccessible frames remain explicit frame records/diagnostics; W2F never bypasses origin or sandbox security.

## 7. ScaleContext

V2.1 requires browser scale dimensions not to be collapsed into one ambiguous number.

Schema:

```text
packages/w2f-schema/src/scale-context.ts
```

Model:

```ts
interface ScaleContext {
  devicePixelRatio: number
  browserPageZoom?: number
  cssZoom?: number
  visualViewportScale?: number
}
```

Standard page APIs can directly observe DPR and visual viewport scale but cannot reliably separate browser page zoom from OS display scaling in all environments. NODE-08 therefore records availability/evidence explicitly instead of inventing `browserPageZoom = 1`.

Element-scoped CSS zoom evidence belongs with CSS/layout evidence and is not fabricated at the document environment level.

NODE-09 may enrich the same contract when CDP/platform evidence is available.

## 8. Scroll containers

The Standard path records candidate scroll containers including:

- scrollWidth / scrollHeight;
- clientWidth / clientHeight;
- current offsets;
- overflow modes;
- document-root flag;
- primary-application-root heuristic;
- parent scroll-container identity.

The primary application root is evidence/heuristic, not a claim that every `overflow:auto` node is the page root.

## 9. Region capture

NODE-07 produces the region contract. NODE-08 consumes it.

Region mode follows:

```text
select region
→ produce bounds + Redact/Exclude masks
→ Standard DOM capture
→ retain intersecting nodes
→ retain structural ancestors needed for relationships
```

Redact/Exclude masks are clipped by NODE-07. NODE-08 validates region containment again in RawSnapshot validation.

A fully excluded subtree may be omitted. Nodes intersecting a Redact mask suppress captured text/attributes rather than leaking protected material into the semantic snapshot.

## 10. Privacy baseline

Standard capture does not read:

```text
document.cookie
localStorage
sessionStorage
```

It does not capture runtime `input.value` / `textarea.value`.

Protected attributes/evidence are filtered, including password/auth/token/cookie/session/credential/signature/API-key/access-key style values, inline event-handler attributes and `srcdoc`.

URL sanitization removes URL credentials and sensitive query parameters before persistence.

Manual Redact is additive; the automatic privacy baseline applies regardless of user masks.

## 11. Browser orchestration

Browser shell protocol version:

```text
1.2.0
```

Full Page now executes Standard DOM Capture rather than the old shell-only page probe.

Region mode performs NODE-07 selection first and then invokes the same Standard adapter with the selected target.

The page capture function is passed through:

```ts
chrome.scripting.executeScript({ func, args })
```

so the injected capture body is self-contained and does not require unresolved workspace imports in page context.

## 12. Persistence

Large RawSnapshots are not stored in `chrome.storage.local`.

They are persisted in IndexedDB under a deterministic job-scoped key:

```text
raw-snapshot:<jobId>
```

`chrome.storage.local` stores only the small job state and `CaptureSnapshotReceipt` summary/reference.

RawSnapshot is structurally validated before write and after read.

Cancellation removes partially persisted snapshot data when applicable.

## 13. Chrome package boundary

Final extension packaging embeds only the runtime packages needed by Browser execution:

```text
runtime/source-providers/
runtime/capture-core/
runtime/standard-capture-adapter/
```

The packaging step rewrites Browser runtime workspace imports to extension-relative module paths. The package validator recursively rejects unresolved `@w2f/*` runtime imports and remote executable code references.

The classic NODE-07 injected content script remains non-ESM.

## 14. Permission boundary

Manifest permissions remain exactly:

```text
activeTab
scripting
storage
```

NODE-08 adds no:

- `debugger` permission;
- broad `host_permissions`;
- `<all_urls>`;
- static content script.

CDP/debugger belongs to NODE-09 and must remain capability-isolated.

## 15. Cleanup invariant

Standard DOM capture itself is read-only. It does not permanently mutate the captured page.

The only interactive mutation in region mode is the NODE-07 selector overlay, which already owns deterministic cleanup on confirm/cancel/failure.

The capture job also treats cancellation as terminal: a late capture result cannot overwrite a cancelled job as completed.

## 16. Diagnostics and limitations

Expected Standard-path diagnostic classes include inaccessible frame boundaries and capture-budget limitations.

Known limitations remain explicit:

- closed Shadow DOM cannot be introspected by Standard DOM APIs;
- cross-origin/sandboxed frame content may be inaccessible;
- page JavaScript runtime is not transferred;
- virtualized records not represented in supported rendered DOM are not invented;
- complete authored CSS/cascade provenance is handled in later nodes;
- browser page zoom may be unavailable as a separately observable Standard-page value.

No limitation permits silent data loss or browser-security bypass.

## 17. Exit criteria

NODE-08 is complete only when:

- RawSnapshot + FrameContext + ScaleContext contracts are committed;
- Standard DOM adapter is committed;
- Browser full-page/region jobs execute Standard capture;
- IndexedDB persistence is validated;
- privacy/security boundaries are tested;
- Browser final package contains resolvable capture runtime modules;
- all temporary write-enabled workflows are removed;
- standard read-only `pnpm install --frozen-lockfile` CI passes;
- NODE-08 PR is merged.
