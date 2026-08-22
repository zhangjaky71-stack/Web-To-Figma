import { describe, expect, it } from "vitest";
import {
  W2F_REFERENCE_SCREENSHOT_STORE_NAME,
  W2F_SNAPSHOT_DB_VERSION,
  W2F_SNAPSHOT_STORE_NAME,
  referenceScreenshotStorageKey,
  snapshotStorageKey,
} from "../src/runtime/snapshot-store.js";

describe("capture evidence IndexedDB storage", () => {
  it("uses deterministic job-scoped storage keys", () => {
    expect(snapshotStorageKey("job_123")).toBe("raw-snapshot:job_123");
    expect(snapshotStorageKey("  job_123  ")).toBe("raw-snapshot:job_123");
    expect(referenceScreenshotStorageKey("job_123")).toBe("reference-screenshot:job_123");
  });

  it("keeps snapshot and CDP screenshot evidence in separate stores", () => {
    expect(W2F_SNAPSHOT_DB_VERSION).toBe(2);
    expect(W2F_SNAPSHOT_STORE_NAME).toBe("rawSnapshots");
    expect(W2F_REFERENCE_SCREENSHOT_STORE_NAME).toBe("referenceScreenshots");
  });

  it("rejects empty job identities", () => {
    expect(() => snapshotStorageKey("   ")).toThrow("jobId must be non-empty");
    expect(() => referenceScreenshotStorageKey("   ")).toThrow("jobId must be non-empty");
  });
});
