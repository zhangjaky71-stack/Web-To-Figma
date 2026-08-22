import { describe, expect, it } from "vitest";
import {
  createCaptureJob,
  isCaptureJobState,
  isTerminalJobStatus,
  transitionCaptureJob,
} from "../src/runtime/job-state.js";
import type { RegionSelectionResult } from "../src/runtime/region-selection.js";

describe("browser capture job state", () => {
  it("creates deterministic queued state from supplied job identity and time", () => {
    const job = createCaptureJob("full-page", "job_fixture", "2026-08-22T10:00:00+08:00");
    expect(job).toEqual({
      jobId: "job_fixture",
      mode: "full-page",
      status: "queued",
      phase: "queued",
      createdAt: "2026-08-22T02:00:00.000Z",
      updatedAt: "2026-08-22T02:00:00.000Z",
    });
    expect(isCaptureJobState(job)).toBe(true);
  });

  it("preserves source, page and region evidence across transitions", () => {
    const queued = createCaptureJob("region", "job_region", "2026-08-22T02:00:00.000Z");
    const source = {
      provider: "http-page",
      sourceType: "http",
      sourceUrl: "https://example.com/",
      baseLocator: "https://example.com/",
      displayName: "Example",
      offline: false,
    } as const;
    const running = transitionCaptureJob(
      queued,
      "running",
      "selecting-region",
      "2026-08-22T02:00:01.000Z",
      { tabId: 42, source },
    );
    const region: RegionSelectionResult = {
      version: "1.0.0",
      coordinateSpace: "document-css-px",
      mode: "free-rect",
      bounds: { x: 100.25, y: 220.5, width: 640.75, height: 480.25 },
      viewportBounds: { x: 100.25, y: 60.5, width: 640.75, height: 480.25 },
      selectionRoot: {
        kind: "document",
        bounds: { x: 0, y: 0, width: 1440, height: 3200 },
        clip: { x: 100.25, y: 220.5, width: 640.75, height: 480.25 },
      },
      exclusions: [
        {
          id: "region_1",
          kind: "redact",
          bounds: { x: 180, y: 280, width: 220, height: 60 },
        },
      ],
    };
    const completed = transitionCaptureJob(
      running,
      "completed",
      "region-selection-complete",
      "2026-08-22T02:00:02.000Z",
      {
        page: {
          url: "https://example.com/",
          title: "Fixture",
          documentWidth: 1440,
          documentHeight: 3200,
          viewportWidth: 1440,
          viewportHeight: 900,
          devicePixelRatio: 2,
        },
        region,
      },
    );

    expect(completed.tabId).toBe(42);
    expect(completed.source).toEqual(source);
    expect(completed.page?.documentHeight).toBe(3200);
    expect(completed.region).toEqual(region);
    expect(isCaptureJobState(completed)).toBe(true);
    expect(isTerminalJobStatus(completed.status)).toBe(true);
  });

  it("rejects malformed persisted source descriptors and region evidence", () => {
    const job = createCaptureJob("region", "job_guard", "2026-08-22T02:00:00.000Z");
    expect(isCaptureJobState({ ...job, source: { provider: "file-tab" } })).toBe(false);
    expect(
      isCaptureJobState({
        ...job,
        region: {
          version: "1.0.0",
          coordinateSpace: "document-css-px",
          mode: "free-rect",
          bounds: { x: 0, y: 0, width: 0, height: 20 },
        },
      }),
    ).toBe(false);
  });

  it("rejects transitions after a terminal state", () => {
    const queued = createCaptureJob("full-page", "job_terminal", "2026-08-22T02:00:00.000Z");
    const failed = transitionCaptureJob(queued, "failed", "fixture-failure");
    expect(() => transitionCaptureJob(failed, "running", "invalid-restart")).toThrow(
      "cannot transition terminal job",
    );
  });
});
