import { describe, expect, it } from "vitest";
import {
  createCssCascadeCapture,
  isCssCascadeCapture,
  summarizeCssCascadeCapture,
} from "../src/index.js";

describe("CssCascadeCapture", () => {
  it("preserves matched authored evidence without fabricating a winner", () => {
    const capture = createCssCascadeCapture({
      adapter: "standard",
      nodes: [
        {
          sourceNodeId: "node:1",
          customProperties: {},
          traces: [
            {
              property: "color",
              computedValue: "rgb(1, 2, 3)",
              candidates: [
                {
                  property: "color",
                  authoredValue: "var(--brand)",
                  important: true,
                  inherited: false,
                  status: "matched-unresolved",
                  sourceOrder: 1,
                  source: { type: "stylesheet", selector: ".card", ruleIndex: 0 },
                },
              ],
            },
          ],
        },
      ],
      tokenDefinitions: [],
      tokenUsages: [],
      unresolvedTokenUsages: [
        {
          sourceNodeId: "node:1",
          property: "color",
          tokenName: "--brand",
          authoredValue: "var(--brand)",
          resolvedValue: "rgb(1, 2, 3)",
          reason: "definition-unavailable",
        },
      ],
      diagnostics: [
        {
          code: "CSS_TOKEN_USAGE_UNRESOLVED",
          message: "Definition unavailable",
          sourceNodeId: "node:1",
        },
      ],
    });

    expect(isCssCascadeCapture(capture)).toBe(true);
    expect(capture.styles[0]?.declarations[0]).toEqual({
      property: "color",
      computedValue: "rgb(1, 2, 3)",
    });
    expect(capture.cascade.nodes[0]?.traces[0]?.candidates[0]?.important).toBe(true);
    expect(summarizeCssCascadeCapture(capture)).toMatchObject({
      adapter: "standard",
      styleCount: 1,
      unresolvedTokenUsageCount: 1,
      diagnosticCount: 1,
    });
  });

  it("rejects malformed sidecar evidence", () => {
    const malformed = {
      version: "1.0.0",
      adapter: "standard",
      cascade: {
        version: "1.0.0",
        nodes: [
          {
            sourceNodeId: "node:1",
            customProperties: {},
            traces: [
              {
                property: "color",
                computedValue: "red",
                candidates: [
                  {
                    property: "color",
                    authoredValue: "red",
                    important: false,
                    inherited: false,
                    status: "guessed-winner",
                    sourceOrder: 0,
                    source: { type: "stylesheet" },
                  },
                ],
              },
            ],
          },
        ],
      },
      styles: [{ id: "style:node:1", declarations: [{ property: "color", computedValue: "red" }] }],
      tokens: { tokens: [], usages: [] },
      unresolvedTokenUsages: [],
      diagnostics: [],
    };
    expect(isCssCascadeCapture(malformed)).toBe(false);
  });
});
