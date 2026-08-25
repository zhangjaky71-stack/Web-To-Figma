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
- breakpoint, visibility and layout-change detection;
- container-query metadata preservation.

Required deterministic cases include horizontal flex, vertical flex, nested Auto Layout, flex-grow/FILL, HUG, fixed sizing, min/max constraints, simple Grid, grid column-count changes, visibility switches, flex-direction/order changes, and container-query metadata.

Structural breakpoint changes that Figma cannot execute natively still have to be correctly **detected and reported**. They may not disappear from the score merely because the target editor cannot execute them.

### Composite methodology

NODE-30 does not invent priority weights between responsive domains. Each active domain first receives its own matched/total score; the composite is the arithmetic mean of the active domain scores. A release-suite caller may declare `requiredDomains`, and missing evidence for any declared required domain is a failure rather than being silently omitted from the denominator.

This makes the 90% contract auditable without embedding an unapproved product-priority model into QA math.

## 2. Determinism gate

A deterministic fixture is evaluated over **10 runs in the same environment**.

Every run must carry the same non-empty `environmentFingerprint`. A run from a different environment is not comparable and fails the determinism gate rather than being averaged into it.

The following must remain identical after explicit normalization of intentionally variable capture metadata:

- asset hash set;
- normalized Source Graph hash;
- normalized Render Tree hash;
- stable identity set;
- layout decisions and their reasons.

The Source Graph normalizer excludes only declared revision metadata that is expected to change per capture (`capturedAt`, `captureId`, `revisionId`, `parentRevisionId`). Stable semantic/source fields are not broadly ignored.

Fewer than ten runs are `UNAVAILABLE`, not `PASS`. Duplicate/empty run ids, missing environment evidence, environment drift, or any semantic fingerprint mismatch across the run set are failures.

## 3. Performance and scale

Hard millisecond budgets are **not invented up front**. NODE-30 records durations, median and p95, then calibrates hard budgets only from reproducible benchmark evidence.

Every timing sample must name one non-empty `benchmarkEnvironment`. Median and p95 are only meaningful across samples from the same declared environment; mixed-environment aggregation is a failure.

The functional scale contract is already frozen:

- `<2k` render nodes — normal path;
- `2k–5k` — normal path;
- `5k–10k` — chunking- or progress-capable path;
- `10k–20k` — must complete without fatal crash on the benchmark environment; chunking/warning allowed;
- `20k–50k` — user warning plus section/simplified-import recommendation;
- `>50k` — explicit confirmation or section/simplified strategy required.

A deterministic 10k benchmark that routinely crashes capture/import is release-blocking.

### 10k calibration evidence

NODE-30 includes a real renderer benchmark rather than an empty timing task. The fixture constructs 10,000 W2F RenderNodes and 10,000 SourceNodes, performs a warm-up, then runs `renderBasicFigmaScene` five measured times against the in-memory Figma adapter while verifying that 10,000 Figma-side nodes are created and that the run completes without a fatal crash.

Two exact-head pull-request runs produced the following evidence in the same declared benchmark environment, `linux-x64-node-24.19.0-memory-figma-v1`:

| CI | Median | p95 | Result |
| --- | ---: | ---: | --- |
| #712 | 243.32 ms | 269.11 ms | PASS; five 10k runs completed |
| #714 | 156.20 ms | 748.69 ms | PASS; five 10k runs completed |

These measurements prove the frozen functional 10k scale gate can complete on the benchmark harness, but they do **not** justify a cross-environment hard millisecond release budget. The hosted runner shows substantial tail-latency variation between otherwise comparable runs, and the benchmark uses an in-memory Figma adapter rather than the production Figma desktop/runtime boundary.

Therefore `calibratedHardBudgetMs` intentionally remains `null` at NODE-30 closure. This is not a silent PASS or a lowered threshold: no hard millisecond threshold was frozen in the Acceptance Contract. NODE-31 may add production-environment calibration evidence, but it may not retroactively claim that these CI timings are a product SLA.

## 4. Canonical fingerprints

NODE-30 uses canonical JSON with lexicographically sorted object keys and preserved array order. Only explicitly named volatile keys are excluded. Diagnostic hashes are deterministic fingerprints; asset integrity continues to use the existing `.wtf` SHA-256 evidence.

This canonicalization is for repeat-run equality, not for security or package integrity.

## 5. Status model

- `PASS` — the frozen gate is satisfied;
- `WARNING` — the functional gate passes but a non-fatal scale or capability concern was observed;
- `FAIL` — a frozen requirement is violated;
- `UNAVAILABLE` — required benchmark evidence is missing, including fewer than ten determinism runs.

`UNAVAILABLE` is never silently converted to `PASS`.

## 6. Evidence boundary

NODE-30 consumes existing system evidence rather than replacing prior nodes:

- NODE-15 owns deterministic viewport plans and per-viewport captures;
- NODE-16 owns responsive inference and confidence/reason evidence;
- NODE-27 owns Figma-native responsive layout reconstruction;
- NODE-29 owns single-import visual, structure, editability and raster QA.

NODE-30 may aggregate or compare those outputs across viewports/runs, but it must not re-infer CSS from screenshots or weaken NODE-29 anti-raster rules.

## Exit gate

NODE-30 is complete only when:

1. responsive scoring covers the frozen deterministic cases and the >=90% threshold;
2. the composite uses documented domain math and required evidence cannot silently disappear;
3. ten-run determinism compares assets, normalized Source Graph, Render Tree, stable identities, and layout decisions in one declared environment;
4. performance scale gates are enforced and timing aggregation is environment-scoped;
5. benchmark measurements provide evidence for any hard-ms calibration rather than inventing thresholds;
6. permanent NODE-30 validator is in CI;
7. exact-head lint, typecheck, tests, build/plugin validation and format checks all pass;
8. NODE-27/28/29 permanent validators remain green.

CI #714 satisfied these executable gates at commit `ad8a578c029cef0a2cc885ec3179b943189665aa`. A final exact-head CI is required after this evidence documentation commit before PR #37 can be merged.

## Boundary with NODE-31

NODE-31 owns real-world compatibility, compatibility matrix generation, known-limitations closure and Release Candidate packaging. NODE-30 provides the repeatable responsive/determinism/performance evidence NODE-31 consumes.
