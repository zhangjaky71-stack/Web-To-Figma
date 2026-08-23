import { describe, expect, it } from "vitest";
import {
  W2F_LAYOUT_ANALYSIS_DB_NAME,
  W2F_LAYOUT_ANALYSIS_KEY_PREFIX,
  W2F_LAYOUT_ANALYSIS_STORE_NAME,
  layoutAnalysisStorageKey,
} from "../src/runtime/layout-analysis-store.js";

describe("Base Layout Analysis store", () => {
  it("uses a dedicated deterministic IndexedDB namespace", () => {
    expect(W2F_LAYOUT_ANALYSIS_DB_NAME).toBe("w2f-layout-analysis");
    expect(W2F_LAYOUT_ANALYSIS_STORE_NAME).toBe("captures");
    expect(W2F_LAYOUT_ANALYSIS_KEY_PREFIX).toBe("layout-analysis:");
    expect(layoutAnalysisStorageKey("job-17")).toBe("layout-analysis:job-17");
  });

  it("rejects empty job ids", () => {
    expect(() => layoutAnalysisStorageKey("   ")).toThrow(/non-empty/);
  });
});
