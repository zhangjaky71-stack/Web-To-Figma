import { describe, expect, it } from "vitest";
import {
  inferResponsiveBehavior,
  summarizeResponsiveInference,
  type ResponsiveInferenceInput,
  type ResponsiveNodeObservation,
} from "../src/index.js";

const snapshots = [
  {
    id: "snap:390",
    viewport: { width: 390, height: 844, dpr: 2 },
    rootNodeId: "root:390",
    environmentRef: "environment:390",
  },
  {
    id: "snap:768",
    viewport: { width: 768, height: 844, dpr: 2 },
    rootNodeId: "root:768",
    environmentRef: "environment:768",
  },
  {
    id: "snap:1440",
    viewport: { width: 1440, height: 844, dpr: 2 },
    rootNodeId: "root:1440",
    environmentRef: "environment:1440",
  },
];

function observation(
  snapshotId: string,
  stableNodeId: string,
  viewportWidth: number,
  overrides: Partial<ResponsiveNodeObservation> = {},
): ResponsiveNodeObservation {
  return {
    snapshotId,
    stableNodeId,
    stableConfidence: 0.96,
    viewportWidth,
    viewportHeight: 844,
    present: true,
    visible: true,
    ...overrides,
  };
}

describe("Responsive Inference Engine", () => {
  it("infers visibility transitions without inventing an exact breakpoint", () => {
    const input: ResponsiveInferenceInput = {
      snapshots,
      observations: [
        observation("snap:390", "sid_nav", 390, { visible: false }),
        observation("snap:768", "sid_nav", 768),
        observation("snap:1440", "sid_nav", 1440),
      ],
    };
    const result = inferResponsiveBehavior(input);
    const visibility = result.payload.rules.find(
      (rule) => rule.targetStableNodeId === "sid_nav" && rule.property === "visibility",
    );
    expect(visibility?.ranges.map((range) => range.value)).toEqual([false, true]);
    const transition = result.breakpointCandidates.find(
      (candidate) =>
        candidate.source === "observed-transition" && candidate.properties.includes("visibility"),
    );
    expect(transition).toMatchObject({
      lowerObservedWidth: 390,
      upperObservedWidth: 768,
    });
    expect(transition?.boundaryWidth).toBeUndefined();
  });

  it("uses authored width evidence to distinguish fill, fixed and hug", () => {
    const observations: ResponsiveNodeObservation[] = [];
    for (const [snapshotId, width] of [
      ["snap:390", 390],
      ["snap:768", 768],
      ["snap:1440", 1440],
    ] as const) {
      observations.push(
        observation(snapshotId, "sid_fill", width, { authored: { width: "100%" } }),
        observation(snapshotId, "sid_fixed", width, { authored: { width: "240px" } }),
        observation(snapshotId, "sid_hug", width, { authored: { width: "fit-content" } }),
      );
    }
    const result = inferResponsiveBehavior({ snapshots, observations });
    expect(
      result.sizingDecisions.find(
        (decision) => decision.stableNodeId === "sid_fill" && decision.axis === "width",
      )?.mode,
    ).toBe("fill");
    expect(
      result.sizingDecisions.find(
        (decision) => decision.stableNodeId === "sid_fixed" && decision.axis === "width",
      )?.mode,
    ).toBe("fixed");
    expect(
      result.sizingDecisions.find(
        (decision) => decision.stableNodeId === "sid_hug" && decision.axis === "width",
      )?.mode,
    ).toBe("hug");
  });

  it("uses parent-relative geometry only when the parent changes materially", () => {
    const fill = [
      observation("snap:390", "sid_geometry_fill", 390, {
        bounds: { x: 0, y: 0, width: 360, height: 40 },
        parentBounds: { x: 0, y: 0, width: 380, height: 100 },
      }),
      observation("snap:768", "sid_geometry_fill", 768, {
        bounds: { x: 0, y: 0, width: 720, height: 40 },
        parentBounds: { x: 0, y: 0, width: 752, height: 100 },
      }),
    ];
    const fixed = [
      observation("snap:390", "sid_geometry_fixed", 390, {
        bounds: { x: 0, y: 0, width: 200, height: 40 },
        parentBounds: { x: 0, y: 0, width: 380, height: 100 },
      }),
      observation("snap:768", "sid_geometry_fixed", 768, {
        bounds: { x: 0, y: 0, width: 201, height: 40 },
        parentBounds: { x: 0, y: 0, width: 752, height: 100 },
      }),
    ];
    const result = inferResponsiveBehavior({ snapshots: snapshots.slice(0, 2), observations: [...fill, ...fixed] });
    expect(
      result.sizingDecisions.find(
        (decision) => decision.stableNodeId === "sid_geometry_fill" && decision.axis === "width",
      )?.mode,
    ).toBe("fill");
    expect(
      result.sizingDecisions.find(
        (decision) => decision.stableNodeId === "sid_geometry_fixed" && decision.axis === "width",
      )?.mode,
    ).toBe("fixed");
  });

  it("keeps authored sizing when geometry conflicts and lowers confidence visibly", () => {
    const result = inferResponsiveBehavior({
      snapshots: snapshots.slice(0, 2),
      observations: [
        observation("snap:390", "sid_conflict", 390, {
          authored: { width: "200px" },
          bounds: { x: 0, y: 0, width: 360, height: 40 },
          parentBounds: { x: 0, y: 0, width: 380, height: 100 },
        }),
        observation("snap:768", "sid_conflict", 768, {
          authored: { width: "200px" },
          bounds: { x: 0, y: 0, width: 720, height: 40 },
          parentBounds: { x: 0, y: 0, width: 752, height: 100 },
        }),
      ],
    });
    const decision = result.sizingDecisions.find(
      (item) => item.stableNodeId === "sid_conflict" && item.axis === "width",
    );
    expect(decision?.mode).toBe("fixed");
    expect(decision?.confidence).toBeLessThan(0.96);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === "RESPONSIVE_INFERENCE_SIZING_CONFLICT"),
    ).toBe(true);
  });

  it("preserves explicit authored media-query breakpoints separately from sampled transitions", () => {
    const result = inferResponsiveBehavior({
      snapshots,
      observations: [],
      mediaRules: [
        {
          query: "(max-width: 640px)",
          activeInSnapshotIds: ["snap:390"],
          affectedProperties: ["display", "width"],
        },
      ],
    });
    expect(result.breakpointCandidates).toContainEqual(
      expect.objectContaining({
        source: "authored-media",
        boundaryWidth: 640,
        lowerSnapshotId: "snap:390",
        upperSnapshotId: "snap:768",
        confidence: 0.99,
      }),
    );
    expect(result.payload.mediaRules[0]?.query).toBe("(max-width: 640px)");
  });

  it("rejects duplicate snapshot ids and diagnoses missing or duplicate observations", () => {
    expect(() =>
      inferResponsiveBehavior({ snapshots: [snapshots[0]!, snapshots[0]!], observations: [] }),
    ).toThrow(/snapshot ids must be unique/);

    const result = inferResponsiveBehavior({
      snapshots: snapshots.slice(0, 1),
      observations: [
        observation("snap:missing", "sid_missing", 390),
        observation("snap:390", "sid_duplicate", 390),
        observation("snap:390", "sid_duplicate", 390),
      ],
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "RESPONSIVE_INFERENCE_SNAPSHOT_MISSING",
        "RESPONSIVE_INFERENCE_DUPLICATE_OBSERVATION",
      ]),
    );
  });

  it("returns deterministic summaries and sorted payload rules", () => {
    const result = inferResponsiveBehavior({
      snapshots: [snapshots[2]!, snapshots[0]!, snapshots[1]!],
      observations: [
        observation("snap:390", "sid_b", 390, { authored: { width: "100%" } }),
        observation("snap:768", "sid_b", 768, { authored: { width: "100%" } }),
        observation("snap:390", "sid_a", 390, { authored: { width: "240px" } }),
        observation("snap:768", "sid_a", 768, { authored: { width: "240px" } }),
      ],
    });
    expect(result.payload.snapshots.map((snapshot) => snapshot.id)).toEqual([
      "snap:390",
      "snap:768",
      "snap:1440",
    ]);
    const keys = result.payload.rules.map((rule) => `${rule.targetStableNodeId}:${rule.property}`);
    expect(keys).toEqual([...keys].sort());
    expect(summarizeResponsiveInference(result)).toMatchObject({
      version: "1.0.0",
      snapshotCount: 3,
      ruleCount: result.payload.rules.length,
      sizingDecisionCount: result.sizingDecisions.length,
    });
  });
});
