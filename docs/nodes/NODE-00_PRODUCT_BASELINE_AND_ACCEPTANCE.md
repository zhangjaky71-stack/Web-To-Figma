# NODE-00 — Product Baseline & Acceptance Contract

**Status:** DONE  
**Baseline:** V2 Baseline + V2.1 Addendum  
**Package:** `.wtf` (`application/x-wtf`)

## Objective

Freeze the product contract before code scaffolding so every later NODE has stable definitions for scope, capture semantics, quality, security, non-goals and release acceptance.

## Inputs

- V2 Development Implementation Baseline
- V2.1 Architecture Addendum
- `.wtf` export-format decision

## Outputs

- `docs/PRODUCT_BASELINE_V2.md`
- `docs/ACCEPTANCE_CONTRACT_V2.md`
- `docs/CAPTURE_SEMANTICS.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/adr/ADR-0000-architecture-baseline-freeze.md`
- updated `docs/status/W2F_IMPLEMENTATION_STATUS_V2.1.md`

## Decisions frozen in NODE-00

### D-001 — Portable package extension

Canonical export/import extension: `.wtf`.

Canonical MIME: `application/x-wtf`.

`W2F` remains the product/project/internal namespace.

### D-002 — Capture unit

The product captures the **Current Rendered Application State**, not an implicit whole-site crawl.

### D-003 — Full Page

Full Page resolves to document or primary application scroll-root capture. It does not imply other routes/states.

### D-004 — Three structural relationships

W2F distinguishes Source Tree, Composed Tree and Render Tree.

### D-005 — Native-first quality contract

Pixel similarity alone is insufficient. A full-page raster screenshot cannot satisfy editability/structure acceptance.

### D-006 — Responsive evidence order

Authored CSS → media/container evidence → multi-viewport → computed style → geometry inference → conservative downgrade.

### D-007 — Future update foundation

Stable IDs, structural fingerprints and revision hashes are preserved, but automatic incremental update is not P0.

### D-008 — Local-first/privacy

No capture content upload is required by the core conversion path. Passwords, cookies, local/session storage and authorization secrets are not persisted into `.wtf` by default.

### D-009 — Security

`.wtf` is untrusted data. Import never executes embedded page HTML/JS.

### D-010 — Architecture freeze

No V3 is created unless an implementation blocker, platform/API change, security incompatibility or non-compatible schema requirement is demonstrated and recorded by ADR.

## P0 release scope frozen

P0 includes:

- online full-page/region capture;
- offline `file://` and local-folder support;
- Source/Composed/Render structures;
- stable identity foundations;
- CSS/text/assets/pixel ground truth;
- responsive snapshot/evidence foundations;
- `.wtf` packaging/version/security;
- Figma choose/drop intake;
- secure parser and rollback transaction;
- native Figma reconstruction where supported;
- capability-based minimal fallback;
- visual/structure/editability/responsive/determinism/security QA.

## Non-goals frozen

V2 does not promise:

- whole-site crawling;
- arbitrary JS/runtime transfer;
- universal fully editable WebGL/canvas/video conversion;
- automatic incremental Figma update;
- automatic Figma Variables/Components generation;
- universal 100% pixel-perfect and editable output for every webpage.

## Quality gates frozen

The acceptance contract establishes initial release targets including:

- Level 1/2 deterministic visual similarity target >= 99%;
- realistic supported corpus median visual similarity >= 95%;
- deterministic geometry fidelity >= 98%;
- supported-font text fidelity >= 97%;
- deterministic asset fidelity >= 99%;
- structure composite >= 95%;
- supported-corpus editable area median >= 90%;
- supported responsive fixture composite >= 90%;
- native-supported standard corpus raster-area median <= 15%;
- deterministic normalized capture structures repeat across 10 runs;
- zero known critical/high security blockers.

Threshold changes require evidence and reviewed contract/ADR updates.

## DoD checklist

- [x] Product scope defined.
- [x] `.wtf` format contract defined.
- [x] P0/P1/P2 defined.
- [x] Non-goals defined.
- [x] Capture semantics defined.
- [x] Full Page / Scroll Root / Region terms defined.
- [x] Quality metrics defined.
- [x] Release gates defined.
- [x] Security/privacy baseline defined.
- [x] Known limitations documented.
- [x] Architecture freeze rule documented.
- [x] NODE-01 entry criteria defined.

## NODE-01 entry criteria

NODE-01 may begin when this branch is merged or accepted as the working baseline.

NODE-01 must create the monorepo foundation without changing the contracts above unless an ADR is approved.

Expected NODE-01 outputs include:

- pnpm workspace;
- Turborepo configuration;
- TypeScript base configs;
- ESLint/Prettier;
- Vitest;
- browser-extension app shell placeholder;
- figma-plugin app shell placeholder;
- shared package placeholders;
- CI baseline;
- root build/test/lint/typecheck scripts.

## Next

`NODE-01 — Monorepo Foundation`
