import { describe, expect, it } from "vitest";
import {
  isSensitiveCapturedAttribute,
  sanitizeCapturedAttributes,
  sanitizeCapturedUrl,
} from "../src/index.js";

describe("Standard capture privacy", () => {
  it("removes protected form/auth attributes", () => {
    expect(isSensitiveCapturedAttribute("input", "value")).toBe(true);
    expect(isSensitiveCapturedAttribute("div", "data-auth-token")).toBe(true);
    expect(isSensitiveCapturedAttribute("div", "onclick")).toBe(true);
    expect(isSensitiveCapturedAttribute("img", "src")).toBe(false);
  });

  it("removes credentials and sensitive query values from captured URLs", () => {
    const sanitized = sanitizeCapturedUrl(
      "https://alice:secret@example.com/a?token=abc&theme=dark&session_id=def",
      "https://example.com/",
    );
    expect(sanitized).toBe("https://example.com/a?theme=dark");
  });

  it("sanitizes attributes without reading runtime form values", () => {
    expect(
      sanitizeCapturedAttributes(
        "input",
        [
          { name: "type", value: "text" },
          { name: "value", value: "secret user text" },
          { name: "data-api-key", value: "secret" },
          { name: "formaction", value: "/submit?token=abc&mode=save" },
        ],
        "https://example.com/form",
      ),
    ).toEqual({
      type: "text",
      formaction: "https://example.com/submit?mode=save",
    });
  });
});
