import { describe, expect, it } from "vitest";
import {
  CSS_CASCADE_ENGINE_VERSION,
  buildTokenGraph,
  createCascadePayload,
  createCascadePropertyTrace,
  createNodeCascadeEvidence,
  extractVarReferenceNames,
  parseCssLength,
  toWtfStyleRecord,
  type CssAuthoredDeclarationEvidence,
} from "../src/index.js";

function declaration(
  overrides: Partial<CssAuthoredDeclarationEvidence> = {},
): CssAuthoredDeclarationEvidence {
  return {
    property: "color",
    authoredValue: "red",
    important: false,
    inherited: false,
    status: "overridden",
    sourceOrder: 0,
    specificity: { ids: 0, classes: 1, types: 0 },
    source: {
      type: "stylesheet",
      stylesheetRef: "sheet:main",
      selector: ".card",
      ruleIndex: 0,
      declarationIndex: 0,
    },
    ...overrides,
  };
}

describe("NODE-11 CSS cascade engine", () => {
  it("keeps the versioned cascade contract stable", () => {
    expect(CSS_CASCADE_ENGINE_VERSION).toBe("1.0.0");
  });

  it("preserves authored winner, important and media provenance", () => {
    const trace = createCascadePropertyTrace("COLOR", "rgb(0, 0, 255)", [
      declaration(),
      declaration({
        authoredValue: "blue",
        important: true,
        status: "winner",
        sourceOrder: 1,
        source: {
          type: "stylesheet",
          stylesheetRef: "sheet:main",
          selector: ".card",
          ruleIndex: 1,
          declarationIndex: 0,
          mediaConditions: ["(min-width: 800px)"],
        },
      }),
    ]);

    expect(trace.property).toBe("color");
    expect(trace.candidates[1]).toMatchObject({
      authoredValue: "blue",
      important: true,
      status: "winner",
      source: { mediaConditions: ["(min-width: 800px)"] },
    });

    const style = toWtfStyleRecord(
      "style:card",
      createNodeCascadeEvidence("node:card", [trace]),
    );
    expect(style.declarations[0]).toMatchObject({
      property: "color",
      computedValue: "rgb(0, 0, 255)",
      authoredValue: "blue",
      important: true,
      source: { stylesheetRef: "sheet:main", selector: ".card", ruleIndex: 1 },
    });
  });

  it("keeps computed-only evidence when authored winner is unavailable", () => {
    const trace = createCascadePropertyTrace("display", "block", []);
    const style = toWtfStyleRecord(
      "style:computed-only",
      createNodeCascadeEvidence("node:computed-only", [trace]),
    );
    expect(style.declarations[0]).toEqual({ property: "display", computedValue: "block" });
  });

  it("normalizes ordering and produces deterministic cascade hashes", () => {
    const color = createCascadePropertyTrace("color", "red", [
      declaration({ status: "winner", sourceOrder: 2 }),
    ]);
    const display = createCascadePropertyTrace("display", "block", [
      declaration({
        property: "display",
        authoredValue: "block",
        status: "winner",
        sourceOrder: 1,
      }),
    ]);
    const first = toWtfStyleRecord(
      "style:first",
      createNodeCascadeEvidence("node:1", [color, display], { "--space": "16px" }),
    );
    const second = toWtfStyleRecord(
      "style:second",
      createNodeCascadeEvidence("node:1", [display, color], { "--space": "16px" }),
    );
    expect(first.cascadeHash).toBe(second.cascadeHash);
    expect(first.declarations.map((item) => item.property)).toEqual(["color", "display"]);
  });

  it("rejects ambiguous multiple cascade winners", () => {
    expect(() =>
      createCascadePropertyTrace("color", "red", [
        declaration({ status: "winner" }),
        declaration({ status: "winner", sourceOrder: 1 }),
      ]),
    ).toThrow(/multiple winners/);
  });

  it("normalizes CSS length semantics without discarding authored values", () => {
    expect(parseCssLength(" 50% ", 320)).toEqual({
      semantic: { type: "percent", value: 50 },
      authoredValue: " 50% ",
      resolvedPx: 320,
    });
    expect(parseCssLength("1.25rem", 20).semantic).toEqual({ type: "rem", value: 1.25 });
    expect(parseCssLength("12vw").semantic).toEqual({ type: "viewport", unit: "vw", value: 12 });
    expect(parseCssLength("auto").semantic).toEqual({ type: "keyword", value: "auto" });
    expect(parseCssLength("calc(100% - 2rem)").semantic).toEqual({
      type: "expression",
      raw: "calc(100% - 2rem)",
    });
    expect(parseCssLength("0").semantic).toEqual({ type: "px", value: 0 });
  });

  it("builds deterministic Token Graph aliases and usages from explicit definition evidence", () => {
    const result = buildTokenGraph({
      definitions: [
        {
          definitionKey: "root-primary",
          name: "--color-primary",
          rawValue: "#0a84ff",
          resolvedValue: "rgb(10, 132, 255)",
          kind: "color",
          stylesheetRef: "sheet:main",
          selector: ":root",
          sourceType: "css-custom-property",
          referenceDefinitionKeys: [],
          confidence: 1,
        },
        {
          definitionKey: "button-bg",
          name: "--button-bg",
          rawValue: "var(--color-primary)",
          resolvedValue: "rgb(10, 132, 255)",
          kind: "color",
          stylesheetRef: "sheet:main",
          selector: ".button",
          sourceType: "css-custom-property",
          referenceDefinitionKeys: ["root-primary"],
          confidence: 0.95,
        },
      ],
      usages: [
        {
          definitionKey: "button-bg",
          sourceNodeId: "node:button",
          property: "BACKGROUND-COLOR",
          authoredValue: "var(--button-bg)",
          resolvedValue: "rgb(10, 132, 255)",
        },
      ],
    });

    const primaryId = result.definitionIds["root-primary"]!;
    const buttonId = result.definitionIds["button-bg"]!;
    expect(result.graph.tokens.find((token) => token.id === buttonId)?.references).toEqual([
      primaryId,
    ]);
    expect(result.graph.usages).toEqual([
      {
        tokenId: buttonId,
        sourceNodeId: "node:button",
        property: "background-color",
        authoredValue: "var(--button-bg)",
        resolvedValue: "rgb(10, 132, 255)",
      },
    ]);
  });

  it("does not guess missing token definitions and extracts authored var references separately", () => {
    expect(extractVarReferenceNames("var(--a, var(--b)) solid var(--a)")).toEqual(["--a", "--b"]);
    expect(() =>
      buildTokenGraph({
        definitions: [
          {
            definitionKey: "a",
            name: "--a",
            rawValue: "var(--missing)",
            sourceType: "css-custom-property",
            referenceDefinitionKeys: ["missing"],
            confidence: 0.5,
          },
        ],
        usages: [],
      }),
    ).toThrow(/unknown definition/);
  });

  it("rejects duplicate cascade nodes in the portable cascade payload", () => {
    const node = createNodeCascadeEvidence("node:1", []);
    expect(() => createCascadePayload([node, node])).toThrow(/duplicate cascade node/);
  });
});
