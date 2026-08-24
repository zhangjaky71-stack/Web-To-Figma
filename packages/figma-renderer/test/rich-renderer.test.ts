import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";
import {
  renderRichFigmaScene,
  resolveFontRequest,
  type W2fAvailableFont,
  type W2fBasicGeometry,
  type W2fFontResolution,
  type W2fPaintRenderPlan,
  type W2fRichFigmaAdapter,
  type W2fTextRenderPlan,
  type W2fValidatedAssetPayload,
} from "../src/index.js";

type MockImage = { key: string };
type MockNode = {
  type: "FRAME" | "RECTANGLE" | "TEXT" | "SVG";
  name: string;
  geometry?: W2fBasicGeometry;
  pluginData: Record<string, string>;
  children: MockNode[];
  removed: boolean;
  characters?: string;
  paintPlan?: W2fPaintRenderPlan;
};

function sourceGraph(): WtfSourceGraph {
  return {
    rootCaptureNodeId: "source-root",
    revision: {
      documentId: "doc-1",
      captureId: "capture-1",
      revisionId: "revision-1",
      sourceFingerprint: "source-fingerprint-1",
      capturedAt: "2026-08-24T00:00:00.000Z",
    },
    nodes: [],
    scrollContainers: [],
  };
}

function baseNode(
  id: string,
  kind: WtfRenderNode["kind"],
  parentId: string | undefined,
  childIds: string[],
  x: number,
): WtfRenderNode {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    childIds,
    sourceNodeIds: [`source-${id}`],
    sourceStableIds: [`stable-${id}`],
    kind,
    name: id,
    geometry: { bounds: { x, y: 0, width: 100, height: 40 } },
    layout: {
      mode: kind === "text" ? "inline" : "flow",
      display: kind === "text" ? "inline" : "block",
      position: "static",
      sizing: {
        width: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
        height: { mode: "fixed", confidence: 1, reasons: ["fixture"] },
      },
      decision: { confidence: 1, reasons: ["fixture"] },
    },
    paint: { fills: [], opacity: 1 },
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
    revisionHashes: { contentHash: `content-${id}` },
  };
}

function documentTree(children: WtfRenderNode[]): WtfRenderTree {
  const root = baseNode("root", "document", undefined, children.map((child) => child.id), 0);
  root.geometry.bounds = { x: 0, y: 0, width: 800, height: 600 };
  return { rootId: root.id, nodes: [root, ...children], sections: [] };
}

function textNode(id = "text-1"): WtfRenderNode {
  const node = baseNode(id, "text", "root", [], 10);
  node.text = {
    value: "Hello World",
    fragments: [],
    runs: [
      {
        start: 0,
        end: 6,
        text: "Hello ",
        font: { family: "Inter", style: "normal", weight: 400 },
        fontSize: 18,
      },
      {
        start: 6,
        end: 11,
        text: "World",
        font: { family: "Inter", style: "normal", weight: 700 },
        fontSize: 18,
      },
    ],
  };
  return node;
}

function imageNode(id: string, assetId: string, x: number): WtfRenderNode {
  const node = baseNode(id, "image", "root", [], x);
  node.assetRefs = [assetId];
  node.paint = {
    fills: [{ type: "image", assetId, fit: "cover" }],
    opacity: 1,
  };
  return node;
}

function vectorNode(assetId: string): WtfRenderNode {
  const node = baseNode("vector-1", "vector", "root", [], 130);
  node.assetRefs = [assetId];
  return node;
}

function asset(
  id: string,
  mediaType: string,
  overrides: Partial<W2fValidatedAssetPayload> = {},
): W2fValidatedAssetPayload {
  return {
    id,
    kind: mediaType === "image/svg+xml" ? "svg" : "image",
    mediaType,
    cacheKey: id,
    ...overrides,
  };
}

