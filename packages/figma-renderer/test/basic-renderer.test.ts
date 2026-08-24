import { describe, expect, it } from "vitest";
import type { WtfRenderNode, WtfRenderTree, WtfSourceGraph } from "@w2f/w2f-ir";
import {
  W2F_IMPORTING_ROOT_NAME,
  W2F_PLUGIN_DATA_KEYS,
  W2fBasicRendererError,
  createBasicFigmaRenderPlan,
  renderBasicFigmaScene,
  type W2fBasicFigmaAdapter,
  type W2fBasicGeometry,
  type W2fBasicRendererInput,
} from "../src/index.js";

function renderNode(
  id: string,
  kind: WtfRenderNode["kind"],
  bounds: W2fBasicGeometry,
  childIds: string[],
  options: {
    parentId?: string;
    name?: string;
    sourceNodeIds?: string[];
    sourceStableIds?: string[];
  } = {},
): WtfRenderNode {
  return {
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    childIds,
    sourceNodeIds: options.sourceNodeIds ?? [`source-${id}`],
    sourceStableIds: options.sourceStableIds ?? [`stable-${id}`],
    kind,
    name: options.name ?? id,
    geometry: { bounds },
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
    renderStrategy: "native",
    renderDecision: { confidence: 1, reasons: ["fixture"] },
    revisionHashes: { geometryHash: `geometry-${id}`, hierarchyHash: `hierarchy-${id}` },
  };
}

function fixtureTree(): WtfRenderTree {
  return {
    rootId: "root",
    nodes: [
      renderNode(
        "root",
        "document",
        { x: 0.125, y: 0.25, width: 300.5, height: 200.25 },
        ["a", "b"],
        { name: "Fixture Document" },
      ),
      renderNode("a", "container", { x: 10.375, y: 20.75, width: 100.5, height: 100.25 }, ["c"], {
        parentId: "root",
        name: "Card",
      }),
      renderNode("c", "decoration", { x: 15.875, y: 26.5, width: 20.125, height: 20.25 }, [], {
        parentId: "a",
        name: "Badge",
      }),
      renderNode("b", "image", { x: 150.625, y: 20.75, width: 50.5, height: 50.25 }, [], {
        parentId: "root",
        name: "   ",
      }),
    ],
    sections: [
      { id: "section-a", renderNodeId: "a", name: "Card", childSectionIds: [] },
      { id: "section-b", renderNodeId: "b", name: "Image", childSectionIds: [] },
    ],
  };
}

function fixtureSourceGraph(): WtfSourceGraph {
  return {
    rootCaptureNodeId: "source-root",
    nodes: [
      {
        captureNodeId: "source-root",
        stableIdentity: { id: "stable-root", confidence: 1, evidence: ["fixture"] },
        kind: "document",
        relationships: {},
        childCaptureNodeIds: ["source-a", "source-b"],
        revisionHashes: { geometryHash: "source-root-geometry" },
      },
      {
        captureNodeId: "source-a",
        stableIdentity: { id: "stable-a", confidence: 1, evidence: ["fixture"] },
        kind: "element",
        relationships: { sourceParentId: "source-root" },
        childCaptureNodeIds: ["source-c"],
        tagName: "section",
        sourceSelector: ".card",
      },
      {
        captureNodeId: "source-b",
        stableIdentity: { id: "stable-b", confidence: 1, evidence: ["fixture"] },
        kind: "element",
        relationships: { sourceParentId: "source-root" },
        childCaptureNodeIds: [],
        tagName: "img",
        sourceSelector: ".cover",
      },
      {
        captureNodeId: "source-c",
        stableIdentity: { id: "stable-c", confidence: 1, evidence: ["fixture"] },
        kind: "element",
        relationships: { sourceParentId: "source-a" },
        childCaptureNodeIds: [],
        tagName: "span",
        sourceSelector: ".badge",
      },
    ],
    scrollContainers: [],
    revision: {
      documentId: "doc-1",
      captureId: "capture-1",
      revisionId: "revision-1",
      sourceFingerprint: "source-fingerprint-1",
      capturedAt: "2026-08-24T00:00:00.000Z",
    },
  };
}

