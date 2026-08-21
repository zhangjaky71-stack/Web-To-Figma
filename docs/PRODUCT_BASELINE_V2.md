# Web-To-Figma Product Baseline V2

**Status:** APPROVED FOR IMPLEMENTATION  
**Baseline:** V2 Baseline + V2.1 Addendum  
**Export/import package:** `.wtf`  
**MIME:** `application/x-wtf`  
**NODE:** NODE-00 — Product Baseline & Acceptance Contract

## 1. Product definition

Web-To-Figma (W2F) is a local-first web rendering translation system composed of:

1. a Chromium browser extension that captures the current rendered web application state;
2. a portable `.wtf` package that stores source, semantic, responsive, asset, diagnostic, and pixel-ground-truth data;
3. a Figma plugin that reconstructs the package into useful Figma-native layers wherever practical;
4. validation tooling that measures visual fidelity, structure quality, editability, responsive behavior, determinism, and performance.

W2F is not a screenshot importer. The governing strategy is:

`Native First + Semantic Hierarchy + Responsive Evidence + Visual Validation + Minimal Raster Fallback`.

## 2. Primary user workflow

### 2.1 Online page

`HTTP/HTTPS page → Full Page or Region → Capture → .wtf → Figma Plugin → Editable Figma Scene`

### 2.2 Offline page

`file:// page or local site folder → Capture → .wtf → Figma Plugin → Editable Figma Scene`

### 2.3 Figma intake

Supported intake paths are:

- Choose `.wtf` from the plugin UI.
- Run the W2F plugin, then drop `.wtf` on the Figma canvas while the plugin is active.

Dragging `.wtf` into Figma while the W2F plugin is not running is not a release requirement.

## 3. Capture unit

The canonical capture unit is the **Current Rendered Application State**.

A capture represents what the current route/state can render through the supported capture process. It does not implicitly mean the whole website, every SPA route, every hidden tab, every modal state, every pagination page, or every virtualized record.

Detailed semantics are defined in `docs/CAPTURE_SEMANTICS.md`.

## 4. Product outcomes

A successful W2F import must optimize all of the following at the same time:

- visual fidelity;
- geometry fidelity;
- text fidelity;
- asset fidelity;
- structure fidelity;
- editable area ratio;
- responsive fidelity in supported cases;
- low raster area ratio.

A full-page bitmap can score highly on pixels but is not considered a successful product outcome.

## 5. Structural contract

W2F maintains three different structural relationships where required:

- **Source Tree** — source DOM/Shadow/iframe relationships and source traceability;
- **Composed Tree** — browser-composed relationships after slot/shadow flattening;
- **Render Tree** — Figma-oriented hierarchy after safe wrapper reduction and semantic optimization.

The product promise is not “100% copy every DOM wrapper into Figma.” The promise is:

> preserve meaningful web structure and complete source mapping while producing a Figma hierarchy that is understandable and editable.

## 6. Identity contract

Every captured node may have:

- `captureNodeId` — unique inside one capture;
- `stableNodeId` — cross-capture identity with confidence/evidence;
- `structuralFingerprint` — repeated-structure identity used for future component candidates;
- revision hashes — content, geometry, layout, paint, asset, and hierarchy fingerprints.

V2 stores these foundations but does not require automatic three-way merge or incremental update UI.

## 7. Responsive contract

Responsive inference follows this evidence order:

1. authored CSS evidence;
2. media/container-query evidence;
3. multi-viewport snapshots;
4. computed style;
5. geometry inference;
6. conservative downgrade.

The current Figma renderer is not expected to become a complete browser media-query runtime. V2 must identify and preserve responsive evidence, reconstruct supported local responsive behavior, and report structural breakpoint changes it cannot faithfully execute in Figma.

## 8. File-format contract

The portable package extension is exclusively:

`.wtf`

The MIME identifier is:

`application/x-wtf`

`W2F` remains the project/product/internal namespace and may appear in package names such as `w2f-schema`, diagnostic identifiers, plugin data keys, and code symbols. It must not be interpreted as the exported file extension.

The `.wtf` container is data, never executable content.

## 9. P0 scope — Release-blocking capability

P0 is required for Release Candidate unless a requirement is explicitly moved by an approved ADR.

### Browser capture

