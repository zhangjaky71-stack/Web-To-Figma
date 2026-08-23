import type { RawSnapshot } from "@w2f/capture-core";
import { describe, expect, it } from "vitest";
import {
  buildStandardCascadeInput,
  normalizeCdpMatchedStyleAcquisition,
} from "../src/runtime/css-cascade-runtime.js";

describe("Browser CSS cascade runtime", () => {
  it("derives iframe, shadow and pseudo source hints from RawSnapshot", () => {
    const snapshot = {
      frames: [
        { context: { frameId: "root" }, rootCaptureNodeId: "doc:root", accessible: true },
        {
          context: { frameId: "child", parentFrameId: "root" },
          rootCaptureNodeId: "doc:child",
          accessible: true,
        },
      ],
      nodes: [
        {
          captureNodeId: "doc:root",
          kind: "document",
          relationships: {},
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: {},
        },
        {
          captureNodeId: "iframe:1",
          kind: "element",
          relationships: { sourceParentId: "doc:root" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: { sourceSelector: "iframe" },
        },
        {
          captureNodeId: "doc:child",
          kind: "document",
          relationships: { sourceParentId: "iframe:1" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "child", parentFrameId: "root" },
          source: {},
        },
        {
          captureNodeId: "host:1",
          kind: "element",
          relationships: { sourceParentId: "doc:root" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: { sourceSelector: "x-card" },
        },
        {
          captureNodeId: "shadow:1",
          kind: "shadow-root",
          relationships: { sourceParentId: "host:1", shadowHostId: "host:1" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: {},
        },
        {
          captureNodeId: "shadow:item",
          kind: "element",
          relationships: { sourceParentId: "shadow:1" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: { sourceSelector: ".item" },
        },
        {
          captureNodeId: "pseudo:before",
          kind: "pseudo",
          relationships: { sourceParentId: "host:1", composedParentId: "host:1" },
          childCaptureNodeIds: [],
          frameContext: { frameId: "root" },
          source: { pseudoType: "before" },
          pseudo: { type: "before", content: "x", contentKind: "text", generatedText: "x" },
        },
      ],
    } as unknown as RawSnapshot;

    const input = buildStandardCascadeInput(snapshot);
    expect(input.frames.find((frame) => frame.frameId === "child")?.ownerSourceNodeId).toBe(
      "iframe:1",
    );
    expect(
      input.targets.find((target) => target.sourceNodeId === "shadow:item")?.shadowHostSourceNodeId,
    ).toBe("host:1");
    expect(input.targets.find((target) => target.sourceNodeId === "pseudo:before")).toMatchObject({
      pseudoType: "before",
      pseudoHostSourceNodeId: "host:1",
    });
  });

  it("normalizes matched CDP rules with importance, media provenance and token usage", () => {
    const acquisition = normalizeCdpMatchedStyleAcquisition([
      {
        sourceNodeId: "node:1",
        computed: {
          computedStyle: [
            { name: "color", value: "rgb(10, 20, 30)" },
            { name: "--brand", value: "rgb(10, 20, 30)" },
          ],
        },
        matched: {
          matchedCSSRules: [
            {
              rule: {
                selectorList: { text: ":root" },
                style: {
                  styleSheetId: "sheet-1",
                  cssProperties: [{ name: "--brand", value: "#0a141e", parsedOk: true }],
                },
              },
            },
            {
              rule: {
                selectorList: { text: ".card" },
                media: [{ text: "(min-width: 900px)", active: true }],
                style: {
                  styleSheetId: "sheet-1",
                  cssProperties: [
                    {
                      name: "color",
                      value: "var(--brand)",
                      important: true,
                      parsedOk: true,
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ]);

    const node = acquisition.nodes[0]!;
    const color = node.traces.find((trace) => trace.property === "color")!;
    expect(color.computedValue).toBe("rgb(10, 20, 30)");
    expect(color.candidates[0]).toMatchObject({
      important: true,
      status: "matched-unresolved",
      source: { selector: ".card", mediaConditions: ["(min-width: 900px)"] },
    });
    expect(acquisition.tokenDefinitions).toHaveLength(1);
    expect(acquisition.tokenUsages).toHaveLength(1);
    expect(acquisition.unresolvedTokenUsages).toHaveLength(0);
  });

  it("preserves inactive media and ambiguous token usages without guessing", () => {
    const acquisition = normalizeCdpMatchedStyleAcquisition([
      {
        sourceNodeId: "node:1",
        computed: { computedStyle: [{ name: "color", value: "red" }] },
        matched: {
          matchedCSSRules: [
            {
              rule: {
                selectorList: { text: ".a" },
                style: {
                  styleSheetId: "a",
                  cssProperties: [{ name: "--brand", value: "red", parsedOk: true }],
                },
              },
            },
            {
              rule: {
                selectorList: { text: ".b" },
                style: {
                  styleSheetId: "b",
                  cssProperties: [{ name: "--brand", value: "blue", parsedOk: true }],
                },
              },
            },
            {
              rule: {
                selectorList: { text: ".card" },
                media: [{ text: "(max-width: 200px)", active: false }],
                style: {
                  styleSheetId: "a",
                  cssProperties: [{ name: "background", value: "black", parsedOk: true }],
                },
              },
            },
          ],
          inlineStyle: {
            cssProperties: [{ name: "color", value: "var(--brand)", parsedOk: true }],
          },
        },
      },
    ]);

    expect(
      acquisition.nodes[0]?.traces
        .find((trace) => trace.property === "background")
        ?.candidates[0]?.status,
    ).toBe("inactive-condition");
    expect(acquisition.tokenUsages).toHaveLength(0);
    expect(acquisition.unresolvedTokenUsages[0]).toMatchObject({
      tokenName: "--brand",
      reason: "definition-ambiguous",
    });
    expect(acquisition.diagnostics.some((item) => item.code === "CSS_TOKEN_USAGE_UNRESOLVED")).toBe(
      true,
    );
  });
});
