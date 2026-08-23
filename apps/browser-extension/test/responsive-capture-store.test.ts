import { describe, expect, it } from "vitest";
import {
  W2F_RESPONSIVE_DB_NAME,
  W2F_RESPONSIVE_KEY_PREFIX,
  W2F_RESPONSIVE_STORE_NAME,
  responsiveCaptureStorageKey,
} from "../src/runtime/responsive-capture-store.js";

describe("Browser responsive capture store", () => {
  it("uses a dedicated versioned IndexedDB namespace", () => {
    expect(W2F_RESPONSIVE_DB_NAME).toBe("w2f-responsive-capture");
    expect(W2F_RESPONSIVE_STORE_NAME).toBe("captures");
    expect(W2F_RESPONSIVE_KEY_PREFIX).toBe("responsive:");
    expect(responsiveCaptureStorageKey(" job-15 ")).toBe("responsive:job-15");
  });

  it("rejects empty parent job identities", () => {
    expect(() => responsiveCaptureStorageKey("   ")).toThrow(/jobId must be non-empty/);
  });
});
