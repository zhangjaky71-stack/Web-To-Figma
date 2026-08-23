import { describe, expect, it } from "vitest";
import {
  isStoredWtfPackage,
  wtfPackageStorageKey,
  W2F_WTF_PACKAGE_DB_NAME,
} from "../src/runtime/wtf-package-store.js";

describe("WTF package store", () => {
  it("uses a dedicated deterministic namespace", () => {
    expect(W2F_WTF_PACKAGE_DB_NAME).toBe("w2f-wtf-packages");
    expect(wtfPackageStorageKey("job-21")).toBe("wtf-package:job-21");
    expect(() => wtfPackageStorageKey("   ")).toThrow(/non-empty/);
  });

  it("validates persisted package metadata against bytes", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const sha256 = "a".repeat(64);
    expect(
      isStoredWtfPackage({
        version: "1.0.0",
        jobId: "job-21",
        filename: "page.wtf",
        mimeType: "application/x-wtf",
        sha256,
        summary: {
          version: "1.0.0",
          filename: "page.wtf",
          payloadCount: 11,
          archiveEntryCount: 13,
          archiveByteCount: bytes.byteLength,
          jsonPayloadCount: 11,
          binaryPayloadCount: 0,
          assetPayloadCount: 0,
          referencePayloadCount: 0,
          fallbackPayloadCount: 0,
          archiveSha256: sha256,
        },
        bytes,
      }),
    ).toBe(true);
  });
});
