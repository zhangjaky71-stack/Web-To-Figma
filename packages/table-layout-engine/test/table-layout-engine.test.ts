import { describe, expect, it } from "vitest";
import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture, CssCascadePropertyTrace } from "@w2f/css-cascade";
import { analyzeTableLayout, summarizeTableLayout } from "../src/index.js";

function rawNode(
  captureNodeId: string,
  tagName: string,
  childCaptureNodeIds: string[] = [],
  attributes: Record<string, string> = {},
  bounds?: { x: number; y: number; width: number; height: number },
): RawNode {
  return {
    captureNodeId,
    kind: "element",
    relationships: {} as RawNode["relationships"],
    childCaptureNodeIds,
    frameContext: {} as RawNode["frameContext"],
    source: { tagName, attributes },
    ...(bounds ? { geometry: { bounds } } : {}),
    visibility: {
      display: tagName === "table" ? "table" : "block",
      visibility: "visible",
      opacity: 1,
      hiddenAttribute: false,
      rendered: true,
    },
  };
}

function snapshot(nodes: RawNode[]): RawSnapshot {
  return {
    version: "1.0.0",
    adapter: "standard",
    capturedAt: "2026-08-23T00:00:00.000Z",
    url: "https://example.test/table",
    title: "table fixture",
    rootCaptureNodeId: nodes[0]?.captureNodeId ?? "root",
    captureTarget: { type: "document" },
    environment: {
      viewportWidth: 1440,
      viewportHeight: 900,
      scale: {} as RawSnapshot["environment"]["scale"],
    },
    nodes,
    frames: [],
    scrollContainers: [],
    diagnostics: [],
  };
}

function trace(property: string, computedValue: string, authoredValue?: string): CssCascadePropertyTrace {
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
  nodes: Record<string, Array<[property: string, computed: string, authored?: string]>>,
): CssCascadeCapture {
  return {
    version: "1.0.0",
    adapter: "standard",
    cascade: {
      version: "1.0.0",
      nodes: Object.entries(nodes).map(([sourceNodeId, definitions]) => ({
        sourceNodeId,
        traces: definitions.map(([property, computedValue, authoredValue]) =>
          trace(property, computedValue, authoredValue),
        ),
        customProperties: {},
      })),
    },
    styles: [],
    tokens: { version: "1.0.0", definitions: [], usages: [], aliases: [] },
    unresolvedTokenUsages: [],
    diagnostics: [],
  } as unknown as CssCascadeCapture;
}

