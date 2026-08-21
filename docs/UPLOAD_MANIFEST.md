# W2F Documentation Upload Manifest

Repository: `zhangjaky71-stack/Web-To-Figma`

Branch prepared for review: `docs/wtf-format-baseline`

## Export package format

```text
Extension: .wtf
MIME: application/x-wtf
```

The product/project/internal namespace remains `W2F`; only the exported portable package extension is `.wtf`.

## Logical documents uploaded

| Document | Repository location | Status |
|---|---|---|
| Web2Figma W2F Development Implementation Plan V1 | `docs/.wtf-parts/v1/` → reconstructs to `docs/archive/Web2Figma_W2F_Development_Implementation_Plan_V1.md` | Historical |
| Web2Figma W2F Development Implementation Plan V2 Baseline | `docs/.wtf-parts/v2/` → reconstructs to `docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md` | Current baseline |
| Web2Figma W2F Architecture V2.1 Addendum | `docs/baseline/Web2Figma_W2F_Architecture_V2.1_Addendum.md` | Current addendum |
| W2F Implementation Status V2 | `docs/status/W2F_IMPLEMENTATION_STATUS_V2.md` | Historical status |
| W2F Implementation Status V2.1 | `docs/status/W2F_IMPLEMENTATION_STATUS_V2.1.md` | Current status |

## Canonical integrity values

```text
V1 plan
lines: 5049
sha256: 4f65c5fb5422ffd1fc394bdfe3ecfc0fe4bd34699bd73ae90064a5a112b64477

V2 baseline
lines: 3334
sha256: f731f4bef9590793bf12bb01a1fe98e9683bb266f682ce01df00b5f35fb0ddb8

V2.1 addendum
lines: 1658
sha256: 4ef25fa6ae551934bcb7a4166d1f8ce233b1be46a3b16cf00a672039853c9209

V2 status
sha256: 031a9aff8dd52e5de4f842dc3c0c16fe4dc11b0094d630681fd5bd5540ddae64

V2.1 status
sha256: 24a70ada9c8cb865f2690ab44ed8ae028f19fdb27c9b93a99b0bc1314df964ea
```

## Reassembly

```bash
bash scripts/reassemble-wtf-docs.sh
```

The script validates both reconstructed long documents against their canonical line counts and SHA-256 hashes.
