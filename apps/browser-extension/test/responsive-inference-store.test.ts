import { describe, expect, it } from "vitest";
import {
  W2F_RESPONSIVE_INFERENCE_DB_NAME,
  W2F_RESPONSIVE_INFERENCE_KEY_PREFIX,
  W2F_RESPONSIVE_INFERENCE_STORE_NAME,
  responsiveInferenceStorageKey,
} from "../src/runtime/responsive-inference-store.js";

describe("Responsive Inference store", () => {
  it("uses a dedicated IndexedDB namespace", () => {
    expect(W2F_RESPONSIVE_INFERENCE_DB_NAME).toBe("w2f-responsive-inference");
    expect(W2F_RESPONSIVE_INFERENCE_STORE_NAME).toBe("captures");
    expect(W2F_RESPONSIVE_INFERENCE_KEY_PREFIX).toBe("responsive-inference:");
  });

  it("builds deterministic storage keys", () => {
    expect(responsiveInferenceStorageKey("job_16")).toBe("responsive-inference:job_16");
    expect(() => responsiveInferenceStorageKey("  ")).toThrow(/jobId must be non-empty/);
  });
});
