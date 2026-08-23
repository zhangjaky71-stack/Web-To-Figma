import { describe, expect, it } from "vitest";
import {
  W2F_RENDER_TREE_DB_NAME,
  W2F_RENDER_TREE_KEY_PREFIX,
  W2F_RENDER_TREE_STORE_NAME,
  renderTreeStorageKey,
} from "../src/runtime/render-tree-store.js";

describe("Render Tree store", () => {
  it("uses a dedicated deterministic IndexedDB namespace", () => {
    expect(W2F_RENDER_TREE_DB_NAME).toBe("w2f-render-tree");
    expect(W2F_RENDER_TREE_STORE_NAME).toBe("captures");
    expect(W2F_RENDER_TREE_KEY_PREFIX).toBe("render-tree:");
    expect(renderTreeStorageKey("job-19")).toBe("render-tree:job-19");
  });

  it("rejects empty job ids", () => {
    expect(() => renderTreeStorageKey("   ")).toThrow(/non-empty/);
  });
});
