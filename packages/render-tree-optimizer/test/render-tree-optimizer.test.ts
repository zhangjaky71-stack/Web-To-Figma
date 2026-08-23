import { describe, expect, it } from "vitest";
import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture, CssCascadePropertyTrace } from "@w2f/css-cascade";
import type { BaseLayoutAnalysis, BaseLayoutNodeAnalysis } from "@w2f/layout-analyzer";
import type { TableLayoutResult } from "@w2f/table-layout-engine";
import type { WtfLayoutModel } from "@w2f/w2f-ir";
import { optimizeRenderTree, summarizeRenderTreeOptimization } from "../src/index.js";

function layoutModel(mode: WtfLayoutModel["mode"] = "flow", overrides: Partial<WtfLayoutModel> = {}): WtfLayoutModel {
  return {
    mode,
    display: mode === "flex" ? "flex" : mode === "grid" ? "grid" : mode === "contents" ? "contents" : "block",
    position: "static",
    sizing: {
      width: { mode: "unknown", confidence: 0.5, reasons: ["fixture"] },
      height: { mode: "unknown", confidence: 0.5, reasons: ["fixture"] },
    },
    decision: { confidence: 0.9, reasons: ["fixture"] },
    ...overrides,
  };
}

function layout(nodes: Array<[string, WtfLayoutModel]>): BaseLayoutAnalysis {
  return {
    version: "1.0.0",
    nodes: nodes.map(([sourceNodeId, model]): BaseLayoutNodeAnalysis => ({
      sourceNodeId,
      layout: model,
      diagnostics: [],
    })),
    diagnostics: [],
  };
}

function rawNode(
  captureNodeId: string,
  kind: RawNode["kind"],
  tagName: string | undefined,
  childCaptureNodeIds: string[],
  bounds: { x: number; y: number; width: number; height: number },
  options: {
    sourceParentId?: string;
    composedParentId?: string;
    role?: string;
    attributes?: Record<string, string>;
    text?: string;
    display?: string;
  } = {},
): RawNode {
  return {
    captureNodeId,
    kind,
    relationships: {
      ...(options.sourceParentId ? { sourceParentId: options.sourceParentId } : {}),
      ...(options.composedParentId ? { composedParentId: options.composedParentId } : {}),
    },
    childCaptureNodeIds,
    frameContext: {} as RawNode["frameContext"],
    source: {
      ...(tagName ? { tagName } : {}),
      ...(options.role ? { role: options.role } : {}),
      ...(options.attributes ? { attributes: options.attributes } : {}),
    },
    geometry: { bounds },
    visibility: {
      display: options.display ?? (kind === "text" ? "inline" : "block"),
      visibility: "visible",
      opacity: 1,
      hiddenAttribute: false,
      rendered: true,
    },
    ...(options.text ? { textContent: options.text } : {}),
  };
}

function snapshot(nodes: RawNode[], rootCaptureNodeId = "root"): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T00:00:00.000Z",
    url: "https://example.test/page",
    title: "Fixture",
    rootCaptureNodeId,
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1200,
      viewportHeight: 900,
      scale: {} as RawSnapshot["environment"]["scale"],
    },
    nodes,
    frames: [],
    scrollContainers: [],
    diagnostics: [],
  };
}

function propertyTrace(property: string, computedValue: string, authoredValue?: string): CssCascadePropertyTrace {
  return {
    property,
    computedValue,
    candidates:
      authoredValue === undefined
        ? []
        : [
            {
              property,
              authoredValue,
              important: false,
              inherited: false,
              status: "winner",
              sourceOrder: 1,
              source: { type: "inline" },
            },
          ],
  };
}

function cascade(
  nodes: Record<string, Array<[property: string, computed: string, authored?: string]>> = {},
): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "standard",
    cascade: {
      version: "1.0.0",
      nodes: Object.entries(nodes).map(([sourceNodeId, definitions]) => ({
        sourceNodeId,
        traces: definitions.map(([property, computedValue, authoredValue]) =>
          propertyTrace(property, computedValue, authoredValue),
        ),
        customProperties: {},
      })),
    },
    styles: [],
    tokens: { tokens: [], usages: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  } as unknown as CssCascadeCapture;
}

function noTables(): TableLayoutResult {
  return { version: "1.0.0", tables: [], diagnostics: [] };
}

