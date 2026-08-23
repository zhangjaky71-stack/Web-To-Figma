import { describe, expect, it } from "vitest";
import { sanitizeSvgText } from "../src/index.js";

describe("NODE-23 SVG sanitizer", () => {
  it("keeps data-only SVG with local fragment references", () => {
    const safe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><!-- remove --><rect clip-path="url(#c)" width="10" height="10"/></svg>`;
    const result = sanitizeSvgText(safe);
    expect(result).toContain("url(#c)");
    expect(result).not.toContain("<!--");
  });

  it.each([
    `<svg><script>alert(1)</script></svg>`,
    `<svg><foreignObject><div>html</div></foreignObject></svg>`,
    `<svg><rect onclick="alert(1)"/></svg>`,
    `<svg><image href="https://example.com/a.png"/></svg>`,
    `<svg><use href="javascript:alert(1)"/></svg>`,
    `<svg><rect style="fill:url(https://example.com/a.svg#x)"/></svg>`,
    `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`,
  ])("rejects active or externally referenced SVG", (value) => {
    expect(() => sanitizeSvgText(value)).toThrow(/WTF_PARSER_SVG_UNSAFE/);
  });
});
