import { describe, expect, it } from "vitest";
import {
  WTF_ASSET_CODEC_VERSION,
  WTF_CONTAINER_KIND,
  WTF_DEFAULT_ENTRYPOINTS,
  WTF_FORMAT_VERSION,
  WTF_HARD_SECURITY_LIMITS,
  WTF_KNOWN_FEATURES,
  WTF_MIME_TYPE,
  WTF_SCHEMA_VERSION,
  canonicalStringify,
  checkReaderCompatibility,
  isSha256,
  validateChecksums,
  validateContainerEntries,
  validatePortablePath,
  validateRect,
  validateTokenGraph,
  validateWtfManifest,
  type WtfContainerEntry,
  type WtfManifest,
} from "../src/index.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function createManifest(): WtfManifest {
  const files = Object.entries(WTF_DEFAULT_ENTRYPOINTS).map(([field, path], index) => ({
    path,
    role: field,
    mediaType: "application/json",
    sizeBytes: 100 + index,
    sha256: index % 2 === 0 ? HASH_A : HASH_B,
  }));

  return {
    kind: WTF_CONTAINER_KIND,
    compatibility: {
      formatVersion: WTF_FORMAT_VERSION,
      schemaVersion: WTF_SCHEMA_VERSION,
      writerVersion: "0.2.0",
      minReaderVersion: "0.2.0",
      assetCodecVersion: WTF_ASSET_CODEC_VERSION,
      capabilities: ["source-graph", "render-tree"],
    },
    identity: {
      documentId: "doc_fixture",
      captureId: "cap_fixture",
      revisionId: "rev_fixture",
      sourceFingerprint: HASH_A,
      capturedAt: "2026-08-22T08:00:00.000Z",
    },
    captureTarget: { type: "document" },
    entrypoints: { ...WTF_DEFAULT_ENTRYPOINTS },
    features: {
      required: ["source-graph", "render-tree", "precise-geometry"],
      optional: ["token-graph", "responsive-snapshots"],
    },
    files,
    security: {
      limits: { ...WTF_HARD_SECURITY_LIMITS },
    },
  };
}

function createContainerEntries(manifest: WtfManifest): WtfContainerEntry[] {
  return [
    {
      path: "manifest.json",
      mediaType: "application/json",
      uncompressedSize: 256,
      compressedSize: 128,
    },
    {
      path: "checksums.json",
      mediaType: "application/json",
      uncompressedSize: 256,
      compressedSize: 128,
    },
    ...manifest.files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      uncompressedSize: file.sizeBytes,
      compressedSize: Math.max(1, Math.ceil(file.sizeBytes / 2)),
    })),
  ];
}

