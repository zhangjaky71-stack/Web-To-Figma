import type { RawSnapshot } from "@w2f/capture-core";
import {
  buildPixelGroundTruth,
  planRasterTiles,
  type PixelGroundTruthCapture,
  type RasterHasher,
  type RasterReferenceInput,
  type RasterReferenceKind,
} from "@w2f/pixel-ground-truth";
import { describe, expect, it } from "vitest";
import { buildProfileCompliantWtfPackage } from "../src/runtime/profile-compliant-wtf-package.js";
import type { WtfPackageEvidence } from "../src/runtime/wtf-package-builder.js";

const hashBytes: RasterHasher = async (bytes) => {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

function snapshot(adapter: "standard" | "cdp"): RawSnapshot {
  return {
    version: "1.0.0",
    adapter,
    capturedAt: "2026-08-25T10:00:00.000Z",
    url: "https://example.com/profile-ground-truth",
    title: "Profile Ground Truth",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 100,
      viewportHeight: 100,
      scale: {
        context: { devicePixelRatio: 1 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
      layoutMetrics: {
        contentSize: { x: 0, y: 0, width: 100, height: 300 },
        layoutViewport: { pageX: 0, pageY: 0, clientWidth: 100, clientHeight: 100 },
        visualViewport: {
          offsetX: 0,
          offsetY: 0,
          pageX: 0,
          pageY: 0,
          clientWidth: 100,
          clientHeight: 100,
          scale: 1,
        },
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: [],
        frameContext: { frameId: "root" },
        source: {},
        geometry: { bounds: { x: 0, y: 0, width: 100, height: 300 } },
      },
    ],
    frames: [{ context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true }],
    scrollContainers: [],
    diagnostics: [],
  };
}

function reference(
  id: string,
  kind: RasterReferenceKind,
  bounds: { x: number; y: number; width: number; height: number },
  seed: number,
): RasterReferenceInput {
  return {
    id,
    kind,
    viewportId: "viewport:current",
    bounds,
    dpr: 1,
    tiles: planRasterTiles(id, bounds, 1, 64).map((plan, index) => ({
      ...plan,
      bytes: [0x89, 0x50, 0x4e, 0x47, seed, index],
      mediaType: "image/png",
    })),
  };
}

async function pixelCapture(
  adapter: "standard" | "cdp",
  includeFullPage: boolean,
): Promise<PixelGroundTruthCapture> {
  const references = [
    reference("viewport:current", "viewport", { x: 0, y: 0, width: 100, height: 100 }, 1),
  ];
  if (includeFullPage) {
    references.push(
      reference("full-page:current", "full-page", { x: 0, y: 0, width: 100, height: 300 }, 2),
    );
  }
  return buildPixelGroundTruth(
    {
      adapter,
      snapshotId: "snapshot:2026-08-25T10:00:00.000Z",
      tileSizePx: 64,
      references,
    },
    hashBytes,
  );
}

function evidence(adapter: "standard" | "cdp", pixel: PixelGroundTruthCapture): WtfPackageEvidence {
  const raw = snapshot(adapter);
  return {
    jobId: `job-${adapter}`,
    snapshot: raw,
    css: {
      version: "1.0.0",
      adapter: "browser-cssom",
      snapshotId: `snapshot:${raw.capturedAt}`,
      styles: [],
      cascade: { nodes: [] },
      tokens: { tokens: [], usages: [] },
      unresolvedTokenUsages: [],
      diagnostics: [],
    },
    environment: {
      version: "1.0.0",
      adapter: "browser-runtime",
      snapshotId: `snapshot:${raw.capturedAt}`,
      environment: {
        browserName: "Chrome",
        browserVersion: "151",
        platform: "Linux",
        language: "en-US",
        direction: "ltr",
        colorScheme: "light",
        reducedMotion: false,
        viewportWidth: 100,
        viewportHeight: 100,
        dpr: 1,
        pageZoom: 1,
      },
      mediaRules: [],
      containers: [],
      containerQueries: [],
      diagnostics: [],
    },
    assets: {
      version: "1.0.0",
      adapter: "browser-runtime",
      snapshotId: `snapshot:${raw.capturedAt}`,
      assets: [],
      diagnostics: [],
    },
    pixel,
    compositing: {
      version: "1.0.0",
      tree: { rootId: "render:root", nodes: [] },
      boundaries: [],
      decisions: [],
      diagnostics: [],
    },
  } as unknown as WtfPackageEvidence;
}

function referenceIndex(result: Awaited<ReturnType<typeof buildProfileCompliantWtfPackage>>) {
  const entry = result.entries.find((item) => item.path === "references/index.json");
  expect(entry).toBeDefined();
  return JSON.parse(new TextDecoder().decode(entry!.bytes)) as {
    references: Array<{ id: string; kind: string }>;
  };
}

describe("profile-compliant .wtf Pixel Ground Truth export", () => {
  it("packages required viewport ground truth for the standard profile", async () => {
    const pixel = await pixelCapture("standard", false);
    const result = await buildProfileCompliantWtfPackage(evidence("standard", pixel));

    expect(result.manifest.entrypoints.referenceTiles).toBe("references/index.json");
    expect(result.manifest.compatibility.capabilities).toContain("pixel-ground-truth");
    expect(result.manifest.compatibility.capabilities).toContain("raster-tiles");
    expect(result.files.filter((file) => file.role === "reference-tile")).toHaveLength(
      pixel.tileResources.length,
    );
    expect(referenceIndex(result).references.map((item) => item.kind)).toEqual(["viewport"]);
  });

  it("packages viewport and full-page ground truth for a High Fidelity document", async () => {
    const pixel = await pixelCapture("cdp", true);
    const result = await buildProfileCompliantWtfPackage(evidence("cdp", pixel));
    const index = referenceIndex(result);

    expect(index.references.map((item) => item.kind).sort()).toEqual(["full-page", "viewport"]);
    expect(result.files.filter((file) => file.role === "reference-tile")).toHaveLength(
      pixel.tileResources.length,
    );
  });

  it("fails closed when a High Fidelity document has no full-page reference", async () => {
    const pixel = await pixelCapture("cdp", false);
    await expect(buildProfileCompliantWtfPackage(evidence("cdp", pixel))).rejects.toThrow(
      /requires full-page reference full-page:current/,
    );
  });

  it("fails closed when a required reference tile resource is missing", async () => {
    const pixel = await pixelCapture("standard", false);
    pixel.tileResources = pixel.tileResources.slice(1);
    await expect(buildProfileCompliantWtfPackage(evidence("standard", pixel))).rejects.toThrow(
      /has no resource/,
    );
  });
});
