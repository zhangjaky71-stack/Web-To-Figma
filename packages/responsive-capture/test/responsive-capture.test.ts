import { describe, expect, it } from "vitest";
import {
  RESPONSIVE_COMMON_WIDTHS,
  RESPONSIVE_DEFAULT_WIDTHS,
  buildResponsiveCapture,
  planResponsiveViewports,
  responsiveArtifactId,
  summarizeResponsiveCapture,
  toWtfResponsiveSnapshotRefs,
} from "../src/index.js";

const current = { width: 1280, height: 800, dpr: 2 };

describe("Responsive Capture", () => {
  it("freezes the V2 common candidates and reduced default preset", () => {
    expect([...RESPONSIVE_COMMON_WIDTHS]).toEqual([1440, 1280, 1024, 768, 390]);
    expect([...RESPONSIVE_DEFAULT_WIDTHS]).toEqual([1440, 768, 390]);
  });

  it("plans current viewport without synthetic mutation", () => {
    expect(planResponsiveViewports({ mode: "current" }, current)).toEqual([
      {
        id: "viewport:1280x800@2",
        width: 1280,
        height: 800,
        dpr: 2,
        source: "current",
      },
    ]);
  });

  it("plans reduced common widths with stable height and DPR", () => {
    expect(planResponsiveViewports({ mode: "common" }, current).map((item) => item.width)).toEqual([
      1440, 768, 390,
    ]);
    expect(planResponsiveViewports({ mode: "common" }, current)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 390, height: 800, dpr: 2, source: "synthetic" }),
      ]),
    );
  });

  it("normalizes, de-duplicates and deterministically sorts custom viewports", () => {
    const planned = planResponsiveViewports(
      {
        mode: "custom",
        viewports: [
          { width: 390, height: 844, dpr: 3 },
          { width: 1440 },
          { width: 390, height: 844, dpr: 3 },
        ],
      },
      current,
    );
    expect(planned.map((item) => item.id)).toEqual([
      "viewport:1440x800@2",
      "viewport:390x844@3",
    ]);
  });

  it("rejects unsafe viewport counts and dimensions", () => {
    expect(() =>
      planResponsiveViewports(
        {
          mode: "custom",
          viewports: Array.from({ length: 9 }, (_, index) => ({ width: 300 + index })),
        },
        current,
      ),
    ).toThrow(/at most 8/);
    expect(() =>
      planResponsiveViewports({ mode: "custom", viewports: [{ width: 100 }] }, current),
    ).toThrow(/between 240 and 10000/);
  });

  it("builds frozen WtfResponsiveSnapshotRef projections with stable matching evidence", () => {
    const plan = planResponsiveViewports({ mode: "current" }, current)[0];
    if (!plan) throw new Error("missing plan fixture");
    const capture = buildResponsiveCapture({
      request: { mode: "current" },
      baseViewport: current,
      snapshots: [
        {
          plan,
          ref: {
            id: plan.id,
            viewport: current,
            rootNodeId: "doc:root",
            environmentRef: "environment:child",
          },
          artifactId: "child",
          artifacts: {
            rawSnapshot: "raw-snapshot:child",
            environment: "environment:child",
          },
          stableNodes: [
            {
              captureNodeId: "node:b",
              stableNodeId: "sid_b",
              confidence: 0.9,
              signatureHash: "b".repeat(64),
            },
            {
              captureNodeId: "node:a",
              stableNodeId: "sid_a",
              confidence: 0.95,
              signatureHash: "a".repeat(64),
            },
          ],
        },
      ],
    });
    expect(capture.snapshots[0]?.stableNodes.map((item) => item.captureNodeId)).toEqual([
      "node:a",
      "node:b",
    ]);
    expect(toWtfResponsiveSnapshotRefs(capture)).toEqual([
      expect.objectContaining({ id: plan.id, rootNodeId: "doc:root" }),
    ]);
    expect(summarizeResponsiveCapture(capture)).toMatchObject({
      plannedViewportCount: 1,
      capturedSnapshotCount: 1,
      stableNodeEvidenceCount: 2,
    });
  });

  it("uses deterministic child artifact ids", () => {
    expect(responsiveArtifactId("job-15", "viewport:390x800@2")).toBe(
      "job-15:responsive:viewport%3A390x800%402",
    );
  });
});
