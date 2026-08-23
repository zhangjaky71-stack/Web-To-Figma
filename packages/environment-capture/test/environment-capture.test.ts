import { describe, expect, it } from "vitest";
import {
  createEnvironmentCapture,
  isEnvironmentCapture,
  summarizeEnvironmentCapture,
  toWtfCaptureEnvironment,
  toWtfContainerQueryInfo,
  toWtfMediaRuleTraces,
  type EnvironmentEvidenceAvailability,
} from "../src/index.js";

function baseEnvironment(
  pageZoom: number | undefined = 1.25,
  pageZoomAvailability: EnvironmentEvidenceAvailability =
    pageZoom === undefined ? "unavailable" : "observed",
) {
  return {
    browserName: "Chrome",
    browserVersion: "140.0.0.0",
    platform: "Windows",
    language: "en-US",
    direction: "ltr" as const,
    colorScheme: "dark" as const,
    reducedMotion: true,
    viewportWidth: 1440,
    viewportHeight: 900,
    dpr: 2,
    ...(pageZoom === undefined ? {} : { pageZoom }),
    pageZoomAvailability,
    visualViewportScale: 1,
    cssZoomAvailability: "unavailable" as const,
  };
}

describe("NODE-12 environment capture", () => {
  it("normalizes media and container evidence deterministically", () => {
    const capture = createEnvironmentCapture({
      adapter: "cdp",
      snapshotId: "snapshot:desktop",
      environment: baseEnvironment(),
      mediaRules: [
        {
          id: "media:1",
          query: "(min-width: 1200px)",
          active: true,
          activeInSnapshotIds: [],
          affectedProperties: ["display", "display", "grid-template-columns"],
          affectedSourceNodeIds: ["node:b", "node:a", "node:b"],
        },
      ],
      containers: [
        { sourceNodeId: "node:container", containerName: "card", containerType: "inline-size" },
      ],
      containerQueries: [
        {
          id: "container:1",
          containerName: "card",
          condition: "(width > 40rem)",
          affectedProperties: ["gap", "display"],
          affectedSourceNodeIds: ["node:b", "node:a"],
        },
      ],
    });

    expect(capture.mediaRules[0]).toMatchObject({
      activeInSnapshotIds: ["snapshot:desktop"],
      affectedProperties: ["display", "grid-template-columns"],
      affectedSourceNodeIds: ["node:a", "node:b"],
    });
    expect(capture.environment.mediaFeatures).toEqual([]);
    expect(capture.containerQueries[0]).toMatchObject({
      activeAvailability: "unavailable",
    });
    expect(capture.containerQueries[0]).not.toHaveProperty("active");
    expect(isEnvironmentCapture(capture)).toBe(true);
    expect(summarizeEnvironmentCapture(capture)).toMatchObject({
      mediaRuleCount: 1,
      activeMediaRuleCount: 1,
      containerCount: 1,
      containerQueryCount: 1,
      observedContainerQueryCount: 0,
      activeContainerQueryCount: 0,
    });
  });

  it("normalizes observed media features and container-query state", () => {
    const capture = createEnvironmentCapture({
      adapter: "cdp",
      snapshotId: "snapshot:observed",
      environment: {
        ...baseEnvironment(),
        mediaFeatures: [
          {
            id: "reduced-motion",
            query: "(prefers-reduced-motion: reduce)",
            matches: true,
            availability: "observed",
          },
          {
            id: "color-scheme-dark",
            query: "(prefers-color-scheme: dark)",
            matches: true,
            availability: "observed",
          },
        ],
      },
      containerQueries: [
        {
          id: "container:observed",
          condition: "(inline-size > 40rem)",
          active: true,
          activeAvailability: "observed",
          containerSourceNodeId: "node:container",
          affectedProperties: ["display"],
          affectedSourceNodeIds: ["node:card"],
        },
      ],
    });

    expect(capture.environment.mediaFeatures?.map((item) => item.id)).toEqual([
      "color-scheme-dark",
      "reduced-motion",
    ]);
    expect(capture.containerQueries[0]).toMatchObject({
      active: true,
      activeAvailability: "observed",
      containerSourceNodeId: "node:container",
    });
    expect(summarizeEnvironmentCapture(capture)).toMatchObject({
      observedContainerQueryCount: 1,
      activeContainerQueryCount: 1,
    });
  });

  it("rejects duplicate media feature identities and fabricated container status", () => {
    const feature = {
      id: "hover",
      query: "(hover: hover)",
      matches: true,
      availability: "observed" as const,
    };
    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:duplicate-feature",
        environment: { ...baseEnvironment(), mediaFeatures: [feature, feature] },
      }),
    ).toThrow(/duplicate media feature id/);

    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:fabricated-container",
        environment: baseEnvironment(),
        containerQueries: [
          {
            id: "container:fabricated",
            condition: "(width > 10px)",
            active: true,
            activeAvailability: "unavailable",
            affectedProperties: [],
            affectedSourceNodeIds: [],
          },
        ],
      }),
    ).toThrow(/must not fabricate active/);
  });

  it("converts observed runtime environment and responsive metadata to IR shapes", () => {
    const capture = createEnvironmentCapture({
      adapter: "cdp",
      snapshotId: "snapshot:desktop",
      environment: baseEnvironment(),
      mediaRules: [
        {
          id: "media:1",
          query: "(prefers-color-scheme: dark)",
          active: true,
          activeInSnapshotIds: [],
          affectedProperties: ["color"],
          affectedSourceNodeIds: ["node:text"],
        },
      ],
      containers: [
        { sourceNodeId: "node:container", containerName: "card", containerType: "inline-size" },
      ],
      containerQueries: [
        {
          id: "container:1",
          containerName: "card",
          condition: "(width > 40rem)",
          affectedProperties: ["display"],
          affectedSourceNodeIds: ["node:text"],
        },
      ],
    });

    expect(toWtfCaptureEnvironment(capture)).toMatchObject({
      id: "environment:snapshot:desktop",
      colorScheme: "dark",
      reducedMotion: true,
      pageZoom: 1.25,
    });
    expect(toWtfMediaRuleTraces(capture)).toEqual([
      {
        query: "(prefers-color-scheme: dark)",
        activeInSnapshotIds: ["snapshot:desktop"],
        affectedProperties: ["color"],
      },
    ]);
    expect(
      toWtfContainerQueryInfo(capture, (id) => (id === "node:text" ? "stable:text" : undefined)),
    ).toEqual([
      {
        containerName: "card",
        containerType: "inline-size",
        conditions: ["(width > 40rem)"],
        affectedStableNodeIds: ["stable:text"],
      },
    ]);
  });

  it("does not fabricate a portable pageZoom when Standard evidence is unavailable", () => {
    const capture = createEnvironmentCapture({
      adapter: "standard",
      snapshotId: "snapshot:standard",
      environment: baseEnvironment(undefined, "unavailable"),
    });
    expect(toWtfCaptureEnvironment(capture)).toBeNull();
  });

  it("rejects duplicate rule identities and invalid observed zoom evidence", () => {
    const media = {
      id: "media:1",
      query: "(min-width: 1px)",
      active: true,
      activeInSnapshotIds: [] as string[],
      affectedProperties: [] as string[],
      affectedSourceNodeIds: [] as string[],
    };
    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:1",
        environment: baseEnvironment(),
        mediaRules: [media, media],
      }),
    ).toThrow(/duplicate media rule id/);

    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:1",
        environment: baseEnvironment(undefined, "observed"),
      }),
    ).toThrow(/observed page zoom requires a value/);
  });
});
