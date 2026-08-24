import { describe, expect, it } from "vitest";
import {
  CURRENT_FIGMA_CAPABILITY_REGISTRY,
  resolveFigmaCapability,
  withCapabilityOverrides,
  type W2fCapabilityContext,
  type W2fCapabilityRequest,
} from "../src/index.js";

const baseContext: W2fCapabilityContext = {
  parentLayout: "none",
  targetLayout: "none",
  canInsertWrapper: false,
  canUseAbsolutePositioning: false,
  rasterEvidenceAvailable: false,
};

function request(
  capability: W2fCapabilityRequest["capability"],
  overrides: Partial<W2fCapabilityRequest> = {},
): W2fCapabilityRequest {
  return {
    capability,
    nodeKind: "container",
    profile: "balanced",
    context: baseContext,
    ...overrides,
  };
}

describe("NODE-24 Figma capability resolver", () => {
  it("uses native Grid when the current Figma snapshot supports a frame-like target", () => {
    const plan = resolveFigmaCapability(
      request("grid", {
        context: { ...baseContext, targetLayout: "grid" },
      }),
    );
    expect(plan.strategy).toBe("NATIVE");
    expect(plan.renderStrategy).toBe("native");
    expect(plan.registrySnapshotId).toBe("figma-plugin-api-2026-08-24");
  });

  it("uses a wrapper when native FILL context is invalid but a wrapper can establish it", () => {
    const plan = resolveFigmaCapability(
      request("fillSizing", {
        profile: "fidelity",
        context: {
          ...baseContext,
          canInsertWrapper: true,
          canUseAbsolutePositioning: true,
          rasterEvidenceAvailable: true,
        },
      }),
    );
    expect(plan.strategy).toBe("WRAPPER");
    expect(plan.requiresWrapper).toBe(true);
  });

  it("uses absolute fallback for Fidelity when wrapper is unavailable", () => {
    const plan = resolveFigmaCapability(
      request("fillSizing", {
        profile: "high-fidelity",
        context: { ...baseContext, canUseAbsolutePositioning: true },
      }),
    );
    expect(plan.profile).toBe("fidelity");
    expect(plan.strategy).toBe("ABSOLUTE");
  });

  it("chooses editable emulation for a partial image transform in Balanced", () => {
    const plan = resolveFigmaCapability(
      request("imageTransform", {
        context: {
          ...baseContext,
          featureVariant: "arbitrary-transform",
          rasterEvidenceAvailable: true,
        },
      }),
    );
    expect(plan.capabilityState).toBe("partial");
    expect(plan.strategy).toBe("EMULATED");
  });

  it("chooses raster before emulation for the same partial transform in Fidelity", () => {
    const plan = resolveFigmaCapability(
      request("imageTransform", {
        profile: "fidelity",
        context: {
          ...baseContext,
          featureVariant: "arbitrary-transform",
          rasterEvidenceAvailable: true,
        },
      }),
    );
    expect(plan.strategy).toBe("RASTER");
  });

  it("fails closed to unsupported when the registry has no safe representation", () => {
    const registry = withCapabilityOverrides(CURRENT_FIGMA_CAPABILITY_REGISTRY, {
      svgImport: {
        state: "unsupported",
        rasterEligible: false,
        emulationAvailable: false,
      },
    });
    const plan = resolveFigmaCapability(request("svgImport"), registry);
    expect(plan.strategy).toBe("UNSUPPORTED");
    expect(plan.renderStrategy).toBe("unsupported");
  });

  it("preserves stable mapping, revision metadata and literal token policy in every plan", () => {
    const revisionHashes = { contentHash: "content-v1", layoutHash: "layout-v1" };
    const plan = resolveFigmaCapability(
      request("textMixedStyles", {
        nodeKind: "text",
        sourceStableIds: ["stable-a", "stable-b"],
        revisionHashes,
      }),
    );
    expect(plan.strategy).toBe("NATIVE");
    expect(plan.sourceStableIds).toEqual(["stable-a", "stable-b"]);
    expect(plan.revisionHashes).toEqual(revisionHashes);
    expect(plan.tokenPolicy).toBe("literal");
    expect(plan.preservesRevisionMetadata).toBe(true);
    expect(plan.preservesStableSourceMapping).toBe(true);
  });

  it("keeps a raster safety boundary even in Design Friendly mode", () => {
    const plan = resolveFigmaCapability(
      request("imageTransform", {
        profile: "design-friendly",
        preferredStrategy: "raster",
        context: {
          ...baseContext,
          featureVariant: "arbitrary-transform",
          rasterEvidenceAvailable: true,
        },
      }),
    );
    expect(plan.strategy).toBe("RASTER");
    expect(plan.reasons.some((reason) => reason === "safety-boundary:raster")).toBe(true);
  });
});
