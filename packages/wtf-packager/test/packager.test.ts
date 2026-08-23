import { describe, expect, it } from "vitest";
import { WTF_DEFAULT_ENTRYPOINTS, WTF_REQUIRED_PAYLOAD_PATHS } from "@w2f/w2f-schema";
import {
  crc32,
  packageWtf,
  summarizeWtfPackage,
  wtfFilename,
  type WtfPackageJsonPayload,
  type WtfPackagerInput,
} from "../src/index.js";

function requiredPayloads(): WtfPackageJsonPayload[] {
  const roles: Record<string, string> = {
    [WTF_DEFAULT_ENTRYPOINTS.document]: "document",
    [WTF_DEFAULT_ENTRYPOINTS.sourceGraph]: "source-graph",
    [WTF_DEFAULT_ENTRYPOINTS.renderTree]: "render-tree",
    [WTF_DEFAULT_ENTRYPOINTS.styles]: "styles",
    [WTF_DEFAULT_ENTRYPOINTS.assets]: "assets-index",
    [WTF_DEFAULT_ENTRYPOINTS.responsive]: "responsive",
    [WTF_DEFAULT_ENTRYPOINTS.states]: "states",
    [WTF_DEFAULT_ENTRYPOINTS.diagnostics]: "diagnostics",
    [WTF_DEFAULT_ENTRYPOINTS.tokens]: "token-graph",
    [WTF_DEFAULT_ENTRYPOINTS.sourceCascade]: "source-cascade",
    [WTF_DEFAULT_ENTRYPOINTS.sourceMetadata]: "source-metadata",
  };
  return WTF_REQUIRED_PAYLOAD_PATHS.map((path) => ({
    path,
    role: roles[path] ?? "extension",
    json: { path, nested: { z: 2, a: 1 } },
  }));
}

function fixture(overrides: Partial<WtfPackagerInput> = {}): WtfPackagerInput {
  return {
    filenameBase: "Example Page",
    identity: {
      documentId: "doc_fixture",
      captureId: "cap_fixture",
      sourceFingerprint: "a".repeat(64),
      capturedAt: "2026-08-23T00:00:00.000Z",
      revisionId: "rev_fixture",
    },
    captureTarget: { type: "document" },
    compatibility: {
      writerVersion: "1.0.0",
      minReaderVersion: "1.0.0",
      capabilities: ["render-tree", "source-tree", "canonical-json"],
    },
    features: {
      required: ["source-graph", "render-tree", "precise-geometry"],
      optional: ["token-graph"],
    },
    payloads: requiredPayloads(),
    ...overrides,
  };
}

function localZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 4 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    expect(method).toBe(0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const path = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    result.set(path, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return result;
}

describe("WTF Packager", () => {
  it("builds canonical manifest/checksums and deterministic ZIP bytes", async () => {
    const input = fixture({
      payloads: [
        ...requiredPayloads(),
        {
          path: "assets/abc.png",
          role: "asset",
          mediaType: "image/png",
          bytes: Uint8Array.from([137, 80, 78, 71, 1, 2, 3]),
        },
      ],
    });
    const first = await packageWtf(input);
    const second = await packageWtf(input);

    expect(second.bytes).toEqual(first.bytes);
    expect(second.sha256).toBe(first.sha256);
    expect(first.filename).toBe("Example Page.wtf");
    expect(first.mimeType).toBe("application/x-wtf");
    expect(first.manifest.files.map((file) => file.path)).toEqual(
      [...input.payloads].map((item) => item.path).sort(),
    );
    expect(first.manifest.files.some((file) => file.path === "manifest.json")).toBe(false);
    expect(Object.keys(first.checksums.files).sort()).toEqual(
      first.manifest.files.map((file) => file.path).sort(),
    );

    const entries = localZipEntries(first.bytes);
    expect(entries.has("manifest.json")).toBe(true);
    expect(entries.has("checksums.json")).toBe(true);
    expect(entries.has("assets/abc.png")).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(entries.get("manifest.json")))).toEqual(first.manifest);
    expect(JSON.parse(new TextDecoder().decode(entries.get("checksums.json")))).toEqual(first.checksums);
    expect(summarizeWtfPackage(first)).toMatchObject({
      payloadCount: input.payloads.length,
      archiveEntryCount: input.payloads.length + 2,
      assetPayloadCount: 1,
      binaryPayloadCount: 1,
    });
  });

  it("canonicalizes JSON object key order before hashing", async () => {
    const left = requiredPayloads();
    const right = requiredPayloads();
    left[0] = { ...left[0]!, json: { b: 2, a: 1 } };
    right[0] = { ...right[0]!, json: { a: 1, b: 2 } };
    const a = await packageWtf(fixture({ payloads: left }));
    const b = await packageWtf(fixture({ payloads: right }));
    expect(b.bytes).toEqual(a.bytes);
    expect(b.sha256).toBe(a.sha256);
  });

  it("rejects missing, duplicate, reserved and traversal payload paths", async () => {
    await expect(packageWtf(fixture({ payloads: requiredPayloads().slice(1) }))).rejects.toThrow(
      "required payload missing",
    );
    const duplicate = requiredPayloads();
    duplicate.push({ ...duplicate[0]! });
    await expect(packageWtf(fixture({ payloads: duplicate }))).rejects.toThrow("duplicate payload path");
    await expect(
      packageWtf(
        fixture({
          payloads: [...requiredPayloads(), { path: "manifest.json", role: "extension", json: {} }],
        }),
      ),
    ).rejects.toThrow("reserved container entry");
    await expect(
      packageWtf(
        fixture({ payloads: [...requiredPayloads(), { path: "../evil", role: "extension", json: {} }] }),
      ),
    ).rejects.toThrow("invalid portable payload path");
  });

  it("normalizes download filenames without changing archive content semantics", () => {
    expect(wtfFilename("  My:Page?.wtf  ")).toBe("My-Page-.wtf");
    expect(wtfFilename("   ")).toBe("document.wtf");
  });

  it("computes standard CRC32 values used by ZIP headers", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
