# NODE-22 — Figma Plugin Shell & File Intake

## Goal

Turn the placeholder Figma workspace app into a loadable local-first Figma plugin shell that accepts `.wtf` bytes and captures the import policy needed by downstream parser/renderer NODEs.

## Entry baseline

```text
5395d1eb3c29187f6a07cacccd6b6ddfab4890ee
```

## Required implementation

- [x] Figma manifest;
- [x] bundled main sandbox;
- [x] bundled iframe UI;
- [x] Choose `.wtf`;
- [x] UI drop;
- [x] Canvas drop while plugin is active;
- [x] Canvas placement coordinates;
- [x] typed/versioned main ↔ UI protocol;
- [x] progress state;
- [x] High Fidelity / Balanced / Design Friendly profiles;
- [x] Whole Page / Selected Sections scope;
- [x] section outline contract;
- [x] V2.1 revision/stable-source/token handoff fields;
- [x] literal token policy;
- [x] explicit NODE-23 secure-parser boundary;
- [x] no network domains;
- [x] unit tests;
- [x] packaged-output validation;
- [x] permanent dependency-free NODE guardrail;
- [ ] frozen-lockfile refresh;
- [ ] full repository CI;
- [ ] exact-head Exit Gate;
- [ ] squash merge.

## Non-goals

NODE-22 intentionally does not implement:

- ZIP extraction;
- manifest/schema/checksum verification;
- migration;
- SVG sanitization;
- Figma capability resolution;
- node rendering;
- font/image/paint reconstruction;
- responsive renderer;
- raster fallback renderer.

## Runtime boundary

```text
Choose/UI Drop ── File.arrayBuffer() ─┐
                                      ├─> UI Intake State
Canvas Drop ── DropFile.getBytesAsync() ─> main ─> versioned W2F_FILE_BYTES ─┘

UI Intake State
  -> awaiting-secure-parser
  -> NODE-23
```

## Exit criteria

The final candidate must prove:

1. the manifest/build outputs are locally loadable-shaped (`dist/code.js`, `dist/ui.html`);
2. no bare runtime imports remain in the bundles;
3. no network access was introduced;
4. the shell does not open untrusted archives;
5. Choose/UI Drop/Canvas Drop share one intake model;
6. progress/import profile/partial-import contracts are deterministic and tested;
7. V2.1 preservation requirements are visible in the typed handoff;
8. repository-wide frozen CI is green.
