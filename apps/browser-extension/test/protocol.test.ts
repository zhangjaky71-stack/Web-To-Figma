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
  it("accepts only the frozen shell plus NODE-06 source capability vocabulary", () => {
    expect(isW2fShellRequest({ type: "W2F_GET_SOURCE_CAPABILITY" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_GET_JOB_STATE" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_START_JOB", mode: "full-page" })).toBe(true);
    expect(isW2fShellRequest({ type: "W2F_START_JOB", mode: "unsupported" })).toBe(false);
    expect(isW2fShellRequest({ type: "W2F_CANCEL_JOB", jobId: "" })).toBe(false);
    expect(isW2fShellRequest({ type: "W2F_CAPTURE_INTERNAL_PAGE" })).toBe(false);
  });

  it("validates content probe results before the service worker consumes them", () => {
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_PROBE_RESULT",
        jobId: "job_1",
        page: {
          url: "https://example.com/",
          title: "Fixture",
          documentWidth: 1200,
          documentHeight: 2400,
          viewportWidth: 1200,
          viewportHeight: 800,
          devicePixelRatio: 2,
        },
      }),
    ).toBe(true);
    expect(
      isW2fContentResponse({
        type: "W2F_CONTENT_PROBE_RESULT",
        jobId: "job_1",
        page: { documentWidth: Number.NaN },
      }),
    ).toBe(false);
  });

  it("uses typed success/failure envelopes for source capability and shell state", () => {
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
      captureImplemented: false,
    });
    const failure = shellFailure("W2F_START_JOB", new Error("fixture failure"));
    expect(isW2fShellResponse(success)).toBe(true);
    expect(isW2fShellResponse(shellInfo)).toBe(true);
    expect(isW2fShellResponse(failure)).toBe(true);
    expect(failure).toMatchObject({ ok: false, error: "fixture failure" });
  });
});
