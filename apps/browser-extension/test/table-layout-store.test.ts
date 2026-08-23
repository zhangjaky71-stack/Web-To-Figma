import { describe, expect, it } from "vitest";
import {
  W2F_TABLE_LAYOUT_DB_NAME,
  W2F_TABLE_LAYOUT_KEY_PREFIX,
  W2F_TABLE_LAYOUT_STORE_NAME,
  tableLayoutStorageKey,
} from "../src/runtime/table-layout-store.js";

describe("Table Layout store", () => {
  it("uses a dedicated deterministic IndexedDB namespace", () => {
    expect(W2F_TABLE_LAYOUT_DB_NAME).toBe("w2f-table-layout");
    expect(W2F_TABLE_LAYOUT_STORE_NAME).toBe("captures");
    expect(W2F_TABLE_LAYOUT_KEY_PREFIX).toBe("table-layout:");
    expect(tableLayoutStorageKey("job-18")).toBe("table-layout:job-18");
  });

  it("rejects empty job ids", () => {
    expect(() => tableLayoutStorageKey("   ")).toThrow(/non-empty/);
  });
});
