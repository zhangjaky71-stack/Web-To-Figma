import { describe, expect, it } from "vitest";
import {
  W2F_EXTENSION_SHELL_VERSION,
  isW2fContentResponse,
  isW2fShellRequest,
  isW2fShellResponse,
  shellFailure,
  shellSuccess,
} from "../src/runtime/protocol.js";

describe("browser shell message protocol", () => {
  it("accepts the frozen shell plus source capability vocabulary", () => {
    expect(W2F_EXTENSION_SHELL_VERSION).toBe("1.2.0");
    expect(isW2fShellRequest({ type: "W2F_GET_SOURCE_CAPABILITY" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_GET_JOB_STATE" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_START_JOB", mode: "region" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_START_JOB", mode: "unsupported" })).toBe(false);
    expect(isW2fShellRequest({ type: "W2F_CANCEL_JOB", jobId: "" })).toBe(false);
    expect(isW2fShellRequest({ type: "W2F_CAPTURE_INTERNAL_PAGE" })).toBe(false);
  });

  it("validates page probe and region-selection content responses", () => {
    const page = {
      url: "https://example.com/",
      title: "Fixture",
      documentWidth: 1200,
      documentHeight: 2400,
      viewportWidth: 1200,
      viewportHeight: 800,
      devicePixelRatio: 2,
    };
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_PROBE_RESULT",
        jobId: "job_1",
        page,
      }),
    ).toBe(true);
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_REGION_RESULT",
        jobId: "job_region",
        page,
        region: {
          version: "1.0.0",
          coordinateSpace: "document-css-px",
          mode: "smart-element",
          bounds: { x: 100.25, y: 200.5, width: 500.75, height: 300.25 },
          viewportBounds: { x: 100.25, y: 40.5, width: 500.75, height: 300.25 },
          selectionRoot: {
            kind: "element",
            bounds: { x: 80, y: 180, width: 700, height: 700 },
            clip: { x: 100.25, y: 200.5, width: 500.75, height: 300.25 },
            tagName: "main",
          },
          exclusions: [
            {
              id: "region_1",
              kind: "redact",
              bounds: { x: 200, y: 260, width: 120, height: 40 },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_REGION_RESULT",
        jobId: "job_region",
        page,
        region: { version: "1.0.0", bounds: { x: 0, y: 0, width: 0, height: 0 } },
      }),
    ).toBe(false);
    expect(
      isW2fContentResponse({ type: "W2F_CONTENT_SELECTION_CANCELLED", jobId: "job_region" }),
    ).toBe(true);
  });

  it("rejects malformed page probe results", () => {
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_PROBE_RESULT",
        jobId: "job_1",
        page: { documentWidth: Number.NaN },
      }),
    ).toBe(false);
  });

  it("reports the Standard DOM capture capability through shell info", () => {
    const success = shellSuccess("W2F_GET_SOURCE_CAPABILITY", {
      provider: "http-page",
      supported: true,
      available: true,
      code: "ready",
      reason: "fixture",
    });
    const shellInfo = shellSuccess("W2F_GET_SHELL_INFO", {
      shellVersion: W2F_EXTENSION_SHELL_VERSION,
      manifestVersion: 3,
      captureImplemented: true,
      standardCaptureImplemented: true,
      regionSelectionImplemented: true,
    });
    const failure = shellFailure("W2F_START_JOB", new Error("fixture failure"));
    expect(isW2fShellResponse(success)).toBe(true);
    expect(isW2fShellResponse(shellInfo)).toBe(true);
    expect(isW2fShellResponse(failure)).toBe(true);
    expect(failure).toMatchObject({ ok: false, error: "fixture failure" });
  });
});