function input(overrides: Partial<W2fBasicRendererInput> = {}): W2fBasicRendererInput {
  return {
    renderTree: fixtureTree(),
    sourceGraph: fixtureSourceGraph(),
    profile: "balanced",
    tokenPolicy: "literal",
    ...overrides,
  };
}

interface MockNode {
  id: string;
  type: "FRAME" | "RECTANGLE";
  name: string;
  geometry: W2fBasicGeometry | null;
  pluginData: Record<string, string>;
  children: MockNode[];
  removed: boolean;
}

class MockAdapter implements W2fBasicFigmaAdapter<MockNode> {
  readonly created: MockNode[] = [];
  readonly appendOrder: string[] = [];
  selection: MockNode[] = [];
  focused: MockNode[] = [];
  failOnAppend = -1;
  private nextId = 1;

  createFrame(): MockNode {
    return this.create("FRAME");
  }

  createRectangle(): MockNode {
    return this.create("RECTANGLE");
  }

  appendChild(parent: MockNode, child: MockNode): void {
    if (this.appendOrder.length === this.failOnAppend) throw new Error("injected append failure");
    parent.children.push(child);
    this.appendOrder.push(child.pluginData[W2F_PLUGIN_DATA_KEYS.nodeId] ?? child.id);
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

  setSelection(nodes: readonly MockNode[]): void {
    this.selection = [...nodes];
  }

  focusNodes(nodes: readonly MockNode[]): void {
    this.focused = [...nodes];
  }

  private create(type: MockNode["type"]): MockNode {
    const node: MockNode = {
      id: `figma-${this.nextId}`,
      type,
      name: "",
      geometry: null,
      pluginData: {},
      children: [],
      removed: false,
    };
    this.nextId += 1;
    this.created.push(node);
    return node;
  }
}

describe("NODE-25 Basic Figma Renderer", () => {
  it("converts absolute Render Tree geometry into parent-local Figma geometry without rounding", () => {
    const plan = createBasicFigmaRenderPlan(input());
    const a = plan.nodes.find((node) => node.renderNodeId === "a");
    const c = plan.nodes.find((node) => node.renderNodeId === "c");
    expect(a?.localGeometry).toEqual({ x: 10.25, y: 20.5, width: 100.5, height: 100.25 });
    expect(c?.localGeometry).toEqual({ x: 5.5, y: 5.75, width: 20.125, height: 20.25 });
    expect(plan.root.geometry).toEqual({ x: 0.125, y: 0.25, width: 300.5, height: 200.25 });
  });

  it("reconstructs root, hierarchy and sibling z-order deterministically", () => {
    const adapter = new MockAdapter();
    const result = renderBasicFigmaScene(adapter, input());
    expect(result.createdNodeCount).toBe(4);
    expect(result.mappedRenderNodeIds).toEqual(["root", "a", "c", "b"]);
    expect(result.root.name).toBe("Fixture Document");
    expect(
      result.root.children.map((child) => child.pluginData[W2F_PLUGIN_DATA_KEYS.nodeId]),
    ).toEqual(["a", "b"]);
    expect(result.root.children[0]?.children[0]?.pluginData[W2F_PLUGIN_DATA_KEYS.nodeId]).toBe("c");
    expect(adapter.appendOrder).toEqual(["a", "c", "b"]);
    expect(adapter.selection).toEqual([result.root]);
    expect(adapter.focused).toEqual([result.root]);
  });

  it("uses frame-like nodes for hierarchy and neutral rectangle-like leaves for basic placeholders", () => {
    const adapter = new MockAdapter();
    const result = renderBasicFigmaScene(adapter, input());
    expect(result.nodesByRenderNodeId.get("root")?.type).toBe("FRAME");
    expect(result.nodesByRenderNodeId.get("a")?.type).toBe("FRAME");
    expect(result.nodesByRenderNodeId.get("c")?.type).toBe("RECTANGLE");
    expect(result.nodesByRenderNodeId.get("b")?.type).toBe("RECTANGLE");
    expect(result.nodesByRenderNodeId.get("b")?.name).toBe("image · b");
  });

  it("preserves compact stable-source, revision and source metadata in pluginData", () => {
    const adapter = new MockAdapter();
    const result = renderBasicFigmaScene(adapter, input({ profile: "high-fidelity" }));
    const card = result.nodesByRenderNodeId.get("a");
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.sourceStableIds]).toBe('["stable-a"]');
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.revisionHashes]).toContain("geometry-a");
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.sourceTag]).toBe("section");
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.sourceSelector]).toBe(".card");
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.renderProfile]).toBe("fidelity");
    expect(card?.pluginData[W2F_PLUGIN_DATA_KEYS.tokenPolicy]).toBe("literal");
    expect(result.root.pluginData[W2F_PLUGIN_DATA_KEYS.documentId]).toBe("doc-1");
    expect(result.root.pluginData[W2F_PLUGIN_DATA_KEYS.revisionId]).toBe("revision-1");
    expect(result.root.pluginData[W2F_PLUGIN_DATA_KEYS.transactionState]).toBe("committed");
  });

  it("renders only selected subtrees and removes nested duplicate selections", () => {
    const plan = createBasicFigmaRenderPlan(
      input({ mode: "selected-roots", selectedRootIds: ["c", "a"] }),
    );
    expect(plan.selectedRootIds).toEqual(["a"]);
    expect(plan.nodes.map((node) => node.renderNodeId)).toEqual(["a", "c"]);
    expect(plan.root.sourceRenderNodeId).toBeUndefined();

    const adapter = new MockAdapter();
    const result = renderBasicFigmaScene(
      adapter,
      input({ mode: "selected-roots", selectedRootIds: ["a"] }),
    );
    expect(result.mappedRenderNodeIds).toEqual(["a", "c"]);
    expect(result.nodesByRenderNodeId.has("b")).toBe(false);
    expect(
      result.root.children.map((child) => child.pluginData[W2F_PLUGIN_DATA_KEYS.nodeId]),
    ).toEqual(["a"]);
  });

  it("positions a selected import at an explicit canvas destination while preserving local geometry", () => {
    const plan = createBasicFigmaRenderPlan(
      input({
        mode: "selected-roots",
        selectedRootIds: ["a"],
        destination: { x: 800.5, y: 420.25 },
      }),
    );
    expect(plan.root.geometry).toEqual({ x: 800.5, y: 420.25, width: 100.5, height: 100.25 });
    expect(plan.nodes[0]?.localGeometry).toEqual({ x: 0, y: 0, width: 100.5, height: 100.25 });
  });

  it("rolls back the temporary root if an adapter mutation fails", () => {
    const adapter = new MockAdapter();
    adapter.failOnAppend = 1;
    expect(() => renderBasicFigmaScene(adapter, input())).toThrowError(W2fBasicRendererError);
    expect(adapter.created[0]?.removed).toBe(true);
    expect(adapter.created[0]?.name).toBe(W2F_IMPORTING_ROOT_NAME);
  });

  it("rejects malformed trees before any adapter mutation", () => {
    const tree = fixtureTree();
    const a = tree.nodes.find((node) => node.id === "a");
    if (!a) throw new Error("fixture missing a");
    a.childIds.push("root");
    expect(() => createBasicFigmaRenderPlan(input({ renderTree: tree }))).toThrowError(
      /Cycle detected|referenced more than once/,
    );
  });

  it("produces the same plan for the same validated input", () => {
    const first = createBasicFigmaRenderPlan(input());
    const second = createBasicFigmaRenderPlan(input());
    expect(second).toEqual(first);
  });
});
