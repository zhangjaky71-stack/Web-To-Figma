import { describe, expect, it } from "vitest";
import type { WtfManifest } from "@w2f/w2f-schema";
import { migrateCompatibleV2 } from "../src/index.js";

function manifest(formatVersion = "2.0.0", schemaVersion = "2.0.0"): WtfManifest {
  return {
    kind: "w2f-portable-document",
    compatibility: {
      formatVersion,
      schemaVersion,
      writerVersion: "1.0.0",
      minReaderVersion: "1.0.0",
      assetCodecVersion: "1",
      capabilities: [],
    },
    identity: {
      documentId: "doc",
      captureId: "cap",
      sourceFingerprint: "a".repeat(64),
      capturedAt: "2026-08-23T00:00:00.000Z",
    },
    captureTarget: { type: "document" },
    entrypoints: {
      document: "document.json",
      sourceGraph: "source-graph.json",
      renderTree: "render-tree.json",
      styles: "styles.json",
      assets: "assets.json",
      responsive: "responsive.json",
      states: "states.json",
      diagnostics: "diagnostics.json",
      tokens: "tokens.json",
      sourceCascade: "source/cascade.json",
      sourceMetadata: "source/metadata.json",
    },
    features: { required: [], optional: [] },
    files: [],
    security: {
      limits: {
        maxArchiveBytes: 1_073_741_824,
        maxEntryBytes: 268_435_456,
        maxJsonBytes: 134_217_728,
        maxAssetBytes: 536_870_912,
        maxEntries: 100_000,
        maxPathLength: 1024,
        maxCompressionRatio: 200,
      },
    },
  };
}

describe("NODE-23 migration policy", () => {
  it("keeps the frozen 2.0.0 format as a no-op migration", () => {
    expect(migrateCompatibleV2(manifest())).toMatchObject({ migrated: false, steps: [] });
  });

  it("routes compatible V2 minor versions through the explicit pass-through migration", () => {
    expect(migrateCompatibleV2(manifest("2.1.0", "2.1.0"))).toMatchObject({
      migrated: true,
      steps: ["v2-compatible-pass-through", "preserve-unknown-optional-metadata"],
    });
  });

  it("rejects unsupported major versions", () => {
    expect(() => migrateCompatibleV2(manifest("3.0.0", "3.0.0"))).toThrow(
      /WTF_PARSER_MIGRATION_UNSUPPORTED/,
    );
  });
});
