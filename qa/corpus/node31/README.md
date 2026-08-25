# NODE-31 Versioned Realistic Corpus

This directory contains the local, versioned **Class B** source corpus required by `docs/ACCEPTANCE_CONTRACT_V2.md` for NODE-31 Release Candidate evaluation.

## Rules

- Fixtures are authored locally and must not depend on public network resources.
- A committed HTML file is only a **source input**, not a PASS result.
- `docs/qa/NODE-31_RC_EVIDENCE_V1.json` stays `UNAVAILABLE` for a fixture until the declared capture → `.wtf` → Figma QA measurement artifact exists.
- Canvas and WebGL are explicit `expected-fallback` cases. Only their rendering surfaces may use the documented minimal local raster fallback; surrounding text/layout remains native where supported.
- Class B results must not be replaced by Class C live-site smoke tests.
- Any PASS evidence must name its source artifact so results can be audited.

## Required categories

| Category | Source | Expected support |
| --- | --- | --- |
| landing-page | `landing-page.html` | native-supported |
| ecommerce | `ecommerce.html` | native-supported |
| docs | `docs.html` | native-supported |
| dashboard | `dashboard.html` | native-supported |
| table | `table.html` | native-supported |
| saas-shell | `saas-shell.html` | native-supported |
| local-site | `local-site.html` + `local-site-mark.svg` | native-supported |
| shadow-dom | `shadow-dom.html` | native-supported |
| iframe | `iframe.html` | native-supported |
| canvas | `canvas.html` | expected-fallback surface |
| webgl | `webgl.html` | expected-fallback surface |
| responsive-app | `responsive-app.html` | native-supported |

These fixtures deliberately exercise responsive layout, text, authored CSS, tables, app shells, relative local assets, Shadow DOM, nested documents and explicit canvas/WebGL fallback boundaries without using remote dependencies.
