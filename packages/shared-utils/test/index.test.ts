import { describe, expect, it } from "vitest";
import { WTF_FILE_EXTENSION, WTF_MIME_TYPE, isWtfFileName } from "../src/index.js";

describe("portable file constants", () => {
  it("uses the frozen .wtf contract", () => {
    expect(WTF_FILE_EXTENSION).toBe(".wtf");
    expect(WTF_MIME_TYPE).toBe("application/x-wtf");
  });

  it("matches .wtf file names case-insensitively", () => {
    expect(isWtfFileName("capture.wtf")).toBe(true);
    expect(isWtfFileName("capture.WTF")).toBe(true);
    expect(isWtfFileName("capture.w2f")).toBe(false);
  });
});
