# Stable Identity & Source Mapping V2

**Status:** NODE-04 implementation contract  
**Baseline:** V2 Baseline + V2.1 Addendum + NODE-03 W2F IR V2  
**Algorithm version:** `1.0.0`

## 1. Purpose

W2F must distinguish per-capture node identity from cross-capture stable identity.

```text
captureNodeId
  = unique inside one capture

stableNodeId
  = deterministic best-effort identity across repeated captures
```

Random runtime IDs are not accepted as the only identity signal.

This contract supports:

- repeated capture comparison;
- responsive cross-snapshot mapping;
- future incremental merge/update;
- Source Graph traceability;
- deterministic diagnostics and QA.

## 2. Identity layers

NODE-04 implements four related identities.

### 2.1 Document identity

`documentId` identifies the logical source document.

Inputs are normalized source locators such as HTTP(S), file and local-folder sources.

HTTP normalization removes:

- credentials;
- URL fragments;
- `utm_*` parameters;
- common ad/click tracking parameters.

Remaining query parameters are deterministically sorted.

`documentId` is derived from the normalized locator and therefore remains stable across tracking-only URL drift.

### 2.2 Source fingerprint

`sourceFingerprint` combines the normalized source locator with optional root structural evidence.

It is allowed to change when the source structure materially changes while `documentId` stays stable.

### 2.3 Capture identity

`captureId` is intentionally different for different capture operations.

Inputs include:

- `documentId`;
- normalized capture timestamp;
- capture nonce.

Two captures of the same document therefore share `documentId` but not `captureId`.

### 2.4 Revision identity

`revisionId` links document, capture, source fingerprint and optional parent revision.

The result can be written directly into the NODE-02/NODE-03 revision fields.

## 3. Stable node evidence

Candidate evidence follows the V2 Stable Node Identity baseline:

```text
source/document scope
semantic DOM ancestry
tag
role
stable id attribute
stable data attributes
meaningful class signature
structural position
normalized text/content
asset fingerprints
```

Each assignment records:

```text
stableNodeId
confidence
evidence[]
signatureHash
normalized signals
```

## 4. Volatile signal rejection

Stable identity must not depend on obviously volatile runtime identifiers.

NODE-04 filters examples including:

- React hydration IDs;
- Radix/Headless UI generated IDs;
- UUID-like IDs;
- timestamp/long-digit IDs;
- hash-like generated values;
- CSS Module hash suffixes;
- generic utility classes;
- Tailwind-like utility tokens;
- unstable framework `data-*` attributes.

The algorithm prefers explicit stable application semantics over implementation noise.

## 5. Stable application signals

Recognized stable `data-*` keys include semantic/test/component identifiers such as:

```text
data-testid
data-test-id
data-test
data-qa
data-cy
data-component
data-component-id
data-slot
data-part
data-role
data-name
```

Values are accepted only when they pass volatility checks.

Meaningful classes are normalized, deduplicated, sorted and bounded before hashing.

## 6. Text normalization

Text may contribute identity evidence but dynamic values must not cause unnecessary identity churn.

Normalization includes:

- whitespace collapse;
- case normalization;
- URL replacement;
- email replacement;
- numeric/date-like token replacement;
- bounded length.

Example:

```text
Cart (12) · Updated 2026/08/22
→ cart (#) · updated #
```

Text is supporting evidence, not an unconditional primary key.

## 7. Structural fallback

When no stable ID, stable data attribute, normalized text or asset fingerprint exists, structural position becomes fallback evidence.

Structural fallback:

- is deterministic;
- is lower confidence;
- is capped below high-confidence semantic identities;
- may use sibling index, same-kind index and document order.

This fallback is necessary for anonymous repeated structures but must not be presented as certain identity.

## 8. Collision handling

Two nodes may initially produce the same stable signature.

NODE-04 never silently resolves collision by input array order.

Within one capture, collisions are deterministically disambiguated with structural position. The identity confidence is reduced and evidence records:

```text
collision-disambiguated-by-structural-position
```

If structural positions themselves are indistinguishable, assignment fails rather than producing nondeterministic output.

## 9. Cross-capture mapping

Mapping groups nodes by `stableNodeId` and produces one of:

```text
matched
added
removed
ambiguous
```

Rules:

```text
1 previous + 1 current  → matched
0 previous + 1 current  → added
1 previous + 0 current  → removed
>1 on either side        → ambiguous
```

Ambiguous groups are not paired by order.

Mapping output records:

- stable node ID;
- previous capture node IDs;
- current capture node IDs;
- mapping status;
- conservative confidence.

## 10. Source Graph integration

`applyStableIdentityAssignments` immutably applies assignments to NODE-03 `WtfSourceNode.stableIdentity`.

It also reports:

```text
unmappedCaptureNodeIds
unusedAssignments
```

This makes incomplete capture/normalization pipelines observable instead of silently dropping identity data.

`toStableMappedNodes` converts assigned Source Nodes into the minimal cross-capture mapping input.

## 11. Browser integration

The Browser Extension depends on:

```text
@w2f/stable-identity: workspace:*
```

and exposes the same algorithm version used by the shared package.

Capture implementation in later nodes must call this shared engine rather than introducing Browser-specific identity logic.

## 12. Determinism rules

For equivalent normalized input evidence:

```text
same logical document
+ same logical node evidence
→ same stableNodeId
```

Changing only `captureNodeId`, capture nonce, tracking URL parameters or normalized-away dynamic numbers must not change the stable node identity.

All signature payloads use canonical JSON and SHA-256.

## 13. Non-goals

NODE-04 does not implement:

- DOM acquisition;
- multi-viewport capture;
- visual similarity matching;
- ML-based node matching;
- automatic Figma incremental update;
- structural fingerprint generation algorithms beyond consuming supplied evidence.

Those belong to later capture, responsive and merge/render nodes.

## 14. Quality requirements

NODE-04 is complete only when:

- repeated-capture fixtures preserve stable IDs;
- volatile runtime IDs do not dominate identity;
- collision behavior is deterministic;
- ambiguous mappings remain explicit;
- Source Graph assignment is validated;
- Browser consumes the shared package;
- workspace lockfile is authoritative;
- standard frozen-lockfile CI passes.
