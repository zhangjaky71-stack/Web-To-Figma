import { describe, expect, it } from "vitest";
import { validateWtfIrBundle } from "../src/index.js";
import { createIrBundle } from "./fixture.js";

function errorCodes(value: unknown): string[] {
  const result = validateWtfIrBundle(value);
  if (result.ok) return [];
  return result.errors.map((error) => error.code);
}

describe("W2F IR V2 cross-reference validation", () => {
  it("rejects render nodes that map to missing source nodes", () => {
    const bundle = createIrBundle();
    bundle.renderTree.nodes[1]!.sourceNodeIds = ["source_missing"];
    expect(errorCodes(bundle)).toContain("WTF_IR_RENDER_SOURCE_MISSING");
  });

  it("rejects cycles in the source tree", () => {
    const bundle = createIrBundle();
    bundle.sourceGraph.nodes[2]!.childCaptureNodeIds = ["source_root"];
    expect(errorCodes(bundle)).toContain("WTF_IR_GRAPH_CYCLE");
  });

  it("rejects unreachable render nodes", () => {
    const bundle = createIrBundle();
    bundle.renderTree.nodes[0]!.childIds = [];
    expect(errorCodes(bundle)).toContain("WTF_IR_GRAPH_UNREACHABLE");
  });

  it("rejects missing style references", () => {
    const bundle = createIrBundle();
    bundle.sourceGraph.nodes[1]!.styleRef = "style_missing";
    expect(errorCodes(bundle)).toContain("WTF_IR_STYLE_REF_MISSING");
  });

  it("rejects missing asset references", () => {
    const bundle = createIrBundle();
    bundle.renderTree.nodes[1]!.assetRefs = ["asset_missing"];
    expect(errorCodes(bundle)).toContain("WTF_IR_ASSET_REF_MISSING");
  });

  it("rejects responsive rules that target unknown stable identities", () => {
    const bundle = createIrBundle();
    bundle.responsive.rules[0]!.targetStableNodeId = "sid_missing";
    expect(errorCodes(bundle)).toContain("WTF_IR_RESPONSIVE_TARGET_MISSING");
  });

  it("rejects snapshots that reference unknown environments", () => {
    const bundle = createIrBundle();
    bundle.responsive.snapshots[0]!.environmentRef = "env_missing";
    expect(errorCodes(bundle)).toContain("WTF_IR_SNAPSHOT_ENV_MISSING");
  });

  it("rejects document/source revision identity drift", () => {
    const bundle = createIrBundle();
    bundle.sourceGraph.revision.captureId = "cap_other";
    expect(errorCodes(bundle)).toContain("WTF_IR_REVISION_MISMATCH");
  });

  it("rejects dangling diagnostic references from render nodes", () => {
    const bundle = createIrBundle();
    bundle.renderTree.nodes[1]!.diagnosticIds = ["diag_missing"];
    expect(errorCodes(bundle)).toContain("WTF_IR_DIAGNOSTIC_REF_MISSING");
  });

  it("rejects non-canonical asset hashes", () => {
    const bundle = createIrBundle();
    bundle.assets.assets.push({
      id: "asset_logo",
      kind: "image",
      mediaType: "image/png",
      sha256: "BAD",
    });
    expect(errorCodes(bundle)).toContain("WTF_IR_ASSET_HASH_INVALID");
  });
});
