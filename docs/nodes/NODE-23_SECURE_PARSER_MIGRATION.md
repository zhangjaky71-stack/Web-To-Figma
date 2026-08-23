# NODE-23 — Secure Parser & Migration

**Status:** EXIT GATE CANDIDATE  
**Entry baseline:** `84ebc5eddec06b38dd757aecbcdcf7f49a1a76e1`  
**Branch:** `feat/node-23-secure-parser-migration`  
**PR:** #27  
**Validated bootstrap candidate:** `8162922d0d99b820ff756de0143a2b8ecbb58404`

## Frozen scope

- [x] schema validation
- [x] version / reader compatibility
- [x] ZIP bomb limits
- [x] ZIP slip / portable paths
- [x] duplicate / malformed ZIP rejection
- [x] CRC32 and SHA-256 integrity
- [x] inventory / entry-size agreement
- [x] asset MIME / nested archive policy
- [x] SVG sanitizer
- [x] V2 migration report
- [x] parser preview preserving revision/stable mapping/literal tokens
- [x] Figma UI integration for Choose / UI Drop / Canvas Drop
- [x] permanent NODE-23 foundation gate
- [x] frozen lockfile refresh for new workspace package
- [x] repository-wide `pnpm check`
- [ ] exact-head read-only CI
- [ ] squash merge to `main`

## Package

```text
@w2f/wtf-parser
```

The package is platform independent. It accepts raw `Uint8Array` and returns a validated `WtfParsedPackage` or a structured `WtfParserError`.

## Trust boundary

Only `parseWtfPackage()` may convert raw archive bytes into renderer-consumable evidence.

Validation order is documented in `docs/SECURE_PARSER_MIGRATION_V2.md` and ADR-0023.

## Security fixtures

Tests include:

- valid deterministic NODE-21 Store ZIP;
- Zip Slip;
- duplicate central-directory path;
- central entries sharing one local header / overlapping metadata;
- malformed ZIP metadata;
- SHA-256 tampering after ZIP CRC is recomputed;
- hidden archive entry absent from manifest;
- unsafe SVG;
- unsupported required capability;
- compatible and incompatible V2 migration cases.

## Bootstrap evidence

Controlled Bootstrap CI #622 (`32674411827`) passed the full repository `pnpm check` and produced:

```text
8162922d0d99b820ff756de0143a2b8ecbb58404
```

The candidate contains the refreshed `pnpm-lock.yaml`, permanent NODE-23 foundation integration and production Figma/parser integration. Before the candidate was pushed, the bootstrap restored the normal read-only `.github/workflows/ci.yml` and removed the temporary finalizer and diagnostic failure log.

## Exit gate

NODE-23 is complete only after the exact PR head passes:

```text
validate:foundation
frozen pnpm install
lint
typecheck
test
build
Figma package validator
format check
```

The Bootstrap candidate has already passed the full closure above. The remaining gate is a normal exact-head read-only CI run on the evidence commit, followed by squash merge to `main`.
