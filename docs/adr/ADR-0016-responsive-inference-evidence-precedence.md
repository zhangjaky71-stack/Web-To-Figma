# ADR-0016 — Responsive Inference Evidence Precedence

- Status: Accepted for NODE-16 implementation; formal Exit Gate pending
- Date: 2026-08-23
- Scope: Responsive Inference Engine

## Context

NODE-15 now captures the same document under multiple viewport conditions with Stable Identity evidence and independent RawSnapshot/CSS/Environment/Asset/Pixel Ground Truth child artifacts.

NODE-16 must infer responsive rules without confusing sampled geometry with authored CSS semantics and without stealing the responsibilities of the later Base Layout Analyzer.

The central risks are:

1. inventing exact breakpoints from sparse samples;
2. overfitting FILL/HUG/FIXED from geometry alone;
3. treating container-query dimensions as viewport dimensions;
4. hiding authored/computed/geometry conflicts behind an unjustified high-confidence answer.

## Decision

### 1. Stable Node ID is the cross-snapshot join key

Capture-local ids are only used to recover evidence inside one child snapshot. All cross-snapshot rules target Stable Node IDs.

### 2. Authored evidence precedes geometry fallback

Explicit authored CSS and EnvironmentCapture query evidence have higher semantic authority than geometric trends.

Geometry is used only when authored evidence is absent or as corroborating/conflicting evidence.

### 3. Sampled transitions are intervals, not exact breakpoints

A property change observed between two captured widths yields a bounded candidate interval only.

An exact `boundaryWidth` is emitted only when preserved authored evidence contains an explicit viewport width boundary.

### 4. Container queries remain container queries

Container-query conditions are retained as `WtfContainerQueryInfo`. They are not converted into viewport breakpoints.

### 5. Unknown is a valid product result

When evidence does not support a sizing decision, NODE-16 emits `unknown` with low/zero confidence instead of fabricating FILL/HUG/FIXED.

### 6. Conflicts are visible

Authored-vs-geometry conflicts retain authored semantics with reduced confidence and diagnostics.

### 7. Frozen IR V2 is reused

NODE-16 projects into the existing `WtfResponsivePayload`, `WtfResponsiveRule`, `WtfResponsiveRange`, media/container structures and sizing vocabulary. No Schema/IR major-version change is introduced.

## Consequences

### Positive

- deterministic, explainable rules;
- sparse viewport sampling does not masquerade as precise CSS knowledge;
- downstream Figma rendering receives confidence/evidence instead of opaque guesses;
- NODE-17 remains the single owner of base layout analysis;
- responsive capture and responsive inference remain independently inspectable sidecars.

### Tradeoffs

- some nodes remain `unknown` until richer evidence or later layout analysis;
- exact breakpoints may be unavailable when stylesheets are inaccessible;
- initial inference deliberately favors precision over rule coverage.

## Rejected alternatives

### Midpoint breakpoint guessing

Rejected because a change observed between 390 and 768 does not prove a breakpoint near the midpoint.

### Geometry-only responsive classification

Rejected because identical geometry can arise from different authored semantics and layout contexts.

### Treat every container threshold as a viewport breakpoint

Rejected because the measured axis belongs to a container, not necessarily the viewport.

### Run inference against the live page

Rejected because NODE-16 should be reproducible from captured evidence and should not introduce new page mutation/timing variance.

## Downstream boundary

- NODE-17: Base Layout Analyzer
- NODE-21: WTF serialization
- NODE-27: Figma Responsive Layout Renderer
