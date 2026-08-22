import { describe, expect, it } from "vitest";
import { captureStandardSnapshotInPage, STANDARD_CAPTURE_ADAPTER_VERSION } from "../src/index.js";

describe("Standard capture adapter contract", () => {
  it("keeps the NODE-08 adapter version stable", () => {
    expect(STANDARD_CAPTURE_ADAPTER_VERSION).toBe("1.0.0");
  });

  it("contains the Standard-path evidence required by the frozen baseline", () => {
    const source = captureStandardSnapshotInPage.toString();
    for (const evidence of [
      "assignedNodes",
      "shadowRoot",
      "contentDocument",
      "getClientRects",
      "getComputedStyle",
      "scrollWidth",
      "STANDARD_CAPTURE_FRAME_INACCESSIBLE",
      "document-css-px",
    ]) {
      expect(source).toContain(evidence);
    }
  });

  it("does not read protected browser storage/cookie APIs", () => {
    const source = captureStandardSnapshotInPage.toString();
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
