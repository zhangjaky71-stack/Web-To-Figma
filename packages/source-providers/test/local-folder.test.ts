import { describe, expect, it } from "vitest";
import { LocalFolderProvider, SourceProviderError } from "../src/index.js";

const selection = {
  rootId: "folder-123",
  rootName: "offline-site",
  documentPath: "pages/index.html",
  entries: [
    { relativePath: "pages/index.html", mediaType: "text/html" },
    { relativePath: "assets/logo.svg", mediaType: "image/svg+xml" },
    { relativePath: "styles/app.css", mediaType: "text/css" },
  ],
} as const;

describe("LocalFolderProvider", () => {
  it("requires an explicit local folder selection", () => {
    const provider = new LocalFolderProvider();
    expect(provider.getCapability({})).toMatchObject({
      supported: true,
      available: false,
      code: "missing-local-folder-selection",
      requiredUserAction: "choose-local-folder",
    });
  });

  it("opens a selected root without serializing an absolute operating-system path", () => {
    const provider = new LocalFolderProvider();
    const opened = provider.open(selection);
    expect(opened.descriptor).toEqual({
      provider: "local-folder",
      sourceType: "local-folder",
      sourceKey: "local-folder:folder-123",
      baseLocator: "local-folder://folder-123/pages/index.html",
      displayName: "offline-site",
      offline: true,
    });
  });

  it("resolves document-relative and root-relative entries inside the selected root", () => {
    const provider = new LocalFolderProvider();
    const opened = provider.open(selection);

    expect(provider.resolveReference("../assets/logo.svg#mark", opened)).toMatchObject({
      locator: "local-folder://folder-123/assets/logo.svg#mark",
      kind: "local-folder",
      localPath: "assets/logo.svg",
      exists: true,
    });
    expect(provider.resolveReference("/styles/app.css", opened)).toMatchObject({
      localPath: "styles/app.css",
      exists: true,
    });
  });

  it("reports missing local resources without escaping to network fallbacks", () => {
    const provider = new LocalFolderProvider();
    const opened = provider.open(selection);
    expect(provider.resolveReference("../assets/missing.png", opened)).toMatchObject({
      kind: "local-folder",
      localPath: "assets/missing.png",
      exists: false,
      resolvable: true,
    });
  });

  it("blocks path traversal outside the selected root", () => {
    const provider = new LocalFolderProvider();
    const opened = provider.open(selection);
    expect(() => provider.resolveReference("../../../../secret.txt", opened)).toThrow(
      SourceProviderError,
    );
  });

  it("preserves explicit remote resources as network references", () => {
    const provider = new LocalFolderProvider();
    const opened = provider.open(selection);
    expect(provider.resolveReference("https://cdn.example.com/app.css", opened)).toMatchObject({
      kind: "network",
      locator: "https://cdn.example.com/app.css",
      resolvable: true,
    });
  });

  it("rejects duplicate normalized entries", () => {
    const provider = new LocalFolderProvider();
    expect(
      provider.getCapability({
        rootId: "folder-1",
        rootName: "dup",
        documentPath: "index.html",
        entries: [{ relativePath: "index.html" }, { relativePath: "./index.html" }],
      }),
    ).toMatchObject({
      available: false,
      code: "invalid-local-folder-selection",
    });
  });
});
