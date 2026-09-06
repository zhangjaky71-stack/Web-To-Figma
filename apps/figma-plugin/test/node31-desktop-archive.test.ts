import { describe, expect, it } from "vitest";
import { createNode31DesktopEvidenceArchive } from "../src/node31-desktop-archive.js";

describe("createNode31DesktopEvidenceArchive", () => {
  it("keeps evidence bytes, hashes and filenames together in one portable JSON archive", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const archive = createNode31DesktopEvidenceArchive({
      sampleId: "landing-page",
      sourceSha256: "a".repeat(64),
      files: [
        {
          name: "landing-page.measurement.json",
          mediaType: "application/json",
          bytes,
          sha256: "b".repeat(64),
        },
      ],
    });

    expect(archive.evidenceType).toBe("node31-figma-desktop-evidence-archive");
    expect(archive.files).toHaveLength(1);
    expect(archive.files[0]).toMatchObject({
      name: "landing-page.measurement.json",
      byteLength: 4,
      sha256: "b".repeat(64),
    });
    const decoded = atob(archive.files[0]!.base64);
    expect(Array.from(decoded, (character) => character.charCodeAt(0))).toEqual([1, 2, 3, 4]);
  });

  it("rejects duplicate evidence filenames", () => {
    const file = {
      name: "same.json",
      mediaType: "application/json",
      bytes: new Uint8Array([1]),
      sha256: "c".repeat(64),
    };
    expect(() =>
      createNode31DesktopEvidenceArchive({
        sampleId: "sample",
        sourceSha256: "a".repeat(64),
        files: [file, file],
      }),
    ).toThrow(/duplicate evidence filename/);
  });
});