describe("Table Layout Engine", () => {
  it("reconstructs row groups, cells, occupancy, tracks and table CSS semantics", () => {
    const result = analyzeTableLayout({
      snapshot: snapshot([
        rawNode("table", "table", ["caption", "thead", "tbody"], {}, { x: 10, y: 10, width: 300, height: 150 }),
        rawNode("caption", "caption", [], {}, { x: 10, y: 10, width: 300, height: 20 }),
        rawNode("thead", "thead", ["r0"], {}, { x: 10, y: 30, width: 300, height: 40 }),
        rawNode("r0", "tr", ["h0", "h1"], {}, { x: 10, y: 30, width: 300, height: 40 }),
        rawNode("h0", "th", [], { scope: "col" }, { x: 10, y: 30, width: 100, height: 40 }),
        rawNode("h1", "th", [], { colspan: "2", scope: "colgroup" }, { x: 110, y: 30, width: 200, height: 40 }),
        rawNode("tbody", "tbody", ["r1", "r2"], {}, { x: 10, y: 70, width: 300, height: 90 }),
        rawNode("r1", "tr", ["a", "b", "c"], {}, { x: 10, y: 70, width: 300, height: 45 }),
        rawNode("a", "td", [], { rowspan: "2" }, { x: 10, y: 70, width: 100, height: 90 }),
        rawNode("b", "td", [], {}, { x: 110, y: 70, width: 100, height: 45 }),
        rawNode("c", "td", [], {}, { x: 210, y: 70, width: 100, height: 45 }),
        rawNode("r2", "tr", ["d", "e"], {}, { x: 10, y: 115, width: 300, height: 45 }),
        rawNode("d", "td", [], { headers: "h1" }, { x: 110, y: 115, width: 100, height: 45 }),
        rawNode("e", "td", [], {}, { x: 210, y: 115, width: 100, height: 45 }),
      ]),
      cascade: cascade({
        table: [
          ["border-collapse", "collapse", "collapse"],
          ["border-spacing", "0px 0px", "0"],
          ["table-layout", "fixed", "fixed"],
        ],
        caption: [["caption-side", "top", "top"]],
      }),
    });

    const table = result.tables[0];
    expect(table?.rowCount).toBe(3);
    expect(table?.columnCount).toBe(3);
    expect(table?.rowGroups.map((group) => group.kind)).toEqual(["header", "body"]);
    expect(table?.caption).toMatchObject({ sourceNodeId: "caption", side: "top" });
    expect(table?.borderCollapse).toBe("collapse");
    expect(table?.borderSpacing).toMatchObject({ horizontal: 0, vertical: 0, authored: "0" });
    expect(table?.tableLayout).toBe("fixed");
    expect(table?.strategyHint).toBe("span-hybrid");

    const header = table?.cells.find((cell) => cell.sourceNodeId === "h1");
    const spanning = table?.cells.find((cell) => cell.sourceNodeId === "a");
    const d = table?.cells.find((cell) => cell.sourceNodeId === "d");
    expect(header).toMatchObject({ rowIndex: 0, columnIndex: 1, rowSpan: 1, columnSpan: 2, columnEnd: 3 });
    expect(spanning).toMatchObject({ rowIndex: 1, columnIndex: 0, rowSpan: 2, columnSpan: 1, rowEnd: 3 });
    expect(d).toMatchObject({ rowIndex: 2, columnIndex: 1, headers: ["h1"] });
    expect(table?.occupancy).toHaveLength(9);
    expect(table?.occupancy.find((slot) => slot.rowIndex === 2 && slot.columnIndex === 0)).toMatchObject({
      sourceCellId: "a",
      origin: false,
    });
    expect(table?.columnTracks.map((track) => track.resolvedWidth)).toEqual([100, 100, 100]);
    expect(table?.rowTracks.map((track) => track.resolvedHeight)).toEqual([40, 45, 45]);
  });

  it("treats rowspan=0 as spanning through the final captured row", () => {
    const result = analyzeTableLayout({
      snapshot: snapshot([
        rawNode("table", "table", ["tbody"]),
        rawNode("tbody", "tbody", ["r0", "r1", "r2"]),
        rawNode("r0", "tr", ["a", "b"]),
        rawNode("a", "td", [], { rowspan: "0" }),
        rawNode("b", "td"),
        rawNode("r1", "tr", ["c"]),
        rawNode("c", "td"),
        rawNode("r2", "tr", ["d"]),
        rawNode("d", "td"),
      ]),
      cascade: cascade({ table: [] }),
    });
    const table = result.tables[0];
    expect(table?.cells.find((cell) => cell.sourceNodeId === "a")).toMatchObject({ rowSpan: 3, rowEnd: 3 });
    expect(table?.cells.find((cell) => cell.sourceNodeId === "c")?.columnIndex).toBe(1);
    expect(table?.cells.find((cell) => cell.sourceNodeId === "d")?.columnIndex).toBe(1);
  });

  it("fails visibly for malformed spans and cells outside rows", () => {
    const result = analyzeTableLayout({
      snapshot: snapshot([
        rawNode("table", "table", ["r0", "orphan"]),
        rawNode("r0", "tr", ["bad"]),
        rawNode("bad", "td", [], { rowspan: "-4", colspan: "oops" }),
        rawNode("orphan", "td"),
      ]),
      cascade: cascade({ table: [] }),
    });
    expect(result.tables[0]?.cells[0]).toMatchObject({ rowSpan: 1, columnSpan: 1 });
    expect(result.diagnostics.filter((item) => item.code === "TABLE_SPAN_INVALID")).toHaveLength(2);
    expect(result.diagnostics.some((item) => item.code === "TABLE_CELL_OUTSIDE_ROW")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "TABLE_STYLE_EVIDENCE_MISSING")).toBe(true);
  });

  it("is deterministic and reports summary counts", () => {
    const input = {
      snapshot: snapshot([
        rawNode("table", "table", ["r0"]),
        rawNode("r0", "tr", ["a", "b"]),
        rawNode("a", "td"),
        rawNode("b", "td"),
      ]),
      cascade: cascade({ table: [["border-collapse", "separate"]] }),
    };
    const first = analyzeTableLayout(input);
    expect(analyzeTableLayout(input)).toEqual(first);
    expect(summarizeTableLayout(first)).toMatchObject({
      tableCount: 1,
      rowCount: 1,
      cellCount: 2,
      spannedCellCount: 0,
      collapsedBorderTableCount: 0,
    });
  });
});
