# NODE-08 — Standard DOM Capture

## Status

**DONE / PASS / MERGED**

PR #12 was squash merged into `main` as:

```text
7bd71bf95247148414b0eb49e580a297a3667a38
```

## Goal

Implement the frozen V2 Standard DOM capture path and normalize its output to an adapter-neutral RawSnapshot boundary that NODE-09 CDP can also target.

## Implemented

### Shared capture contracts

Added:

```text
packages/capture-core
packages/w2f-schema/src/frame-context.ts
packages/w2f-schema/src/scale-context.ts
```

RawSnapshot version:

```text
1.0.0
```

The contract contains:

- Standard/CDP adapter identity;
- document/region capture target;
- DOM source nodes;
- source/composed/slot/shadow relationships;
- FrameContext;
- double-precision geometry/client rects;
- visibility evidence;
- scroll containers;
- diagnostics;
- explicit ScaleContext evidence.

RawSnapshot runtime validation is self-contained for Browser packaging.

### Standard capture adapter

Added:

```text
packages/standard-capture-adapter
```

Version:

```text
1.0.0
```

Implemented:

- Element/Text/Document traversal;
- open Shadow DOM traversal;
- ShadowRoot and slot source boundaries;
- `slot.assignedNodes({ flatten: true })` composed mapping;
- same-origin iframe recursion;
- inaccessible iframe frame records and diagnostics;
- browser border/client geometry without capture rounding;
- visibility evidence;
- source selector/tag/namespace/role/attribute evidence;
- scroll-container evidence and primary app-root heuristic;
- region intersection/ancestor closure;
- Redact/Exclude handling;
- node-budget diagnostic.

### Frame-aware IR preservation

`WtfSourceNode` reserves optional `frameContext`, and IR validation rejects malformed frame context evidence.

### Scale model

Schema distinguishes:

```text
devicePixelRatio
browserPageZoom
cssZoom
visualViewportScale
```

Standard capture records directly observable DPR and visual viewport scale. Browser page zoom / CSS zoom are explicitly marked unavailable when Standard page APIs cannot reliably separate them; no fake values are emitted.

### Privacy boundary

Standard capture:

- does not read `document.cookie`;
- does not read localStorage/sessionStorage;
- does not capture runtime input/textarea values;
- removes password/auth/token/cookie/session/credential/signature/API-key/access-key style attributes;
- removes inline event-handler attributes;
- removes `srcdoc`;
- sanitizes URL credentials and sensitive query parameters.

Manual NODE-07 Redact masks are additive to this automatic safety baseline.

### Browser orchestration

Browser shell protocol advanced to:

```text
1.2.0
```

`captureImplemented` and `standardCaptureImplemented` are true.

Full Page runs the Standard DOM adapter. Region mode runs NODE-07 selection first, then sends bounds/masks into the same Standard adapter. Cancellation is terminal and cannot be overwritten by a late capture completion.

### Persistence

Full RawSnapshot payloads use IndexedDB:

```text
DB: w2f-capture-snapshots
Store: rawSnapshots
Key: raw-snapshot:<jobId>
```

`chrome.storage.local` keeps only compact job state plus `CaptureSnapshotReceipt`.

### Browser packaging

Final extension packages:

```text
runtime/source-providers/
runtime/capture-core/
runtime/standard-capture-adapter/
```

Top-level workspace imports are rewritten to extension-relative paths and package validation rejects unresolved `@w2f/*` runtime imports.

Permissions remain:

```text
activeTab
scripting
storage
```

No `debugger`, broad host permission or static content script was added.

## Final validation

Implementation + normative docs final branch CI:

```text
32583854755
```

validated head:

```text
ec13b1b8d2bffd4581c3a417c85eef5f6c81c94e
```

Every formal gate passed:

- dependency-free foundation validation including NODE-08 contract invariants;
- Node.js 24 / pnpm 11.22.0;
- `pnpm install --frozen-lockfile`;
- ESLint;
- TypeScript 6.0.3 typecheck;
- full repository Vitest suite;
- deterministic Browser extension build;
- Browser package/runtime validator;
- pinned Prettier 3.9.6 format check.

All temporary write-enabled workflows were removed before the final CI.

## Definition of Done

- [x] adapter-neutral RawSnapshot contract
- [x] Standard DOM adapter
- [x] Element/Text/Document capture
- [x] unrounded double-precision geometry
- [x] visibility evidence
- [x] open Shadow DOM capture
- [x] slot/composed-parent inference
- [x] same-origin iframe capture
- [x] inaccessible-frame diagnostics without security bypass
- [x] shared FrameContext schema
- [x] FrameContext preserved by W2F IR SourceNode
- [x] explicit ScaleContext schema/evidence
- [x] scroll-container evidence
- [x] region intersection + structural ancestor closure
- [x] Redact/Exclude handling
- [x] automatic privacy filtering
- [x] Browser full-page Standard capture
- [x] Browser post-region Standard capture
- [x] IndexedDB RawSnapshot persistence
- [x] compact job-state receipt
- [x] cancellation race handled
- [x] Chrome-resolvable packaged capture runtime
- [x] least-privilege Standard permission boundary
- [x] authoritative lockfile updated
- [x] temporary write-enabled workflows removed
- [x] final standard read-only frozen-lockfile CI passes
- [x] final validation evidence written back to status
- [x] PR #12 merged

## Explicit non-goals

NODE-08 does not implement CDP capture, complete DOMSnapshot/layout-tree CDP evidence, pseudo-element reconstruction, authored CSS cascade extraction, asset localization, pixel ground truth, responsive multi-viewport capture or Figma rendering. Those remain later NODEs.

## Next

```text
NODE-09 — CDP High Fidelity Adapter
```
