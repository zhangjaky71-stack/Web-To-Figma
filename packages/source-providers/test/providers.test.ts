import { describe, expect, it } from "vitest";
import {
  FileTabProvider,
  HttpPageProvider,
  getTabSourceCapability,
  resolveTabSource,
} from "../src/index.js";

describe("HttpPageProvider", () => {
  it("opens HTTP(S) pages and removes serialized credentials", () => {
    const provider = new HttpPageProvider();
    const capability = provider.getCapability({ url: "https://example.com/app/index.html" });
    expect(capability.available).toBe(true);

    const source = provider.open({
      url: "https://user:secret@example.com/app/index.html?mode=1#state",
      title: "Example",
    });
    expect(source.sourceType).toBe("http");
    expect(source.sourceUrl).toBe("https://example.com/app/index.html?mode=1#state");
    expect(source.offline).toBe(false);
  });

  it("resolves relative network references and rejects javascript execution URLs", () => {
    const provider = new HttpPageProvider();
    const source = provider.open({ url: "https://example.com/app/pages/index.html" });
    expect(provider.resolveReference("../assets/logo.svg", source)).toMatchObject({
      locator: "https://example.com/app/assets/logo.svg",
      kind: "network",
      resolvable: true,
    });
    expect(provider.resolveReference("javascript:alert(1)", source)).toMatchObject({
      kind: "unsupported",
      resolvable: false,
    });
  });
});

describe("FileTabProvider", () => {
  it("reports the Chrome file-access user action instead of pretending access exists", () => {
    const provider = new FileTabProvider();
    expect(
      provider.getCapability({
        url: "file:///Users/example/site/index.html",
        fileSchemeAccess: false,
      }),
    ).toMatchObject({
      supported: true,
      available: false,
      code: "file-scheme-access-disabled",
      requiredUserAction: "enable-file-url-access",
    });
  });

  it("opens file tabs only after file access is enabled and resolves relative files", () => {
    const provider = new FileTabProvider();
    const source = provider.open({
      url: "file:///Users/example/site/pages/index.html",
      title: "Offline page",
      fileSchemeAccess: true,
    });
    expect(source.offline).toBe(true);
    expect(provider.resolveReference("../styles/app.css", source)).toMatchObject({
      locator: "file:///Users/example/site/styles/app.css",
      kind: "file",
      resolvable: true,
    });
  });
});

describe("tab provider registry", () => {
  it("chooses HTTP and file providers deterministically", () => {
    expect(
      resolveTabSource({ url: "https://example.com", title: "HTTP", fileSchemeAccess: false }),
    ).toMatchObject({ capability: { provider: "http-page", available: true } });
    expect(
      resolveTabSource({
        url: "file:///tmp/index.html",
        title: "File",
        fileSchemeAccess: true,
      }),
    ).toMatchObject({ capability: { provider: "file-tab", available: true } });
  });

  it("keeps browser-internal schemes fail-visible", () => {
    expect(
      getTabSourceCapability({ url: "chrome://extensions/", fileSchemeAccess: false }),
    ).toMatchObject({
      supported: false,
      available: false,
      code: "unsupported-scheme",
    });
  });
});