class MockAdapter implements W2fRichFigmaAdapter<MockNode, MockImage> {
  availableFonts: W2fAvailableFont[] = [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
  ];
  readonly nodes: MockNode[] = [];
  readonly loadedFonts: string[] = [];
  readonly preparedAssets: string[] = [];
  readonly svgStrings: string[] = [];
  failPaintForName: string | null = null;

  private create(type: MockNode["type"]): MockNode {
    const node: MockNode = {
      type,
      name: "",
      pluginData: {},
      children: [],
      removed: false,
    };
    this.nodes.push(node);
    return node;
  }

  createFrame(): MockNode {
    return this.create("FRAME");
  }
  createRectangle(): MockNode {
    return this.create("RECTANGLE");
  }
  createText(): MockNode {
    return this.create("TEXT");
  }
  createSvg(sanitizedSvg: string): MockNode {
    this.svgStrings.push(sanitizedSvg);
    return this.create("SVG");
  }
  appendChild(parent: MockNode, child: MockNode): void {
    parent.children.push(child);
  }
  setName(node: MockNode, name: string): void {
    node.name = name;
  }
  setGeometry(node: MockNode, geometry: W2fBasicGeometry): void {
    node.geometry = { ...geometry };
  }
  setPluginData(node: MockNode, key: string, value: string): void {
    node.pluginData[key] = value;
  }
  remove(node: MockNode): void {
    node.removed = true;
  }
  async listAvailableFonts(): Promise<readonly W2fAvailableFont[]> {
    return this.availableFonts;
  }
  async loadFont(font: W2fAvailableFont): Promise<void> {
    this.loadedFonts.push(`${font.family}\u0000${font.style}`);
  }
  prepareImage(payload: W2fValidatedAssetPayload): MockImage {
    this.preparedAssets.push(payload.id);
    return { key: payload.cacheKey };
  }
  applyText(
    node: MockNode,
    plan: W2fTextRenderPlan,
    resolutions: ReadonlyMap<string, W2fFontResolution>,
  ): void {
    for (const range of plan.ranges) {
      if (!resolutions.has(range.font.key)) throw new Error("missing font resolution");
    }
    node.characters = plan.characters;
  }
  applyPaint(
    node: MockNode,
    plan: W2fPaintRenderPlan,
    imagesByAssetId: ReadonlyMap<string, MockImage>,
  ): void {
    for (const fill of plan.fills) {
      if (fill.kind === "IMAGE" && !imagesByAssetId.has(fill.assetId)) {
        throw new Error(`missing prepared image ${fill.assetId}`);
      }
    }
    if (this.failPaintForName === node.name) throw new Error("injected paint failure");
    node.paintPlan = plan;
  }
}

function input(renderTree: WtfRenderTree, assets: W2fValidatedAssetPayload[] = []) {
  return {
    renderTree,
    sourceGraph: sourceGraph(),
    profile: "balanced" as const,
    tokenPolicy: "literal" as const,
    assets,
  };
}

describe("NODE-26 font resolution", () => {
  it("uses exact fonts at Level A and same-family style mapping at Level B", () => {
    const exact = resolveFontRequest(
      { family: "Inter", candidateStyle: "Regular", key: "regular", weight: 400 },
      [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
      ],
    );
    const mapped = resolveFontRequest(
      { family: "Inter", candidateStyle: "Bold", key: "bold", weight: 700 },
      [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
      ],
    );
    expect(exact.level).toBe("A");
    expect(mapped).toMatchObject({ level: "B", resolvedFamily: "Inter", resolvedStyle: "Medium" });
  });

  it("never crosses font families for an unavailable request", () => {
    const result = resolveFontRequest(
      { family: "Brand Sans", candidateStyle: "Regular", key: "brand", weight: 400 },
      [{ family: "Inter", style: "Regular" }],
    );
    expect(result).toMatchObject({ level: "C", routeToHybridFallback: true });
  });
});

