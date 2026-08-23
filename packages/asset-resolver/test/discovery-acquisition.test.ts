import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import { describe, expect, it, vi } from "vitest";
import {
  acquireAssetCandidates,
  decodeDataUrl,
  discoverAssetCandidates,
  extractCssUrls,
  sha256Hex,
} from "../src/index.js";

function snapshot(): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T05:30:00.000Z",
    url: "https://example.com/app/index.html",
    title: "Assets",
    rootCaptureNodeId: "doc:root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1200,
      viewportHeight: 800,
      scale: {
        context: { devicePixelRatio: 1 },
        browserPageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
        reasons: [],
      },
    },
    nodes: [
      {
        captureNodeId: "doc:root",
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["node:img", "node:card", "node:svg"],
        frameContext: { frameId: "root", url: "https://example.com/app/index.html" },
        source: {},
      },
      {
        captureNodeId: "node:img",
        kind: "element",
        relationships: { sourceParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root", url: "https://example.com/app/index.html" },
        source: {
          tagName: "img",
          sourceSelector: "#hero",
          attributes: { src: "images/hero-small.png", srcset: "images/hero-small.png 1x" },
        },
        geometry: { bounds: { x: 0, y: 0, width: 600, height: 300 } },
      },
      {
        captureNodeId: "node:card",
        kind: "element",
        relationships: { sourceParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root", url: "https://example.com/app/index.html" },
        source: { tagName: "div", sourceSelector: ".card" },
      },
      {
        captureNodeId: "node:svg",
        kind: "element",
        relationships: { sourceParentId: "doc:root" },
        childCaptureNodeIds: [],
        frameContext: { frameId: "root", url: "https://example.com/app/index.html" },
        source: { tagName: "svg", sourceSelector: "svg.logo" },
        geometry: { bounds: { x: 0, y: 0, width: 24, height: 24 } },
      },
    ],
    frames: [
      {
        context: { frameId: "root", url: "https://example.com/app/index.html" },
        rootCaptureNodeId: "doc:root",
        accessible: true,
      },
    ],
    scrollContainers: [],
    diagnostics: [],
  };
}

function cascade(): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "standard",
    cascade: {
      version: "1.0.0",
      nodes: [
        {
          sourceNodeId: "node:card",
          customProperties: {},
          traces: [
            {
              property: "background-image",
              computedValue: 'url("https://cdn.example.com/card@2x.webp")',
              candidates: [
                {
                  property: "background-image",
                  authoredValue: 'url("../images/card.webp")',
                  important: false,
                  inherited: false,
                  status: "winner",
                  sourceOrder: 1,
                  source: {
                    type: "stylesheet",
                    stylesheetRef: "https://example.com/css/site.css",
                    selector: ".card",
                    ruleIndex: 4,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    styles: [],
    tokens: { tokens: [], usages: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  };
}

describe("NODE-13 asset discovery", () => {
  it("prefers live currentSrc, preserves authored src, CSS provenance and inline SVG", () => {
    const result = discoverAssetCandidates({
      snapshot: snapshot(),
      cascade: cascade(),
      domEvidence: [
        {
          sourceNodeId: "node:img",
          frameId: "root",
          frameOrigin: "https://example.com",
          tagName: "img",
          authoredSrc: "images/hero-small.png",
          currentSrc: "https://cdn.example.com/hero-large.png",
          intrinsicWidth: 1600,
          intrinsicHeight: 800,
          displayWidth: 600,
          displayHeight: 300,
        },
        {
          sourceNodeId: "node:svg",
          frameId: "root",
          frameOrigin: "https://example.com",
          tagName: "svg",
          inlineSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>',
          displayWidth: 24,
          displayHeight: 24,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    const image = result.candidates.find((item) => item.provenance.sourceNodeId === "node:img");
    expect(image).toMatchObject({
      locator: "https://cdn.example.com/hero-large.png",
      currentSrc: "https://cdn.example.com/hero-large.png",
      authoredSrc: "images/hero-small.png",
      intrinsicWidth: 1600,
      provenance: {
        sourceType: "img",
        originalUrl: "images/hero-small.png",
      },
    });
    const css = result.candidates.find((item) => item.provenance.cssProperty === "background-image");
    expect(css).toMatchObject({
      locator: "https://cdn.example.com/card@2x.webp",
      authoredSrc: "../images/card.webp",
      provenance: {
        sourceType: "css-background",
        stylesheetRef: "https://example.com/css/site.css",
      },
    });
    const svg = result.candidates.find((item) => item.provenance.sourceType === "svg-inline");
    expect(svg?.inlineText).toContain("<svg");
  });

  it("extracts multiple CSS URLs without swallowing nested data-url parentheses", () => {
    expect(
      extractCssUrls(
        'image-set(url("a.png") 1x, url(data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%201%201%22%3E%3C/svg%3E) 2x)',
      ),
    ).toEqual(["a.png", "data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%201%201%22%3E%3C/svg%3E"]);
  });
});

describe("NODE-13 asset acquisition", () => {
  it("decodes data URLs and hashes bytes with SHA-256", async () => {
    expect(new TextDecoder().decode(decodeDataUrl("data:text/plain;base64,YWJj").bytes)).toBe("abc");
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("fetches one locator once while preserving multiple source references", async () => {
    const fetcher = vi.fn(async () => ({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
      mediaTypeHint: "image/png",
    }));
    const result = await acquireAssetCandidates(
      {
        candidates: [
          {
            acquisitionId: "a",
            locator: "https://example.com/a.png",
            provenance: { sourceType: "img", sourceNodeId: "node:a", sourceUrl: "https://example.com/a.png" },
          },
          {
            acquisitionId: "b",
            locator: "https://example.com/a.png",
            provenance: { sourceType: "css-background", sourceNodeId: "node:b", sourceUrl: "https://example.com/a.png" },
          },
        ],
        diagnostics: [],
      },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.resources).toHaveLength(2);
    expect(result.resources.map((item) => item.acquisitionId)).toEqual(["a", "b"]);
  });

  it("fails visibly when an asset exceeds the acquisition budget", async () => {
    const result = await acquireAssetCandidates(
      {
        candidates: [
          {
            acquisitionId: "huge",
            locator: "https://example.com/huge.png",
            provenance: { sourceType: "img", sourceUrl: "https://example.com/huge.png" },
          },
        ],
        diagnostics: [],
      },
      async () => ({ bytes: new Uint8Array(9) }),
      { maxAssetBytes: 8, maxAssets: 10, maxTotalBytes: 100 },
    );
    expect(result.resources).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ASSET_TOO_LARGE", acquisitionId: "huge" }),
    );
  });
});
