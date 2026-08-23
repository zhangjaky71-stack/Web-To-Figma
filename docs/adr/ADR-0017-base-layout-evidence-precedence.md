# ADR-0017 — Base Layout Evidence Precedence

## Status

Accepted for NODE-17 implementation. Formal Exit Gate pending.

## Context

Web layout can be represented by authored CSS intent, active computed CSS, observed geometry, and multi-viewport behavior. These sources can disagree.

Flattening everything to observed rectangles produces visually plausible but poorly editable Figma output. Conversely, trusting authored values without checking active computed behavior can preserve inactive or overridden intent.

NODE-17 therefore needs a deterministic evidence hierarchy.

## Decision

### 1. Active mode uses computed display/position

Computed `display` and `position` determine the current base layout mode because they describe the active layout context.

Authored values are retained in decision evidence and source references.

### 2. Authored sizing semantics outrank geometry

When authored width/height semantics are available, they are the primary editability signal.

Examples:

- `320px` -> fixed
- `100%` -> fill
- intrinsic sizing keywords -> hug
- partial percentages remain responsive values but are not treated as full fill

### 3. Responsive inference is corroborating evidence

NODE-16 responsive sizing may strengthen a base decision when compatible.

If it conflicts with authored base sizing, NODE-17 keeps the authored base mode, lowers confidence, records both evidence sources, and emits `LAYOUT_SIZING_CONFLICT`.

### 4. Geometry is fallback evidence

Geometry may infer moderate-confidence Fill when a node closely tracks/fills its parent. Geometry alone must not invent authored constraints, flex/grid settings, or exact percentages.

### 5. Constraints remain constraints

Absolute/fixed `left/right/top/bottom` are preserved as CSS length semantics and are not replaced by observed x/y.

### 6. Grid tracks remain authored structure

Authored grid track syntax is preserved even when computed pixel tracks are available.

### 7. Tables are deferred

NODE-17 classifies table-family display but does not reconstruct rows/cells. It emits `LAYOUT_TABLE_DEFERRED`; NODE-18 owns detailed table semantics.

## Consequences

### Positive

- better downstream editability;
- deterministic confidence-bearing decisions;
- avoids converting sampled geometry into invented CSS;
- keeps NODE-17/18/19/20 ownership boundaries clear;
- same analyzer can run for Standard, High Fidelity and responsive child captures.

### Tradeoffs

- some nodes remain `unknown` rather than receiving an attractive but unsupported guess;
- base analysis may expose conflicts that later stages must resolve visibly;
- advanced layout features can require later node-specific engines.

## Rejected alternatives

### Geometry-first reconstruction

Rejected because rectangles do not encode CSS intent and would systematically degrade editability.

### Authored-only reconstruction

Rejected because overridden/inactive declarations can differ from the active page.

### Fold table reconstruction into NODE-17

Rejected because table semantics have dedicated NODE-18 ownership and require specialized structure analysis.

### Infer absolute constraints from rectangle positions

Rejected because observed positions do not uniquely identify left/right/top/bottom authored constraints.