describe("NODE-26 rich transaction", () => {
  it("renders editable text, reports same-family substitution and dedupes validated image bytes", async () => {
    const first = imageNode("image-1", "asset-a", 150);
    const second = imageNode("image-2", "asset-b", 270);
    const adapter = new MockAdapter();
    const result = await renderRichFigmaScene(
      input(documentTree([textNode(), first, second]), [
        asset("asset-a", "image/png", {
          cacheKey: "same-sha",
          bytes: new Uint8Array([137, 80, 78, 71]),
          width: 100,
          height: 100,
        }),
        asset("asset-b", "image/png", {
          cacheKey: "same-sha",
          bytes: new Uint8Array([137, 80, 78, 71]),
          width: 100,
          height: 100,
        }),
      ]),
      adapter,
    );
    expect(result.committed).toBe(true);
    expect(result.fontSubstitutionCount).toBe(1);
    expect(result.preparedImageCount).toBe(1);
    expect(adapter.preparedAssets).toHaveLength(1);
    expect(adapter.nodes.find((node) => node.type === "TEXT")?.characters).toBe("Hello World");
    expect(adapter.loadedFonts).toEqual(["Inter\u0000Regular", "Inter\u0000Medium"]);
  });

  it("fails before any scene mutation when a font family is unavailable", async () => {
    const adapter = new MockAdapter();
    adapter.availableFonts = [{ family: "Roboto", style: "Regular" }];
    await expect(renderRichFigmaScene(input(documentTree([textNode()])), adapter)).rejects.toMatchObject({
      code: "W2F_RENDERER_FONT_UNAVAILABLE",
    });
    expect(adapter.nodes).toHaveLength(0);
  });

  it("rejects oversized images instead of silently downscaling them", async () => {
    const adapter = new MockAdapter();
    await expect(
      renderRichFigmaScene(
        input(documentTree([imageNode("image-1", "huge", 10)]), [
          asset("huge", "image/png", {
            bytes: new Uint8Array([137, 80, 78, 71]),
            width: 5000,
            height: 3000,
          }),
        ]),
        adapter,
      ),
    ).rejects.toMatchObject({ code: "W2F_RENDERER_IMAGE_TILE_REQUIRED" });
    expect(adapter.nodes).toHaveLength(0);
  });

  it("imports vectors only from the NODE-23 sanitized SVG payload", async () => {
    const adapter = new MockAdapter();
    const svg = "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0h10v10z\"/></svg>";
    const result = await renderRichFigmaScene(
      input(documentTree([vectorNode("icon")]), [
        asset("icon", "image/svg+xml", { sanitizedSvg: svg }),
      ]),
      adapter,
    );
    expect(result.svgNodeCount).toBe(1);
    expect(adapter.svgStrings).toEqual([svg]);
  });

  it("rejects a vector when sanitized SVG evidence is missing", async () => {
    const adapter = new MockAdapter();
    await expect(
      renderRichFigmaScene(
        input(documentTree([vectorNode("icon")]), [asset("icon", "image/svg+xml")]),
        adapter,
      ),
    ).rejects.toMatchObject({ code: "W2F_RENDERER_SVG_UNAVAILABLE" });
    expect(adapter.nodes).toHaveLength(0);
  });

  it("removes every created scene node after an injected rich-adapter failure", async () => {
    const adapter = new MockAdapter();
    const decoration = baseNode("boom", "decoration", "root", [], 260);
    adapter.failPaintForName = "boom";
    await expect(
      renderRichFigmaScene(
        input(documentTree([vectorNode("icon"), decoration]), [
          asset("icon", "image/svg+xml", { sanitizedSvg: "<svg viewBox=\"0 0 1 1\"></svg>" }),
        ]),
        adapter,
      ),
    ).rejects.toMatchObject({ code: "W2F_RENDERER_RICH_ADAPTER" });
    expect(adapter.nodes.length).toBeGreaterThan(1);
    expect(adapter.nodes.every((node) => node.removed)).toBe(true);
  });
});
