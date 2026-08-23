import { describe, expect, it } from "vitest";
import { createEnvironmentCapture } from "../src/index.js";

describe("NODE-12 additive environment compatibility", () => {
  it("normalizes missing additive media and container activity evidence without fabrication", () => {
    const capture = createEnvironmentCapture({
      adapter: "standard",
      snapshotId: "snapshot:legacy-v1",
      environment: {
        browserName: "Chrome",
        browserVersion: "140.0.0.0",
        platform: "Windows",
        language: "en-US",
        direction: "ltr",
        colorScheme: "light",
        reducedMotion: false,
        viewportWidth: 1280,
        viewportHeight: 720,
        dpr: 1,
        pageZoomAvailability: "unavailable",
        cssZoomAvailability: "unavailable",
      },
      containerQueries: [
        {
          id: "container:legacy",
          condition: "(width > 30rem)",
          affectedProperties: ["display"],
          affectedSourceNodeIds: ["node:card"],
        },
      ],
    });

    expect(capture.environment.mediaFeatures).toEqual([]);
    expect(capture.containerQueries[0]).toMatchObject({
      id: "container:legacy",
      activeAvailability: "unavailable",
    });
    expect(capture.containerQueries[0]?.active).toBeUndefined();
  });

  it("rejects a fabricated container-query activity boolean without observed availability", () => {
    expect(() =>
      createEnvironmentCapture({
        adapter: "standard",
        snapshotId: "snapshot:invalid",
        environment: {
          browserName: "Chrome",
          browserVersion: "140.0.0.0",
          platform: "Windows",
          language: "en-US",
          direction: "ltr",
          colorScheme: "light",
          reducedMotion: false,
          viewportWidth: 1280,
          viewportHeight: 720,
          dpr: 1,
          pageZoomAvailability: "unavailable",
          cssZoomAvailability: "unavailable",
        },
        containerQueries: [
          {
            id: "container:invalid",
            condition: "(width > 30rem)",
            active: true,
            affectedProperties: ["display"],
            affectedSourceNodeIds: ["node:card"],
          },
        ],
      }),
    ).toThrow(/must not fabricate active/);
  });
});
