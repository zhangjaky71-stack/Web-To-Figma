import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveActiveTabSource } from "../src/runtime/source-runtime.js";

const fileUrl = "file:///tmp/node31-file-source.html";
const fileTab = {
  id: 31,
  url: fileUrl,
  title: "NODE-31 File Source",
  windowId: 7,
} as unknown as chrome.tabs.Tab;

function installChromeMock(fileSchemeAccess: boolean) {
  const query = vi.fn().mockResolvedValue([fileTab]);
  const contains = vi.fn().mockResolvedValue(fileSchemeAccess);

  vi.stubGlobal("chrome", {
    tabs: { query },
    permissions: { contains },
  });

  return { query, contains };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveActiveTabSource file permission", () => {
  it("fails closed when the active file host permission is disabled", async () => {
    const { query, contains } = installChromeMock(false);

    const result = await resolveActiveTabSource();

    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(contains).toHaveBeenCalledWith({ origins: ["file:///*"] });
    expect(result.capability).toMatchObject({
      provider: "file-tab",
      supported: true,
      available: false,
      code: "file-scheme-access-disabled",
      requiredUserAction: "enable-file-url-access",
    });
    expect(result.descriptor).toBeUndefined();
  });

  it("resolves the file source only when the active file host permission is enabled", async () => {
    const { contains } = installChromeMock(true);

    const result = await resolveActiveTabSource();

    expect(contains).toHaveBeenCalledWith({ origins: ["file:///*"] });
    expect(result.capability).toMatchObject({
      provider: "file-tab",
      supported: true,
      available: true,
      code: "ready",
    });
    expect(result.descriptor).toMatchObject({
      sourceType: "file",
      sourceUrl: fileUrl,
      offline: true,
    });
  });

  it("uses the sender tab directly without consulting window focus", async () => {
    const { query, contains } = installChromeMock(true);

    const result = await resolveActiveTabSource(fileTab);

    expect(query).not.toHaveBeenCalled();
    expect(contains).toHaveBeenCalledWith({ origins: ["file:///*"] });
    expect(result.tabId).toBe(31);
    expect(result.tab.url).toBe(fileUrl);
    expect(result.capability).toMatchObject({
      provider: "file-tab",
      available: true,
      code: "ready",
    });
  });
});
