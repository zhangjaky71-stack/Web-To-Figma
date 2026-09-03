# NODE-31 — Real-world Compatibility & Release Candidate

## Objective

NODE-31 is the final V2 Release Candidate closure node. It does not add a new rendering shortcut. It collects versioned evidence from the already implemented capture, package, parser, renderer and QA layers and refuses Release Candidate status unless every frozen release gate in `docs/ACCEPTANCE_CONTRACT_V2.md` is satisfied or an explicit approved ADR allows a P0 move.

The Release Candidate evaluator is intentionally fail-closed: missing evidence is `UNAVAILABLE` or `FAIL`, never an implicit `PASS`.

## 1. Test classes

The Acceptance Contract defines three distinct evidence classes:

- **Class A — deterministic fixtures:** local/versioned primary regression evidence;
- **Class B — versioned realistic corpus:** local captured/authored real-world product evidence;
- **Class C — live compatibility smoke tests:** public-site compatibility signals only.

Class C cannot replace Class A/B because third-party websites can change independently of Web-To-Figma. Live-site drift may produce a warning without automatically blocking a release, but any discovered contradiction with P0 or declared support is still a release failure.

## 2. Versioned realistic corpus coverage

The compatibility matrix requires Class B coverage for the categories named by the frozen contract:

- landing page;
- ecommerce;
- docs;
- dashboard;
- table;
- SaaS shell;
- local site;
- Shadow DOM;
- iframe;
- canvas;
- WebGL;
- responsive application.

Missing a required category fails compatibility-matrix generation. Non-native Class B samples must carry the documented fallback or diagnostic. An expected fallback is not allowed to masquerade as native support.

## 3. Frozen quality gates

NODE-31 encodes the release targets without lowering them:

| Gate | Frozen target |
| --- | ---: |
| Level 1/2 deterministic visual similarity | >= 99% |
| Realistic supported corpus visual median | >= 95% |
| Deterministic geometry fidelity | >= 98% |
| Supported-font deterministic text fidelity | >= 97% |
| Deterministic asset fidelity | >= 99% |
| Deterministic structure fidelity | >= 95% |
| Supported standard HTML/CSS editable-area median | >= 90% |
| Supported responsive deterministic fidelity | >= 90% |
| Native-supported standard corpus raster-area median | <= 15% |

Severe local visual regressions can fail independently of an average/median. Invalid normalized metric evidence also fails rather than being ignored.

## 4. Native/editability anti-cheating gate

Release is blocked by anti-cheating violations including:

- page-level screenshot substitution for supported structure/editability;
- ordinary supported text rasterized only to improve pixel score;
- ordinary images collapsed into page screenshots;
- safely supported SVG unnecessarily rasterized;
- wrapper reduction that destroys clipping, stacking, transforms, scroll, semantics or layout boundaries.

Expected-fallback samples such as Canvas/WebGL are reported separately. Their raster/editability values do not dilute the standard native-supported HTML/CSS editable-area or raster-area medians.

## 5. P0 gate

Every P0 checklist item must be either:

- complete; or
- moved by an explicitly approved ADR with a recorded ADR identifier.

A missing P0 item or an `approved-adr` disposition without an ADR id fails the gate.

### Current P0 closure status

The fail-closed audit `docs/qa/results/NODE-31_P0_AUDIT_882.json` now records `visual-state-freeze-and-restore` as PASS. CI #882 executes the final built visual-state runtime in real Chrome and proves CSS/WAAPI animations plus playing media inside an open ShadowRoot freeze during capture, then resume after restore with zero resume failures and no permanent DOM or inline-state mutation. Permanent read-only exact-head CI #886 then revalidates the repository with the 3-blocker P0 validator, full quality gates and all five NODE-31 runtime gates passing.

NODE-31 remains `UNAVAILABLE` overall and is not Release Candidate ready. The remaining P0 blockers are exactly:

1. `file-protocol-explicit-permission`;
2. `geometry-preserving-correction-policy`;
3. `raster-text-only-when-policy-justifies`.

These items remain blockers until direct repository evidence plus an exact-head CI run proves the declared behavior; implementation presence alone is insufficient.

## 6. Security gate

Release requires zero known critical/high security blockers and PASS evidence for all security fixture classes required by the contract:

- malformed archive;
- path traversal;
- oversized expansion / zip-bomb controls;
- invalid checksum;
- malformed schema;
- hostile SVG.

Security evidence is not inferred from visual QA.

## 7. `.wtf` schema/version compatibility gate

The RC report requires explicit PASS evidence for:

- canonical current V2 manifest;
- `minReaderVersion` enforcement;
- current V2 no-op migration;
- compatible V2 minor migration;
- unsupported major rejection;
- forward optional metadata preservation.

This gate consumes the schema/parser tests; it does not weaken the secure parser or execute package HTML/JS.

## 8. Determinism and scale gates

NODE-31 consumes NODE-30 results:

- deterministic gate requires PASS from the ten-run same-environment evidence;
- scale accepts PASS or non-fatal WARNING only where NODE-30 already defines WARNING as functional completion with a capability concern;
- `UNAVAILABLE` never counts as release-ready.

NODE-31 does not reinterpret NODE-30 hosted-runner timing measurements as a cross-environment product SLA.

## 9. Known-limitations contract

`docs/KNOWN_LIMITATIONS.md` must be current. Release fails when evidence reports:

- undocumented limitations;
- silent support claims;
- a documented limitation contradicting a P0 requirement.

A documented limitation is acceptable only when the promised fallback/diagnostic exists and the product does not falsely claim full support.

## 10. Compatibility matrix behavior

Every corpus sample produces a matrix row with:

- evidence id;
- test class;
- category;
- native-supported / expected-fallback / unsupported-blocked classification;
- PASS/WARNING/FAIL/UNAVAILABLE behavior status;
- fallback/diagnostic reference where required;
- known-limitation reference where applicable.

For Class B, FAIL/UNAVAILABLE rows or undocumented non-native behavior block the release. For Class C, third-party drift is a warning signal unless it contradicts P0 or declared support.

## 11. Overall Release Candidate status

The evaluator returns:

- `PASS` — every required gate has passing evidence;
- `WARNING` — every blocking gate passes and only permitted non-fatal compatibility/scale warnings remain;
- `FAIL` — one or more frozen requirements are violated;
- `UNAVAILABLE` — no known failure exists yet, but required evidence is missing.

`releaseReady` is true only when there are no `FAIL` or `UNAVAILABLE` gates. A `WARNING` Release Candidate is allowed only for warning classes already defined as non-fatal; warnings stay visible in the report.

## Exit gate

NODE-31 is complete only when:

1. a versioned Class A/B evidence manifest is committed;
2. all required Class B realistic categories are represented;
3. the compatibility matrix is generated from versioned evidence;
4. all frozen quality thresholds pass;
5. anti-cheating checks pass;
6. P0 is complete or explicitly moved by approved ADR;
7. determinism and scale evidence from NODE-30 remains valid;
8. security has zero known critical/high blockers and all required hostile fixtures pass;
9. `docs/KNOWN_LIMITATIONS.md` is current and consistent with implementation diagnostics;
10. `.wtf` schema/version compatibility cases pass;
11. permanent NODE-31 validation is wired into CI;
12. exact-head lint, typecheck, tests, build/package validation and format checks pass.

Only after those conditions are met may the project label the branch/build as a V2 Release Candidate.
