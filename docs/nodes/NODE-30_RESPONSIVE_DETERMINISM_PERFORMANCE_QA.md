# NODE-30 — Responsive / Determinism / Performance QA

## Objective

NODE-30 closes the remaining measurable QA gaps before the real-world Release Candidate node. It reuses NODE-29 visual/structure/editability evidence and adds three release gates: responsive fidelity across deterministic viewport fixtures, ten-run determinism, and performance/scale behavior.

The authoritative source is `docs/ACCEPTANCE_CONTRACT_V2.md`. Thresholds are not lowered for implementation convenience.

## 1. Responsive fidelity

Supported responsive deterministic fixtures require a **>= 90% composite responsive score**.

The score covers:

- FILL / HUG / FIXED sizing correctness;
- gap and padding;
- min/max sizing;
- flex/grid relationships;
- constraints;
- breakpoint, visibility and layout-change detection.

Required deterministic cases include horizontal flex, vertical flex, nested Auto Layout, flex-grow/FILL, HUG, fixed sizing, min/max constraints, simple Grid, grid column-count changes, visibility switches, flex-direction/order changes, and container-query metadata.

Structural breakpoint changes that Figma cannot execute natively still have to be correctly **detected and reported**. They may not disappear from the score merely because the target editor cannot execute them.

## 2. Determinism gate

A deterministic fixture is evaluated over **10 runs in the same environment**.

The following must remain identical after explicit normalization of intentionally variable capture metadata:

- asset hash set;
- normalized Source Graph hash;
- normalized Render Tree hash;
- stable identity set;
- layout decisions and their reasons.

The Source Graph normalizer excludes only declared revision metadata that is expected to change per capture (`capturedAt`, `captureId`, `revisionId`, `parentRevisionId`). Stable semantic/source fields are not broadly ignored.

Fewer than ten runs are `UNAVAILABLE`, not `PASS`. Any semantic mismatch across the ten-run set is a failure.

## 3. Performance and scale

Hard millisecond budgets are **not invented up front**. NODE-30 records durations, median and p95, then calibrates hard budgets from benchmark evidence later in this node.

The functional scale contract is already frozen:

- `<2k` render nodes — normal path;
- `2k–5k` — normal path;
- `5k–10k` — chunking- or progress-capable path;
- `10k–20k` — must complete without fatal crash on the benchmark environment; chunking/warning allowed;
- `20k–50k` — user warning plus section/simplified-import recommendation;
- `>50k` — explicit confirmation or section/simplified strategy required.

A deterministic 10k benchmark that routinely crashes capture/import is release-blocking.

## 4. Canonical fingerprints

NODE-30 uses canonical JSON with lexicographically sorted object keys and preserved array order. Only explicitly named volatile keys are excluded. Diagnostic hashes are deterministic fingerprints; asset integrity continues to use the existing `.wtf` SHA-256 evidence.

This canonicalization is for repeat-run equality, not for security or package integrity.

## 5. Status model

- `PASS` — the frozen gate is satisfied;
- `WARNING` — the functional gate passes but a non-fatal scale or capability concern was observed;
- `FAIL` — a frozen requirement is violated;
- `UNAVAILABLE` — required benchmark evidence is missing, including fewer than ten determinism runs.

`UNAVAILABLE` is never silently converted to `PASS`.

## Exit gate

NODE-30 is complete only when:

1. responsive scoring covers the frozen deterministic cases and the >=90% threshold;
2. ten-run determinism compares assets, normalized Source Graph, Render Tree, stable identities, and layout decisions;
3. performance scale gates are enforced without premature hard-ms targets;
4. benchmark measurements provide evidence for any later hard-ms calibration;
5. permanent NODE-30 validator is in CI;
6. exact-head lint, typecheck, tests, build/plugin validation and format checks all pass;
7. NODE-27/28/29 permanent validators remain green.

## Boundary with NODE-31

NODE-31 owns real-world compatibility, compatibility matrix generation, known-limitations closure and Release Candidate packaging. NODE-30 provides the repeatable responsive/determinism/performance evidence NODE-31 consumes.
