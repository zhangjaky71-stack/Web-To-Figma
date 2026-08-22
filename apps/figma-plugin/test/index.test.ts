import { describe, expect, it } from "vitest";
import { getFigmaPluginAppId } from "../src/index.js";

describe("figma plugin foundation", () => {
  it("exposes a stable app id", () => {
    expect(getFigmaPluginAppId()).toBe("w2f-figma-plugin");
  });
});
