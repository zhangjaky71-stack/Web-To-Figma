# ADR-0012 — Media / Container / Environment Sidecar Boundary

## Status

Accepted for NODE-12 implementation; formal Exit Gate pending.

## Context

The frozen V2 Baseline requires environment snapshots, media-query evidence and container-query evidence before multi-viewport capture and responsive inference. The existing `RawSnapshot 1.0.0` contract already records DOM/layout/scale evidence and NODE-11 stores authored cascade semantics in a separate sidecar.

Several constraints make environment evidence unsuitable for silently folding into RawSnapshot:

1. Standard browser APIs cannot reliably separate browser page zoom from OS/device scaling.
2. `@media` activity can be observed directly through browser media-query evaluation.
3. CSSOM does not provide a general reliable `matches` primitive for arbitrary `@container` rules.
4. Later nodes need authored responsive conditions and affected-node evidence without forcing a RawSnapshot version bump.
5. The browser remains the authority for observed rendering; W2F must not recreate or guess unavailable browser state.

## Decision

Introduce a separate versioned:

```text
EnvironmentCapture 1.0.0
```

sidecar associated with one RawSnapshot.

The sidecar stores runtime environment, media-feature observations, media-rule traces, container definitions, container-query traces and diagnostics.

`RawSnapshot 1.0.0` remains unchanged.

### Page zoom

Use existing RawSnapshot scale evidence.

If browser page zoom is unavailable, preserve:

```text
pageZoomAvailability = unavailable
```

and do not fabricate a value. Conversion to the frozen portable environment shape fails closed until its required page-zoom field can be supported by observed evidence.

### Media queries

Use browser `matchMedia` for current activity and preserve both active and inactive authored rules. Record affected properties and captured source-node IDs.

### Container queries

Capture container definitions and authored `@container` conditions. Selector matching alone is not proof that the container condition is active.

If activity cannot be directly observed, normalize to:

```text
activeAvailability = unavailable
```

with no fabricated boolean.

### Browser integration

Persist the environment sidecar independently in IndexedDB and include its key/count summary in capture job receipts. RawSnapshot/screenshot, CSS Cascade and Environment artifacts share cancellation/failure cleanup semantics.

### Portable mapping

Map sidecar evidence only into the already frozen W2F IR types. Stable-node mapping is supplied downstream. NODE-12 does not infer responsive behavior.

## Alternatives considered

### Add NODE-12 fields directly to RawSnapshot

Rejected. It would version-bump a validated acquisition boundary and mix raw structural evidence with responsive/environment sidecar semantics.

### Assume Standard page zoom is 1

Rejected. This would turn missing evidence into false certainty and can corrupt geometry under browser zoom or OS scale interactions.

### Treat selector match under `@container` as proof the container query is active

Rejected. Selector match and container-condition match are different predicates. Doing so would invent evidence.

### Reimplement media/container evaluation in W2F

Rejected. The browser is the authoritative evaluator for current rendering, and recreating the complete standards/runtime environment would be brittle and out of NODE-12 scope.

## Consequences

### Positive

- preserves RawSnapshot compatibility;
- keeps unavailable scale/container state explicit;
- allows later responsive nodes to consume richer evidence;
- keeps Standard and High Fidelity profiles on one sidecar contract;
- preserves deterministic, testable normalization;
- avoids fabricated responsive conclusions.

### Costs

- one additional browser sidecar/store lifecycle;
- portable environment mapping can be absent for Standard captures until required page zoom is available;
- container-query activity may remain unavailable in a single snapshot;
- later nodes must reconcile RawSnapshot, CSS Cascade and Environment sidecars.

## Follow-up

NODE-15 may capture multiple environment/viewport snapshots. NODE-16 may compare their stable-node evidence and responsive conditions to infer behavior. Neither responsibility is moved into NODE-12.
