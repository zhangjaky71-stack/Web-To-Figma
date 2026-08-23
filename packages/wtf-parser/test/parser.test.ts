import { describe, expect, it } from "vitest";
import type { WtfIrBundle } from "@w2f/w2f-ir";
import { WTF_DEFAULT_ENTRYPOINTS } from "@w2f/w2f-schema";
import {
  encodeDeterministicZip,
  packageWtf,
  type WtfPackagePayload,
  type WtfPackagerInput,
} from "@w2f/wtf-packager";
import { openSecureZip, parseWtfPackage, WtfParserError } from "../src/index.js";

const HASH = "a".repeat(64);
const SVG_PATH = "assets/safe.svg";
const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

function bundle(svgBytes: number): WtfIrBundle {
  return {
    document: {
      irVersion: "2.0.0",
      documentId: "doc_fixture",
      captureId: "cap_fixture",
      revisionId: "rev_fixture",
      sourceFingerprint: HASH,
      sourceGraphRootId: "source_root",
      renderTreeRootId: "render_root",
      environmentRefs: ["env_fixture"],
      environments: [
        {
          id: "env_fixture",
          browserName: "Chromium",
          browserVersion: "140.0.0",
          platform: "test",
          language: "en-US",
          direction: "ltr",
          colorScheme: "light",
          reducedMotion: false,
          viewportWidth: 1440,
          viewportHeight: 900,
          dpr: 1,
          pageZoom: 1,
        },
      ],
      animationCaptureMode: "freeze-current",
      visualState: "current",
    },
    sourceGraph: {
      rootCaptureNodeId: "source_root",
      nodes: [
        {
          captureNodeId: "source_root",
          stableIdentity: { id: "sid_root", confidence: 1, evidence: ["fixture"] },
          kind: "document",
          relationships: {},
          childCaptureNodeIds: [],
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
          assetRefs: ["asset_svg"],
        },
      ],
      scrollContainers: [],
      revision: {
        documentId: "doc_fixture",
        captureId: "cap_fixture",
        revisionId: "rev_fixture",
        sourceFingerprint: HASH,
        capturedAt: "2026-08-23T00:00:00.000Z",
      },
    },
    renderTree: {
      rootId: "render_root",
      nodes: [
        {
          id: "render_root",
          childIds: [],
          sourceNodeIds: ["source_root"],
          sourceStableIds: ["sid_root"],
          kind: "document",
          name: "Fixture",
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
          layout: {
            mode: "flow",
            display: "block",
            position: "static",
            sizing: {
              width: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
              height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
            },
            decision: { confidence: 1, reasons: ["fixture"] },
          },
          paint: { fills: [], opacity: 1 },
          assetRefs: ["asset_svg"],
          renderStrategy: "native",
          renderDecision: { confidence: 1, reasons: ["fixture"] },
        },
      ],
      sections: [
        {
          id: "section_root",
          renderNodeId: "render_root",
          name: "Fixture Section",
          childSectionIds: [],
        },
      ],
    },
    styles: { styles: [] },
    assets: {
      assets: [
        {
          id: "asset_svg",
          kind: "svg",
          mediaType: "image/svg+xml",
          embeddedPath: SVG_PATH,
          byteLength: svgBytes,
        },
      ],
      referenceTiles: [],
    },
    responsive: { snapshots: [], rules: [], mediaRules: [], containerQueries: [] },
    states: { states: [] },
    diagnostics: { diagnostics: [] },
    tokens: { tokens: [], usages: [] },
  };
}

function jsonPayload(path: string, role: string, json: unknown): WtfPackagePayload {
  return { path, role, json };
}

