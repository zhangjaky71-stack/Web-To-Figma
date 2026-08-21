import { describe, expect, it } from "vitest";
import { getBrowserExtensionAppId } from "../src/index.js";

describe("browser extension foundation", () => {
  it("exposes a stable app id", () => {
    expect(getBrowserExtensionAppId()).toBe("w2f-browser-extension");
  });
});
