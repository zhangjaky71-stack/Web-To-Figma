# ADR-0007 — Region Selection and Redaction Boundary

## Status

Accepted for NODE-07.

## Context

W2F must support region capture without coupling the interactive selection UI to the future DOM extraction engine. A region may span multiple DOM branches, may partially intersect nodes, and may include areas that the user explicitly wants redacted or excluded.

The Browser selector also runs inside arbitrary third-party pages, so it must avoid page-style collisions, avoid reading sensitive page data, and clean up deterministically.

## Decision

### 1. Selection output is geometry-first

NODE-07 emits a versioned `RegionSelectionResult` in document CSS pixel coordinates. It does not serialize DOM nodes or build the NODE-08 intersection tree.

### 2. Free Rectangle and Smart Element coexist

Free Rectangle is the authoritative general-purpose region mechanism. Smart Element is an optional acceleration path based on rendered hit testing and element bounds.

### 3. Selection root is a hint plus an explicit clip

NODE-07 emits a lightweight `selectionRoot` descriptor and always retains the user rectangle as `clip`. NODE-08 will later preserve intersecting ancestors/children and apply the clip when producing capture data.

### 4. Redaction/exclusion is explicit intent

Manual masks are stored as document-space rectangles with a semantic kind:

```text
redact
exclude
```

NODE-07 does not inspect or serialize masked content. Later capture/render stages must enforce the requested intent.

### 5. Persisted geometry is double precision

The selector does not round persisted geometry. Rounded values may be used only for human-readable UI labels.

### 6. Overlay is isolated and ephemeral

The interactive overlay is injected after explicit user action, rendered in an isolated Shadow DOM, and removed after confirm/cancel/failure. It does not add static content scripts or new host permissions.

### 7. Privacy rules are independent of manual redaction

Manual redaction supplements but does not replace the V2 automatic safety contract. Password values, credentials/tokens, cookies, storage and authorization headers remain prohibited capture data even if the user does not draw a redaction.

## Consequences

Positive:

- NODE-07 can evolve interaction UX without destabilizing NODE-08 capture semantics;
- free-form cross-branch regions remain possible;
- smart selection is useful without becoming a false semantic ownership claim;
- precise root clipping is preserved for later capture;
- privacy and permission boundaries stay explicit;
- selection geometry remains deterministic and compatible with V2.1 precision policy.

Trade-offs:

- NODE-07 cannot yet preview the exact final captured node set;
- `selectionRoot` is intentionally a hint, not the final Source Graph root;
- actual redacted-node/placeholder generation is deferred to NODE-08+;
- Smart Element relies on the standard page hit-test surface and therefore does not claim CDP-level access to closed/internal structures.

## Rejected alternatives

### Serialize the selected DOM directly in NODE-07

Rejected because it duplicates NODE-08 and couples interaction state to the capture engine.

### Smart Element only

Rejected because many useful design regions span several DOM branches.

### Round all coordinates to integer CSS pixels

Rejected because it violates the V2.1 Geometry Precision Policy and can accumulate visual error.

### Add broad host permissions for selection

Rejected. `activeTab + scripting + storage` is sufficient for explicit user-action selection and preserves the NODE-05/06 least-privilege contract.
