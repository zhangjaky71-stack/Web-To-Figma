import { describe, expect, it } from "vitest";
import {
  createEnvironmentCapture,
  isEnvironmentCapture,
  summarizeEnvironmentCapture,
  toWtfCaptureEnvironment,
  toWtfContainerQueryInfo,
  toWtfMediaRuleTraces,
} from "../src/index.js";

function baseEnvironment() {
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
    pageZoom: 1.25,
    pageZoomAvailability: "observed" as const,
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
    expect(isEnvironmentCapture(capture)).toBe(true);
    expect(summarizeEnvironmentCapture(capture)).toMatchObject({
      mediaRuleCount: 1,
      activeMediaRuleCount: 1,
      containerCount: 1,
      containerQueryCount: 1,
    });
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
    const environment = baseEnvironment();
    const { pageZoom: _pageZoom, ...withoutZoom } = environment;
    const capture = createEnvironmentCapture({
      adapter: "standard",
      snapshotId: "snapshot:standard",
      environment: {
        ...withoutZoom,
        pageZoomAvailability: "unavailable",
      },
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

    const environment = baseEnvironment();
    const { pageZoom: _pageZoom, ...withoutZoom } = environment;
    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:1",
        environment: withoutZoom,
      }),
    ).toThrow(/observed page zoom requires a value/);
  });
});