describe("Render Tree Optimizer", () => {
  it("folds only a provably meaningless single-child wrapper and preserves source mappings", async () => {
    const result = await optimizeRenderTree({
      snapshot: snapshot([
        rawNode("root", "document", undefined, ["wrapper"], { x: 0, y: 0, width: 1200, height: 900 }),
        rawNode("wrapper", "element", "div", ["hero"], { x: 0, y: 0, width: 1200, height: 400 }, { sourceParentId: "root" }),
        rawNode("hero", "element", "section", ["title", "body"], { x: 0, y: 0, width: 1200, height: 400 }, { sourceParentId: "wrapper", attributes: { id: "hero" } }),
        rawNode("title", "element", "h1", [], { x: 80, y: 80, width: 500, height: 60 }, { sourceParentId: "hero", text: "Hello" }),
        rawNode("body", "element", "p", [], { x: 80, y: 160, width: 500, height: 80 }, { sourceParentId: "hero", text: "World" }),
      ]),
      cascade: cascade(),
      layout: layout([
        ["root", layoutModel("flow")],
        ["wrapper", layoutModel("flow")],
        ["hero", layoutModel("flow")],
        ["title", layoutModel("flow")],
        ["body", layoutModel("flow")],
      ]),
      tables: noTables(),
    });

    expect(result.tree.nodes).toHaveLength(4);
    const heroRenderId = result.sourceToRenderNodeId.hero;
    expect(result.sourceToRenderNodeId.wrapper).toBe(heroRenderId);
    const hero = result.tree.nodes.find((node) => node.id === heroRenderId);
    expect(hero?.sourceNodeIds).toEqual(["wrapper", "hero"]);
    expect(hero?.kind).toBe("section");
    expect(result.tree.sections.some((section) => section.renderNodeId === heroRenderId)).toBe(true);
    expect(result.tree.nodes.find((node) => node.id === result.tree.rootId)?.childIds).toEqual([heroRenderId]);
  });

  it("prefers composed parent relationships over source parents", async () => {
    const result = await optimizeRenderTree({
      snapshot: snapshot([
        rawNode("root", "document", undefined, ["host", "light"], { x: 0, y: 0, width: 500, height: 500 }),
        rawNode("host", "element", "section", ["slot"], { x: 0, y: 0, width: 500, height: 300 }, { sourceParentId: "root" }),
        rawNode("slot", "slot", "slot", [], { x: 0, y: 0, width: 500, height: 300 }, { sourceParentId: "host" }),
        rawNode("light", "element", "button", [], { x: 10, y: 10, width: 100, height: 40 }, { sourceParentId: "root", composedParentId: "host" }),
      ]),
      cascade: cascade(),
      layout: layout([
        ["root", layoutModel("flow")],
        ["host", layoutModel("flow")],
        ["slot", layoutModel("flow")],
        ["light", layoutModel("flow")],
      ]),
      tables: noTables(),
    });
    const hostId = result.sourceToRenderNodeId.host;
    const lightId = result.sourceToRenderNodeId.light;
    expect(result.tree.nodes.find((node) => node.id === lightId)?.parentId).toBe(hostId);
  });

  it("fails closed and preserves wrappers with paint, clipping, positioning or flex responsibility", async () => {
    const result = await optimizeRenderTree({
      snapshot: snapshot([
        rawNode("root", "document", undefined, ["paint", "clip", "positioned", "flex"], { x: 0, y: 0, width: 1000, height: 800 }),
        rawNode("paint", "element", "div", ["paint-child"], { x: 0, y: 0, width: 200, height: 100 }, { sourceParentId: "root" }),
        rawNode("paint-child", "element", "span", [], { x: 0, y: 0, width: 200, height: 100 }, { sourceParentId: "paint" }),
        rawNode("clip", "element", "div", ["clip-child"], { x: 0, y: 120, width: 200, height: 100 }, { sourceParentId: "root" }),
        rawNode("clip-child", "element", "span", [], { x: 0, y: 120, width: 200, height: 100 }, { sourceParentId: "clip" }),
        rawNode("positioned", "element", "div", ["position-child"], { x: 0, y: 240, width: 200, height: 100 }, { sourceParentId: "root" }),
        rawNode("position-child", "element", "span", [], { x: 0, y: 240, width: 200, height: 100 }, { sourceParentId: "positioned" }),
        rawNode("flex", "element", "div", ["flex-child"], { x: 0, y: 360, width: 200, height: 100 }, { sourceParentId: "root" }),
        rawNode("flex-child", "element", "span", [], { x: 0, y: 360, width: 200, height: 100 }, { sourceParentId: "flex" }),
      ]),
      cascade: cascade({ paint: [["background-color", "rgb(0, 0, 0)", "#000"]] }),
      layout: layout([
        ["root", layoutModel("flow")],
        ["paint", layoutModel("flow")],
        ["paint-child", layoutModel("flow")],
        ["clip", layoutModel("flow", { overflowX: "hidden", overflowY: "hidden" })],
        ["clip-child", layoutModel("flow")],
        ["positioned", layoutModel("flow", { position: "relative" })],
        ["position-child", layoutModel("flow")],
        ["flex", layoutModel("flex", { flexContainer: { direction: "row", wrap: "nowrap", justifyContent: "flex-start", alignItems: "stretch" } })],
        ["flex-child", layoutModel("flow")],
      ]),
      tables: noTables(),
    });

    for (const sourceId of ["paint", "clip", "positioned", "flex"]) {
      expect(result.sourceToRenderNodeId[sourceId]).not.toBe(result.sourceToRenderNodeId[`${sourceId === "positioned" ? "position" : sourceId}-child`]);
    }
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "RENDER_TREE_WRAPPER_PRESERVED").length).toBeGreaterThanOrEqual(4);
  });

  it("groups repeated structural fingerprints without depending on text content", async () => {
    const result = await optimizeRenderTree({
      snapshot: snapshot([
        rawNode("root", "document", undefined, ["card-a", "card-b"], { x: 0, y: 0, width: 800, height: 600 }),
        rawNode("card-a", "element", "div", ["text-a"], { x: 20, y: 20, width: 300, height: 160 }, { sourceParentId: "root", role: "group" }),
        rawNode("text-a", "text", undefined, [], { x: 40, y: 40, width: 200, height: 40 }, { sourceParentId: "card-a", text: "Alpha" }),
        rawNode("card-b", "element", "div", ["text-b"], { x: 20, y: 220, width: 300, height: 160 }, { sourceParentId: "root", role: "group" }),
        rawNode("text-b", "text", undefined, [], { x: 40, y: 240, width: 200, height: 40 }, { sourceParentId: "card-b", text: "Beta" }),
      ]),
      cascade: cascade(),
      layout: layout([
        ["root", layoutModel("flow")],
        ["card-a", layoutModel("flow")],
        ["text-a", layoutModel("inline")],
        ["card-b", layoutModel("flow")],
        ["text-b", layoutModel("inline")],
      ]),
      tables: noTables(),
    });
    const a = result.tree.nodes.find((node) => node.id === result.sourceToRenderNodeId["card-a"]);
    const b = result.tree.nodes.find((node) => node.id === result.sourceToRenderNodeId["card-b"]);
    expect(a?.componentCandidate?.groupId).toBeTruthy();
    expect(a?.componentCandidate?.groupId).toBe(b?.componentCandidate?.groupId);
    expect(a?.componentCandidate?.fingerprint.combinedHash).toBe(b?.componentCandidate?.fingerprint.combinedHash);
    expect(a?.revisionHashes?.contentHash).not.toBe(b?.revisionHashes?.contentHash);
    expect(summarizeRenderTreeOptimization(result)).toMatchObject({
      sourceNodeCount: 5,
      renderNodeCount: 5,
      componentCandidateCount: 2,
      componentCandidateGroupCount: 1,
    });
  });

  it("is deterministic across repeated optimization", async () => {
    const input = {
      snapshot: snapshot([
        rawNode("root", "document", undefined, ["main"], { x: 0, y: 0, width: 800, height: 600 }),
        rawNode("main", "element", "main", [], { x: 0, y: 0, width: 800, height: 600 }, { sourceParentId: "root" }),
      ]),
      cascade: cascade(),
      layout: layout([["root", layoutModel("flow")], ["main", layoutModel("flow")]]),
      tables: noTables(),
    };
    const first = await optimizeRenderTree(input);
    const second = await optimizeRenderTree(input);
    expect(second).toEqual(first);
  });
});
