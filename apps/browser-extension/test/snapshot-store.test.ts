import { describe, expect, it } from "vitest";
import { snapshotStorageKey } from "../src/runtime/snapshot-store.js";

describe("RawSnapshot IndexedDB storage", () => {
  it("uses deterministic job-scoped storage keys", () => {
    expect(snapshotStorageKey("job_123")).toBe("raw-snapshot:job_123");
    expect(snapshotStorageKey("  job_123  ")).toBe("raw-snapshot:job_123");
  });

  it("rejects empty job identities", () => {
    expect(() => snapshotStorageKey("   ")).toThrow("jobId must be non-empty");
  });
});
