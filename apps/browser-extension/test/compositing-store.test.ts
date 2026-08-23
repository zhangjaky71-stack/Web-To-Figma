import { describe, expect, it } from "vitest";
import {
  W2F_COMPOSITING_DB_NAME,
  W2F_COMPOSITING_KEY_PREFIX,
  W2F_COMPOSITING_STORE_NAME,
  compositingStorageKey,
} from "../src/runtime/compositing-store.js";

describe("Compositing store", () => {
  it("uses a dedicated deterministic IndexedDB namespace", () => {
    expect(W2F_COMPOSITING_DB_NAME).toBe("w2f-compositing");
    expect(W2F_COMPOSITING_STORE_NAME).toBe("captures");
    expect(W2F_COMPOSITING_KEY_PREFIX).toBe("compositing:");
    expect(compositingStorageKey("job-20")).toBe("compositing:job-20");
  });

  it("rejects empty job ids", () => {
    expect(() => compositingStorageKey(" ")).toThrow(/non-empty/);
  });
});
