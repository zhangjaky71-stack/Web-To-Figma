import { describe, expect, it } from "vitest";
import type { WtfSourceNode } from "@w2f/w2f-ir";
import {
  applyStableIdentityAssignments,
  mapStableNodesAcrossCaptures,
  toStableMappedNodes,
} from "../src/index.js";
import type { StableIdentityAssignment, StableMappedNode } from "../src/index.js";

function mapped(captureNodeId: string, stableNodeId: string, confidence = 0.9): StableMappedNode {
  return {
    captureNodeId,
    stableIdentity: { id: stableNodeId, confidence, evidence: ["fixture"] },
  };
}

function sourceNode(captureNodeId: string): WtfSourceNode {
  return {
    captureNodeId,
    kind: "element",
    relationships: {},
    childCaptureNodeIds: [],
    tagName: "div",
  };
}

function assignment(captureNodeId: string, stableNodeId: string): StableIdentityAssignment {
  return {
    captureNodeId,
    identity: { id: stableNodeId, confidence: 0.91, evidence: ["fixture"] },
    signatureHash: "a".repeat(64),
    signals: {
      documentId: "doc_fixture",
      tagName: "div",
      stableDataAttributes: [],
      meaningfulClasses: [],
      ancestry: [],
      assetFingerprints: [],
      structuralPosition: { siblingIndex: 0 },
      usesStructuralFallback: true,
    },
  };
}

describe("cross-capture stable mapping", () => {
  it("classifies matched, added, and removed nodes deterministically", () => {
    const result = mapStableNodesAcrossCaptures(
      [mapped("old_header", "sid_header", 0.98), mapped("old_legacy", "sid_legacy", 0.7)],
      [mapped("new_header", "sid_header", 0.96), mapped("new_cta", "sid_cta", 0.88)],
    );

    expect(result).toMatchObject({ matched: 1, added: 1, removed: 1, ambiguous: 0 });
    expect(result.mappings.map((mapping) => [mapping.stableNodeId, mapping.status])).toEqual([
      ["sid_cta", "added"],
      ["sid_header", "matched"],
      ["sid_legacy", "removed"],
    ]);
    expect(
      result.mappings.find((mapping) => mapping.stableNodeId === "sid_header")?.confidence,
    ).toBe(0.96);
  });

  it("marks duplicate stable ids as ambiguous instead of silently pairing by array order", () => {
    const result = mapStableNodesAcrossCaptures(
      [mapped("old_a", "sid_duplicate"), mapped("old_b", "sid_duplicate")],
      [mapped("new_a", "sid_duplicate")],
    );
    expect(result.ambiguous).toBe(1);
    expect(result.mappings[0]).toMatchObject({
      stableNodeId: "sid_duplicate",
      status: "ambiguous",
      previousCaptureNodeIds: ["old_a", "old_b"],
      currentCaptureNodeIds: ["new_a"],
      confidence: 0.54,
    });
  });
});

describe("Source Graph identity application", () => {
  it("applies assignments immutably and reports unmapped/unused ids", () => {
    const nodes = [sourceNode("source_a"), sourceNode("source_b")];
    const result = applyStableIdentityAssignments(nodes, [
      assignment("source_a", "sid_a"),
      assignment("orphan_assignment", "sid_orphan"),
    ]);

    expect(nodes[0]!.stableIdentity).toBeUndefined();
    expect(result.nodes[0]!.stableIdentity?.id).toBe("sid_a");
    expect(result.nodes[1]!.stableIdentity).toBeUndefined();
    expect(result.unmappedCaptureNodeIds).toEqual(["source_b"]);
    expect(result.unusedAssignments).toEqual(["orphan_assignment"]);
  });

  it("converts only assigned Source Nodes into cross-capture mapping inputs", () => {
    const first = sourceNode("source_a");
    first.stableIdentity = { id: "sid_a", confidence: 0.9, evidence: ["fixture"] };
    const second = sourceNode("source_b");
    expect(toStableMappedNodes([first, second])).toEqual([mapped("source_a", "sid_a")]);
  });
});
