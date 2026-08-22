import { describe, expect, it } from "vitest";
import {
  getFigmaPluginAppId,
  getFigmaWtfIrVersion,
  getFigmaWtfSchemaVersion,
} from "../src/index.js";

describe("figma plugin foundation", () => {
  it("exposes a stable app id", () => {
    expect(getFigmaPluginAppId()).toBe("w2f-figma-plugin");
  });

  it("uses the shared W2F V2 schema", () => {
    expect(getFigmaWtfSchemaVersion()).toBe("2.0.0");
  });

  it("uses the shared W2F V2 semantic IR", () => {
    expect(getFigmaWtfIrVersion()).toBe("2.0.0");
  });
});
