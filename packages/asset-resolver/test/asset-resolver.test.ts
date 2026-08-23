import { describe, expect, it } from "vitest";
import {
  buildAssetCapture,
  extensionForMediaType,
  isAssetCapture,
  sniffAssetMediaType,
  summarizeAssetCapture,
  toWtfAssetRecords,
  type AssetHasher,
} from "../src/index.js";

const hashBytes: AssetHasher = async (bytes) => {
  const marker = bytes[0] === 0x89 ? "a" : bytes[0] === 0x3c ? "b" : "c";
  return marker.repeat(64);
};

const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const svgBytes = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')];

describe("NODE-13 asset resolver", () => {
  it("sniffs common image and SVG media types from bytes", () => {
    expect(sniffAssetMediaType(Uint8Array.from(pngBytes))).toBe("image/png");
    expect(sniffAssetMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffAssetMediaType(Uint8Array.from(svgBytes))).toBe("image/svg+xml");
    expect(extensionForMediaType("image/svg+xml")).toBe("svg");
  });

  it("deduplicates identical bytes while preserving all provenance", async () => {
    const capture = await buildAssetCapture(
      {
        adapter: "standard",
        snapshotId: "snapshot:assets",
        acquisition: {
          diagnostics: [],
          resources: [
            {
              acquisitionId: "img:hero",
              bytes: pngBytes,
              mediaTypeHint: "image/png",
              currentSrc: "https://cdn.example/hero@2x.png",
              authoredSrc: "hero.png",
              intrinsicWidth: 1200,
              intrinsicHeight: 800,
              displayWidth: 600,
              displayHeight: 400,
              provenance: {
                sourceType: "picture",
                sourceNodeId: "node:hero",
                sourceUrl: "https://cdn.example/hero@2x.png",
                originalUrl: "hero.png",
                frameId: "root",
              },
            },
            {
              acquisitionId: "css:hero",
              bytes: pngBytes,
              mediaTypeHint: "image/png",
              provenance: {
                sourceType: "css-background",
                sourceNodeId: "node:card",
                sourceUrl: "https://cdn.example/hero@2x.png",
                cssProperty: "background-image",
                frameId: "root",
              },
            },
          ],
        },
      },
      hashBytes,
    );

    expect(capture.assets).toHaveLength(1);
    expect(capture.assets[0]?.record).toMatchObject({
      id: `asset:${"a".repeat(64)}`,
      kind: "image",
      mediaType: "image/png",
      embeddedPath: `assets/${"a".repeat(64)}.png`,
      currentSrc: "https://cdn.example/hero@2x.png",
      authoredSrc: "hero.png",
      intrinsicWidth: 1200,
      intrinsicHeight: 800,
    });
    expect(capture.assets[0]?.sourceNodeIds).toEqual(["node:card", "node:hero"]);
    expect(capture.assets[0]?.provenances.map((item) => item.sourceType)).toEqual([
      "css-background",
      "picture",
    ]);
    expect(summarizeAssetCapture(capture)).toMatchObject({
      assetCount: 1,
      referenceCount: 2,
      deduplicatedReferenceCount: 1,
    });
    expect(isAssetCapture(capture)).toBe(true);
    expect(toWtfAssetRecords(capture)).toHaveLength(1);
  });

  it("keeps SVG bytes editable as vector assets", async () => {
    const capture = await buildAssetCapture(
      {
        adapter: "cdp",
        snapshotId: "snapshot:svg",
        acquisition: {
          diagnostics: [],
          resources: [
            {
              acquisitionId: "svg:inline",
              bytes: svgBytes,
              provenance: {
                sourceType: "svg-inline",
                sourceNodeId: "node:logo",
              },
            },
          ],
        },
      },
      hashBytes,
    );
    expect(capture.assets[0]?.record).toMatchObject({
      kind: "svg",
      mediaType: "image/svg+xml",
      embeddedPath: `assets/${"b".repeat(64)}.svg`,
    });
  });

  it("records unsupported byte formats instead of inventing an image MIME", async () => {
    const capture = await buildAssetCapture(
      {
        adapter: "standard",
        snapshotId: "snapshot:bad",
        acquisition: {
          diagnostics: [],
          resources: [
            {
              acquisitionId: "unknown:1",
              bytes: [1, 2, 3, 4],
              provenance: { sourceType: "img", sourceNodeId: "node:bad" },
            },
          ],
        },
      },
      hashBytes,
    );
    expect(capture.assets).toEqual([]);
    expect(capture.diagnostics[0]?.code).toBe("ASSET_UNSUPPORTED_MEDIA_TYPE");
  });
});
