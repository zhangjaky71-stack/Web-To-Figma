import { describe, expect, it } from "vitest";
import { getBrowserExtensionAppId, getBrowserWtfSchemaVersion } from "../src/index.js";

describe("browser extension foundation", () => {
  it("exposes a stable app id", () => {
    expect(getBrowserExtensionAppId()).toBe("w2f-browser-extension");
  });

  it("uses the shared W2F V2 schema", () => {
    expect(getBrowserWtfSchemaVersion()).toBe("2.0.0");
  });
});