async function fixture(
  svg = safeSvg,
  capabilities: string[] = ["source-tree", "render-tree"],
): Promise<Uint8Array> {
  const svgData = new TextEncoder().encode(svg);
  const ir = bundle(svgData.byteLength);
  const payloads: WtfPackagePayload[] = [
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.document, "document", ir.document),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceGraph, "source-graph", ir.sourceGraph),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.renderTree, "render-tree", ir.renderTree),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.styles, "styles", ir.styles),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.assets, "assets-index", ir.assets),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.responsive, "responsive", ir.responsive),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.states, "states", ir.states),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.diagnostics, "diagnostics", ir.diagnostics),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.tokens, "token-graph", ir.tokens),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceCascade, "source-cascade", { version: "fixture" }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceMetadata, "source-metadata", {
      url: "https://example.test/fixture",
      title: "Parser Fixture",
    }),
    { path: SVG_PATH, role: "asset", mediaType: "image/svg+xml", bytes: svgData },
  ];
  const input: WtfPackagerInput = {
    filenameBase: "Parser Fixture",
    identity: {
      documentId: "doc_fixture",
      captureId: "cap_fixture",
      sourceFingerprint: HASH,
      capturedAt: "2026-08-23T00:00:00.000Z",
      revisionId: "rev_fixture",
    },
    captureTarget: { type: "document" },
    compatibility: {
      writerVersion: "1.0.0",
      minReaderVersion: "1.0.0",
      capabilities,
    },
    features: {
      required: ["source-graph", "render-tree", "precise-geometry"],
      optional: ["stable-identity"],
    },
    payloads,
  };
  return (await packageWtf(input)).bytes;
}

async function repack(
  bytes: Uint8Array,
  transform: (path: string, data: Uint8Array) => Uint8Array = (_path, data) => data,
  extra: Array<{ path: string; bytes: Uint8Array }> = [],
): Promise<Uint8Array> {
  const archive = openSecureZip(bytes);
  const entries = [];
  for (const entry of archive.entries) {
    entries.push({
      path: entry.path,
      bytes: transform(entry.path, await archive.read(entry.path)),
    });
  }
  entries.push(...extra);
  return encodeDeterministicZip(entries);
}

function codes(error: unknown): string[] {
  return error instanceof WtfParserError ? error.issues.map((issue) => issue.code) : [];
}

describe("NODE-23 secure WTF parser", () => {
  it("parses a real deterministic .wtf and emits the NODE-22 preview handoff", async () => {
    const parsed = await parseWtfPackage(await fixture());
    expect(parsed.manifest.identity.documentId).toBe("doc_fixture");
    expect(parsed.preview).toMatchObject({
      sourceUrl: "https://example.test/fixture",
      title: "Parser Fixture",
      renderNodeCount: 1,
      assetCount: 1,
      stableSourceMappingCount: 1,
      tokenPolicy: "literal",
    });
    expect(parsed.preview.sectionOutline[0]?.name).toBe("Fixture Section");
    expect(parsed.sanitizedSvgPayloads.get(SVG_PATH)).toContain("<rect");
  });

  it("detects payload tampering even when ZIP CRC metadata is recomputed", async () => {
    const original = await fixture();
    const tampered = await repack(original, (path, data) => {
      if (path !== WTF_DEFAULT_ENTRYPOINTS.document) return data;
      const output = Uint8Array.from(data);
      output[output.byteLength - 2] = output[output.byteLength - 2] === 0x7d ? 0x20 : 0x7d;
      return output;
    });
    try {
      await parseWtfPackage(tampered);
      throw new Error("expected checksum rejection");
    } catch (error) {
      expect(codes(error)).toContain("WTF_PARSER_CHECKSUM_MISMATCH");
    }
  });

  it("rejects hidden archive entries that are absent from manifest inventory", async () => {
    const hidden = await repack(await fixture(), undefined, [
      { path: "hidden.bin", bytes: Uint8Array.from([1, 2, 3]) },
    ]);
    try {
      await parseWtfPackage(hidden);
      throw new Error("expected hidden-entry rejection");
    } catch (error) {
      expect(codes(error)).toContain("WTF_PARSER_CONTAINER_INVALID");
    }
  });

  it("rejects unsafe SVG after checksum integrity succeeds", async () => {
    await expect(
      parseWtfPackage(await fixture(`<svg><script>alert(1)</script></svg>`)),
    ).rejects.toThrow(/WTF_PARSER_SVG_UNSAFE/);
  });

  it("rejects required capabilities unknown to the reader", async () => {
    await expect(parseWtfPackage(await fixture(safeSvg, ["future-capability"]))).rejects.toThrow(
      /WTF_PARSER_COMPATIBILITY/,
    );
  });
});
