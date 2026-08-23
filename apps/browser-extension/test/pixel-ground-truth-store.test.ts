import { describe, expect, it } from "vitest";
import {
  W2F_PIXEL_DB_NAME,
  W2F_PIXEL_KEY_PREFIX,
  W2F_PIXEL_STORE_NAME,
  pixelGroundTruthStorageKey,
} from "../src/runtime/pixel-ground-truth-store.js";

describe("Browser Pixel Ground Truth store", () => {
  it("uses a dedicated versioned IndexedDB namespace", () => {
    expect(W2F_PIXEL_DB_NAME).toBe("w2f-pixel-ground-truth");
    expect(W2F_PIXEL_STORE_NAME).toBe("captures");
    expect(W2F_PIXEL_KEY_PREFIX).toBe("pixel-ground-truth:");
    expect(pixelGroundTruthStorageKey(" job-14 ")).toBe("pixel-ground-truth:job-14");
  });

  it("rejects empty job identities", () => {
    expect(() => pixelGroundTruthStorageKey("   ")).toThrow(/jobId must be non-empty/);
  });
});
