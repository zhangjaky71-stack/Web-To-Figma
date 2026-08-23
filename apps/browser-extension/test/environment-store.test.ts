import { describe, expect, it } from "vitest";
import {
  W2F_ENVIRONMENT_DB_NAME,
  W2F_ENVIRONMENT_KEY_PREFIX,
  W2F_ENVIRONMENT_STORE_NAME,
  environmentStorageKey,
} from "../src/runtime/environment-store.js";

describe("Browser environment store", () => {
  it("keeps a separate versioned sidecar namespace", () => {
    expect(W2F_ENVIRONMENT_DB_NAME).toBe("w2f-environment");
    expect(W2F_ENVIRONMENT_STORE_NAME).toBe("captures");
    expect(W2F_ENVIRONMENT_KEY_PREFIX).toBe("environment:");
    expect(environmentStorageKey(" job-12 ")).toBe("environment:job-12");
  });

  it("rejects empty job identities", () => {
    expect(() => environmentStorageKey("   ")).toThrow(/jobId must be non-empty/);
  });
});
