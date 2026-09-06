import { describe, expect, it } from "vitest";
import { detectNode31FigmaDesktopHost } from "../src/node31-desktop-host.js";

describe("detectNode31FigmaDesktopHost", () => {
  it("accepts an Electron-backed desktop plugin UI", () => {
    expect(
      detectNode31FigmaDesktopHost({
        userAgent: "Mozilla/5.0 AppleWebKit/537.36 Electron/35.2.1 Safari/537.36",
        platform: "MacIntel",
      }).isDesktop,
    ).toBe(true);
  });

  it("rejects normal web Figma in Chrome", () => {
    const result = detectNode31FigmaDesktopHost({
      userAgent: "Mozilla/5.0 Chrome/147.0.0.0 Safari/537.36",
      platform: "MacIntel",
    });
    expect(result.isDesktop).toBe(false);
    expect(result.reason).toContain("Electron");
  });

  it("rejects automated browser user agents even when an Electron token is forged", () => {
    expect(
      detectNode31FigmaDesktopHost({
        userAgent: "Mozilla/5.0 HeadlessChrome/147 Electron/35.2.1",
        platform: "Linux x86_64",
      }).isDesktop,
    ).toBe(false);
  });
});
