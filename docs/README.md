# Web-To-Figma Documentation

## Export package format

The exported Web-To-Figma package format is standardized as:

```text
Extension: .wtf
MIME: application/x-wtf
```

`W2F` remains the product/project/internal namespace name. Only the exported portable file extension is `.wtf`.

## Current implementation baseline

The active architecture baseline is:

1. `V2 Baseline`
2. `V2.1 Architecture Addendum`
3. NODE-00 product and acceptance contracts

Together they define the implementation contract for NODE-00 through NODE-31.

Architecture is frozen for implementation. Do not introduce V3 or expand the architecture again unless an implementation blocker or a material Chrome/Figma platform change requires it.

## Active shared implementation contracts

```text
docs/WTF_FILE_SPEC_V2.md
packages/w2f-schema

docs/WTF_IR_V2.md
packages/w2f-ir

docs/STABLE_IDENTITY_SOURCE_MAPPING_V2.md
packages/stable-identity

docs/BROWSER_EXTENSION_SHELL_V2.md
apps/browser-extension

docs/SOURCE_PROVIDERS_OFFLINE_V2.md
packages/source-providers

docs/CAPTURE_SEMANTICS.md
packages/capture-core
packages/standard-capture-adapter

docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md
packages/cdp-capture-adapter

docs/TEXT_INLINE_PSEUDO_CAPTURE_V2.md
packages/capture-core
packages/standard-capture-adapter
packages/cdp-capture-adapter
```

## Current documents

### Architecture / planning

- `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md` — approved V2.1 architecture addendum.
- `docs/.wtf-parts/v2/` — lossless staged parts for `Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md`.
- `docs/.wtf-parts/v1/` — lossless staged parts for the historical V1 implementation plan.

### Active implementation contracts

- `docs/PRODUCT_BASELINE_V2.md` — frozen product baseline.
- `docs/ACCEPTANCE_CONTRACT_V2.md` — frozen acceptance contract.
- `docs/WTF_FILE_SPEC_V2.md` — normative `.wtf` V2 portable-file specification.
- `docs/WTF_IR_V2.md` — normative Semantic IR V2 specification.
- `docs/STABLE_IDENTITY_SOURCE_MAPPING_V2.md` — stable cross-capture identity and source-mapping contract.
- `docs/BROWSER_EXTENSION_SHELL_V2.md` — production Browser Extension MV3 shell, lifecycle and permission contract.
- `docs/SOURCE_PROVIDERS_OFFLINE_V2.md` — HTTP/file/local-folder source-provider and offline-access boundary.
- `docs/CAPTURE_SEMANTICS.md` — shared RawSnapshot/Standard capture/region semantics.
- `docs/CDP_HIGH_FIDELITY_ADAPTER_V2.md` — High Fidelity CDP adapter, permission and fallback contract.
- `docs/TEXT_INLINE_PSEUDO_CAPTURE_V2.md` — NODE-10 text-run, fragment, baseline, inline, pseudo and safe form visual evidence contract.
- `docs/IMPLEMENTATION_STATUS.md` — canonical current implementation status.
- `docs/nodes/` — per-NODE implementation/DoD records.
- `docs/adr/` — accepted architecture and engineering decisions.

### Historical status

- `docs/status/W2F_IMPLEMENTATION_STATUS_V2.1.md` — architecture-era status before executable NODE implementation tracking moved to `docs/IMPLEMENTATION_STATUS.md`.
- `docs/status/W2F_IMPLEMENTATION_STATUS_V2.md` — historical V2 status before the V2.1 addendum.

## Reassemble the two long Markdown documents

Run from the repository root:

```bash
bash scripts/reassemble-wtf-docs.sh
```

The script reconstructs and verifies:

```text
docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md
docs/archive/Web2Figma_W2F_Development_Implementation_Plan_V1.md
```

Verification targets:

| Document | Lines | SHA-256 |
|---|---:|---|
| V2 Baseline | 3334 | `f731f4bef9590793bf12bb01a1fe98e9683bb266f682ce01df00b5f35fb0ddb8` |
| V1 historical plan | 5049 | `4f65c5fb5422ffd1fc394bdfe3ecfc0fe4bd34699bd73ae90064a5a112b64477` |

## Current development point

Completed:

```text
NODE-00 — Product Baseline & Acceptance Contract
NODE-01 — Monorepo Foundation
NODE-02 — W2F File Spec V2
NODE-03 — W2F IR V2
NODE-04 — Stable Identity & Source Mapping
NODE-05 — Browser Extension Shell
NODE-06 — Source Providers & Offline
NODE-07 — Region Selector & Redaction
NODE-08 — Standard DOM Capture
NODE-09 — CDP High Fidelity Adapter
```

Current implementation node:

```text
NODE-10 — Text / Inline / Pseudo Capture
```

NODE-10 implementation and behavior fixtures are complete. Its formal standard read-only documentation/status Exit Gate and PR #14 merge remain before the roadmap advances.

Next implementation node after NODE-10 merge:

```text
NODE-11 — CSS Cascade & Authored Semantics
```
