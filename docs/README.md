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

Together they define the implementation contract for NODE-00 through NODE-31.

## Current documents

### Architecture / planning

- `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md` — approved V2.1 architecture addendum.
- `docs/.wtf-parts/v2/` — lossless staged parts for `Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md`.
- `docs/.wtf-parts/v1/` — lossless staged parts for the historical `Web2Figma_W2F_Development_Implementation_Plan_V1.md`.

### Implementation status

- `docs/status/W2F_IMPLEMENTATION_STATUS_V2.1.md` — current status; use this going forward.
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

## Development start point

Current node:

```text
NODE-00 — Product Baseline & Acceptance Contract
```

Architecture is frozen for implementation. Do not introduce V3 or expand the architecture again unless an implementation blocker or a material Chrome/Figma platform change requires it.