- Chromium Manifest V3 extension shell.
- Full-page capture for standard document pages.
- Primary application scroll-root capture for supported app shells.
- Free rectangular region capture.
- Online `http/https` pages.
- `file://` pages with explicit user permission.
- Local-folder relative asset resolution.
- DOM/source hierarchy.
- composed-tree relationships for supported open Shadow DOM/slots.
- geometry and box-model data.
- text runs/fragments sufficient for reconstruction.
- CSS computed data plus authored semantics where accessible.
- image/SVG/CSS-image asset localization.
- pixel ground truth.
- stable identity foundations.
- `.wtf` packaging, checksums, feature flags, version contract.
- capture diagnostics.

### Responsive

- current-viewport capture;
- multi-viewport snapshot orchestration;
- media-query evidence where accessible;
- container-query evidence where accessible;
- FILL/HUG/FIXED inference with confidence/reasons;
- breakpoint/visibility/layout-change reporting.

### Figma

- choose-file intake;
- canvas drop while plugin is active;
- secure `.wtf` parsing;
- rollback-safe import transaction;
- native Frames, Text, Images, SVG and basic paint;
- Auto Layout for supported Flex-like structures;
- supported Grid reconstruction;
- FILL/HUG/FIXED/min/max/constraints where valid;
- native/emulated/absolute/raster capability resolution;
- partial section import for large pages;
- import diagnostics.

### Quality/security

- visual QA;
- structure/editability QA;
- responsive QA;
- deterministic fixture QA;
- archive and SVG security validation;
- privacy defaults defined in this baseline.

## 10. P1 scope — High-value enhancement

P1 may land before or after the first RC without changing the V2 core contract:

- stronger CDP High Fidelity coverage;
- advanced virtualized-list stitching;
- more CSS image/filter/mask mappings;
- stronger table edge cases;
- more international text shaping corrections;
- richer responsive reconstruction;
- improved section detection;
- deeper Figma style/token utilization;
- more import optimization for 20k+ nodes.

## 11. P2 / future scope

The following are explicitly future-facing and must not block V2 core delivery:

- automatic incremental update of an existing Figma import;
- three-way Web Base / Latest Web / Current Figma merge;
- automatic Figma Variables creation and existing-token matching;
- automatic Component/Instance generation from repeated structures;
- full design-system-aware import;
- capture of all UI states and conversion to variants;
- whole-site crawling / all-route SPA capture;
- full runtime interaction transfer;
- browser-to-Figma motion/runtime execution;
- Figma-to-Web reverse generation as part of this release.

## 12. Non-goals

W2F V2 is not:

- a browser engine embedded in Figma;
- a JavaScript application-runtime exporter;
- a crawler that automatically clones an entire website;
- a way to bypass cross-origin/browser security boundaries;
- a font redistribution system;
- a guarantee that arbitrary WebGL/canvas/video content becomes editable vectors;
- a guarantee of 100% pixel-perfect and fully editable output for every webpage on the internet.

## 13. Privacy baseline

Default behavior is local-first:

- no webpage upload is required for conversion;
- cookies are not persisted into `.wtf`;
- localStorage/sessionStorage are not persisted;
- authorization headers/tokens are not persisted;
- password field values are never persisted;
- current form values are off by default unless a later product decision explicitly enables selected safe values;
- telemetry is off by default until separately specified.

## 14. Security baseline

`.wtf` is treated as untrusted input on import.

The importer must enforce:

- schema/version validation;
- archive path normalization and zip-slip rejection;
- decompression/file-count/size/compression-ratio limits;
- checksum verification;
- MIME sniffing where applicable;
- SVG sanitization;
- no embedded HTML/JS execution;
- no `eval`-style execution path;
- no network fetch by default during import.

## 15. Build strategy

The architecture supports:

- W2F Standard — minimal permission footprint;
- W2F High Fidelity — CDP/debugger-based enhanced capture where product distribution policy allows it.

Both builds must normalize into the same W2F IR and `.wtf` contract.

## 16. Architecture freeze rule

The active baseline is:

`V2 Baseline + V2.1 Addendum + NODE-00 contracts`

A V3 must not be created merely to add convenience features. A major architecture revision requires one of:

- a proven implementation blocker;
- a material Chrome/Figma platform/API change;
- a security incompatibility;
- a schema requirement that cannot be added compatibly.

Such changes require an ADR.

## 17. Release definition

The product is release-ready only when the measurable gates in `docs/ACCEPTANCE_CONTRACT_V2.md` pass and all declared P0 capabilities are either implemented or explicitly moved by an approved ADR.

## 18. NODE-00 exit criteria

NODE-00 is complete when:

- this Product Baseline is committed;
- the Acceptance Contract is committed;
- Capture Semantics are committed;
- Known Limitations are committed;
- architecture freeze is recorded;
- implementation status advances to NODE-01.
