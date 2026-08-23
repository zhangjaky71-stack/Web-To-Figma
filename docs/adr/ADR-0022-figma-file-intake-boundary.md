# ADR-0022 — Figma Shell / Secure Parser Boundary

- **Status:** Accepted
- **Date:** 2026-08-23
- **Node:** NODE-22

## Context

W2F for Figma must accept large local `.wtf` files from both an iframe UI and the Figma Canvas Drop API. The following NODE, NODE-23, is explicitly responsible for treating the archive as hostile input.

If NODE-22 also unzips or validates archive internals, the project would create two parser paths with different security behavior.

## Decision

NODE-22 is an intake-only trust boundary.

- UI Choose File / UI Drop read local bytes with browser `File.arrayBuffer()`.
- active-plugin Canvas Drop reads `DropFile` bytes in the main sandbox and forwards them to UI.
- all messages use the versioned `w2f-figma-plugin` protocol.
- the shell may enforce only pre-parser metadata constraints such as `.wtf` filename and frozen archive byte ceiling.
- after bytes are available, state becomes `awaiting-secure-parser`.
- NODE-23 alone opens and validates the archive.

The manifest requests no network domains and uses Figma `dynamic-page` document access.

## Render policy reservation

NODE-22 freezes the renderer-facing policy vocabulary without rendering:

```text
high-fidelity
balanced
design-friendly
```

Balanced is default.

Import scope is separate:

```text
whole-page
selected-sections
```

The token policy is `literal` for V2.1 first release.

## V2.1 handoff

The preview/plan contracts reserve revision metadata, stable source mapping and token evidence so later rendering does not lose long-term source/update information.

## Consequences

- no archive parser dependency is added in NODE-22;
- security testing for ZIP/checksum/migration stays centralized in NODE-23;
- the UI can be implemented and tested before secure parsing exists;
- Canvas drop placement metadata is preserved for the future render transaction;
- NODE-24+ can consume a validated plan without coupling to raw file acquisition.
