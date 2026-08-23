import { describe, expect, it } from "vitest";
import {
  W2F_ASSET_DB_NAME,
  W2F_ASSET_KEY_PREFIX,
  W2F_ASSET_STORE_NAME,
  assetStorageKey,
} from "../src/runtime/asset-store.js";

describe("Browser asset store", () => {
  it("uses a dedicated versioned IndexedDB namespace", () => {
    expect(W2F_ASSET_DB_NAME).toBe("w2f-assets");
    expect(W2F_ASSET_STORE_NAME).toBe("captures");
    expect(W2F_ASSET_KEY_PREFIX).toBe("assets:");
    expect(assetStorageKey(" job-13 ")).toBe("assets:job-13");
  });

  it("rejects empty job identities", () => {
    expect(() => assetStorageKey("   ")).toThrow(/jobId must be non-empty/);
  });
});
