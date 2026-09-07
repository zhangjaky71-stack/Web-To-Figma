# NODE-31 Figma Desktop Evidence Runbook

This runbook closes the remaining Class A/B evidence boundary without weakening the frozen V2 acceptance contract.

## 1. Use one exact-head CI run

All Desktop evidence for a release-candidate attempt must come from the same PR head. Download these artifacts from the exact-head CI run:

- `node31-figma-desktop-measurement-harness`
- `node31-level1-measurement-input`
- `node31-level2-measurement-input`
- `node31-classb-measurement-inputs`

Do not mix artifacts from different branch heads. The measurement harness embeds the exact branch SHA and rejects sidecars from another head.

## 2. Install the measurement harness in Figma Desktop

Use **Figma Desktop**, not Figma Web and not the simulator.

From the downloaded harness artifact, import the development plugin using:

`apps/figma-plugin/manifest.node31-measurement.json`

The artifact also contains `apps/figma-plugin/dist-node31-measurement/`, including the bundled plugin code, UI, and `branch-head.txt`.

## 3. Measure each sample

For every Class A/B sample:

1. Import the sample `.wtf` with the production Web-To-Figma plugin.
2. Select the imported W2F root Frame.
3. Open the NODE-31 Desktop measurement harness.
4. Load the matching `.wtf` file.
5. Load the matching partial `.measurement.json` sidecar from the same CI artifact.
6. Confirm that the harness reports:
   - verified `figma-desktop` host;
   - exact-head match;
   - matching `.wtf` SHA-256;
   - matching document/capture/revision/source identity.
7. Run the measurement.
8. Save the generated `*.node31-desktop-evidence.json` archive.

The harness produces real Figma render/export evidence, raw PNG tiles, geometry/text/asset/structure/editability/raster metrics, and responsive fidelity where required. It does not permit browser, simulator, or memory-renderer evidence to stand in for Desktop measurements.

Required release rows are:

- Class A: 2 deterministic samples;
- Class B: 12 realistic corpus samples.

Canvas/WebGL remain expected-fallback samples, but their required visual measurement still has to come from the real Desktop pipeline.

## 4. Batch ingest all Desktop archives

Place the generated `*.node31-desktop-evidence.json` files under one directory, then run from the repository root:

```bash
pnpm node31:ingest-desktop-evidence-batch <archive-directory>
```

The command first builds `@w2f/figma-renderer`, then:

1. recursively discovers Desktop evidence archives without following symlinks;
2. invokes the existing single-archive ingest validator for every archive;
3. rechecks archive/file SHA-256 values, render/export manifests, PNG references, sample identity, and `figma-desktop` provenance;
4. writes versionable evidence under `docs/qa/results/node31-desktop/`;
5. scans the resulting `.measurement.json` files;
6. requires every measurement `branchHead` to equal the current `git HEAD`;
7. promotes only the matching Class A/B manifest row;
8. atomically rewrites `docs/qa/NODE-31_RC_EVIDENCE_V2.json` only after the full promotion set succeeds.

Any failed archive, stale head, simulator host, source mismatch, unsafe path, duplicate/conflicting measurement, or invalid manifest aborts the operation. A partial promotion is not written.

To promote already-ingested measurements without re-ingesting archives:

```bash
pnpm node31:promote-desktop-evidence [measurement-file-or-directory] [manifest-path]
```

## 5. Do not automatically claim RC ready

Promotion changes verified measurement rows from `UNAVAILABLE` to `PASS` and records `measurementArtifact`. It intentionally keeps the manifest state under explicit release control.

After all 14 real Desktop rows are versioned:

1. run the full NODE-31 evaluator and compatibility matrix;
2. verify every frozen visual/geometry/text/asset/structure/editability/responsive/raster threshold;
3. confirm zero anti-cheating violations;
4. run exact-head CI including `Format check`;
5. only then change the evidence manifest to `ready`, mark PR #38 ready for review, and merge if every gate remains PASS.
