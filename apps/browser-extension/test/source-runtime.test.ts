import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveActiveTabSource } from "../src/runtime/source-runtime.js";

const fileUrl = "file:///tmp/node31-file-source.html";

function installChromeMock(fileSchemeAccess: boolean) {
  const query = vi.fn().mockResolvedValue([
    {
      id: 31,
      url: fileUrl,
      title: "NODE-31 File Source",
      active: true,
      windowId: 7,
    },
  ]);
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
    const { contains } = installChromeMock(false);

    const result = await resolveActiveTabSource();

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
      title: "NODE-31 File Source",
    });
  });
});