describe("W2F file specification V2", () => {
  it("freezes the portable extension, MIME, versions, and V2.1 capability vocabulary", () => {
    expect(WTF_MIME_TYPE).toBe("application/x-wtf");
    expect(WTF_FORMAT_VERSION).toBe("2.0.0");
    expect(WTF_SCHEMA_VERSION).toBe("2.0.0");
    expect(WTF_KNOWN_FEATURES).toContain("token-graph");
    expect(WTF_KNOWN_FEATURES).toContain("structural-fingerprints");
    expect(WTF_KNOWN_FEATURES).toContain("revision-metadata");
    expect(WTF_KNOWN_FEATURES).toContain("scroll-roots");
    expect(WTF_KNOWN_FEATURES).toContain("composed-tree");
    expect(WTF_KNOWN_FEATURES).toContain("precise-geometry");
  });

  it("accepts a complete canonical V2 manifest", () => {
    const result = validateWtfManifest(createManifest());
    expect(result.ok).toBe(true);
  });

  it("allows unknown top-level metadata for forward-compatible readers", () => {
    const manifest = { ...createManifest(), futureProducerMetadata: { channel: "next" } };
    expect(validateWtfManifest(manifest).ok).toBe(true);
  });

  it("rejects incompatible major versions and missing core features", () => {
    const manifest = createManifest();
    const invalid = {
      ...manifest,
      compatibility: { ...manifest.compatibility, formatVersion: "3.0.0" },
      features: { required: ["source-graph"], optional: [] },
    };
    const result = validateWtfManifest(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("WTF_FORMAT_MAJOR_UNSUPPORTED");
      expect(result.errors.map((error) => error.code)).toContain("WTF_CORE_FEATURE_MISSING");
    }
  });

  it("rejects malformed hashes, duplicate payload paths, and reserved payload names", () => {
    const manifest = createManifest();
    const first = manifest.files[0];
    expect(first).toBeDefined();
    if (!first) return;
    const invalid = {
      ...manifest,
      files: [
        { ...first, sha256: "BAD" },
        { ...first },
        {
          path: "manifest.json",
          role: "extension",
          mediaType: "application/json",
          sizeBytes: 1,
          sha256: HASH_A,
        },
        ...manifest.files.slice(1),
      ],
    };
    const result = validateWtfManifest(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((error) => error.code);
      expect(codes).toContain("WTF_SHA256_INVALID");
      expect(codes).toContain("WTF_DUPLICATE_FILE");
      expect(codes).toContain("WTF_RESERVED_FILE_IN_PAYLOAD");
    }
  });

  it("prevents archive path traversal and non-portable Windows paths", () => {
    expect(validatePortablePath("assets/image.png").ok).toBe(true);
    expect(validatePortablePath("../secrets.txt").ok).toBe(false);
    expect(validatePortablePath("assets\\image.png").ok).toBe(false);
    expect(validatePortablePath("C:/temp/file.txt").ok).toBe(false);
  });

  it("validates archive inventory, entry sizes, and decompression ratio limits", () => {
    const manifest = createManifest();
    expect(validateContainerEntries(createContainerEntries(manifest), manifest).ok).toBe(true);

    const unsafe = createContainerEntries(manifest);
    unsafe.push({
      path: "../escape.bin",
      mediaType: "application/octet-stream",
      uncompressedSize: 500_000,
      compressedSize: 1,
    });
    const result = validateContainerEntries(unsafe, manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((error) => error.code);
      expect(codes).toContain("WTF_PATH_TRAVERSAL");
      expect(codes).toContain("WTF_COMPRESSION_RATIO_EXCEEDED");
      expect(codes).toContain("WTF_UNLISTED_ENTRY");
    }
  });

  it("rejects hidden payload entries that are not inventoried by the manifest", () => {
    const manifest = createManifest();
    const entries = createContainerEntries(manifest);
    entries.push({
      path: "hidden/data.json",
      mediaType: "application/json",
      uncompressedSize: 12,
      compressedSize: 12,
    });
    const result = validateContainerEntries(entries, manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("WTF_UNLISTED_ENTRY");
    }
  });

  it("requires checksums to cover exactly the manifest payload inventory", () => {
    const manifest = createManifest();
    const files = Object.fromEntries(manifest.files.map((file) => [file.path, file.sha256]));
    expect(validateChecksums({ algorithm: "sha256", files }, manifest).ok).toBe(true);

    const invalid = { ...files, "extra.bin": HASH_A };
    const result = validateChecksums({ algorithm: "sha256", files: invalid }, manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("WTF_CHECKSUM_EXTRA");
    }
  });

  it("enforces min reader version and required capability/feature support", () => {
    const manifest = createManifest();
    const supported = checkReaderCompatibility(manifest, {
      readerVersion: "0.2.0",
      supportedCapabilities: ["source-graph", "render-tree"],
      supportedFeatures: ["source-graph", "render-tree", "precise-geometry"],
    });
    expect(supported.compatible).toBe(true);

    const unsupported = checkReaderCompatibility(manifest, {
      readerVersion: "0.1.9",
      supportedCapabilities: ["source-graph"],
      supportedFeatures: ["source-graph"],
    });
    expect(unsupported.compatible).toBe(false);
    expect(unsupported.reasons).toContain("reader version is below minReaderVersion");
    expect(unsupported.reasons).toContain("unsupported required capability: render-tree");
  });

  it("canonicalizes JSON deterministically without rounding sub-pixel geometry", () => {
    const left = canonicalStringify({ z: 1, geometry: { y: 0, x: 143.3333282470703 }, a: true });
    const right = canonicalStringify({ a: true, geometry: { x: 143.3333282470703, y: 0 }, z: 1 });
    expect(left).toBe(right);
    expect(left).toContain("143.3333282470703");
    expect(() => canonicalStringify({ invalid: Number.NaN })).toThrow("non-finite");
  });

  it("rejects cyclic canonical JSON values", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalStringify(value)).toThrow("cyclic");
  });

  it("accepts double-precision rectangles and rejects non-finite geometry", () => {
    expect(
      validateRect({ x: 0.3333333333333333, y: -0.125, width: 143.3333282470703, height: 20.5 }).ok,
    ).toBe(true);
    expect(validateRect({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 20 }).ok).toBe(
      false,
    );
  });

  it("preserves token aliases while validating graph references", () => {
    const valid = {
      tokens: [
        {
          id: "tok_primary",
          name: "--color-primary",
          kind: "color",
          rawValue: "#0A84FF",
          scope: {},
          references: [],
          source: { type: "css-custom-property" },
          confidence: 1,
        },
        {
          id: "tok_button",
          name: "--button-bg",
          kind: "color",
          rawValue: "var(--color-primary)",
          scope: {},
          references: ["tok_primary"],
          source: { type: "css-custom-property" },
          confidence: 1,
        },
      ],
      usages: [
        {
          tokenId: "tok_button",
          sourceNodeId: "node_button",
          property: "background-color",
          authoredValue: "var(--button-bg)",
          resolvedValue: "rgb(10, 132, 255)",
        },
      ],
    };
    expect(validateTokenGraph(valid).ok).toBe(true);

    const broken = structuredClone(valid);
    broken.tokens[1]!.references = ["tok_missing"];
    const result = validateTokenGraph(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("WTF_TOKEN_REFERENCE_MISSING");
    }
  });

  it("recognizes canonical SHA-256 strings", () => {
    expect(isSha256(HASH_A)).toBe(true);
    expect(isSha256(HASH_A.toUpperCase())).toBe(false);
  });
});
