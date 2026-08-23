import {
  WTF_ASSET_CODEC_VERSION,
  WTF_CONTAINER_KIND,
  WTF_DEFAULT_ENTRYPOINTS,
  WTF_FORMAT_VERSION,
  WTF_HARD_SECURITY_LIMITS,
  WTF_MIME_TYPE,
  WTF_REQUIRED_PAYLOAD_PATHS,
  WTF_SCHEMA_VERSION,
  canonicalStringify,
  validateChecksums,
  validateContainerEntries,
  validatePortablePath,
  validateWtfManifest,
  type WtfChecksums,
  type WtfFileDescriptor,
  type WtfManifest,
  type WtfSecurityLimits,
} from "@w2f/w2f-schema";
import {
  WTF_CHECKSUMS_PATH,
  WTF_MANIFEST_PATH,
  WTF_PACKAGER_VERSION,
  type WtfPackagePayload,
  type WtfPackageResult,
  type WtfPackageSummary,
  type WtfPackagerInput,
  type WtfPackagedEntry,
} from "./types.js";
import { encodeDeterministicZip } from "./zip.js";

const encoder = new TextEncoder();
const ZIP32_MAX_ENTRIES = 65_535;

function bytesFromJson(value: unknown): Uint8Array {
  return encoder.encode(canonicalStringify(value));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto SHA-256 is unavailable");
  const stable = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stable.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeFilenameBase(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 180)
    .trim();
  const withoutExtension = normalized.toLowerCase().endsWith(".wtf")
    ? normalized.slice(0, -4).replace(/[. ]+$/g, "")
    : normalized;
  return withoutExtension || "document";
}

export function wtfFilename(filenameBase: string): string {
  return `${normalizeFilenameBase(filenameBase)}.wtf`;
}

function writerSecurityLimits(input?: WtfSecurityLimits): WtfSecurityLimits {
  const source = input ?? WTF_HARD_SECURITY_LIMITS;
  return {
    maxArchiveBytes: Math.min(source.maxArchiveBytes, WTF_HARD_SECURITY_LIMITS.maxArchiveBytes),
    maxEntryBytes: Math.min(source.maxEntryBytes, WTF_HARD_SECURITY_LIMITS.maxEntryBytes),
    maxJsonBytes: Math.min(source.maxJsonBytes, WTF_HARD_SECURITY_LIMITS.maxJsonBytes),
    maxAssetBytes: Math.min(source.maxAssetBytes, WTF_HARD_SECURITY_LIMITS.maxAssetBytes),
    maxEntries: Math.min(source.maxEntries, WTF_HARD_SECURITY_LIMITS.maxEntries, ZIP32_MAX_ENTRIES),
    maxPathLength: Math.min(source.maxPathLength, WTF_HARD_SECURITY_LIMITS.maxPathLength),
    maxCompressionRatio: Math.min(
      source.maxCompressionRatio,
      WTF_HARD_SECURITY_LIMITS.maxCompressionRatio,
    ),
  };
}

function assertPayloadPath(path: string, limits: WtfSecurityLimits): void {
  if (path === WTF_MANIFEST_PATH || path === WTF_CHECKSUMS_PATH) {
    throw new TypeError(`${path} is a reserved container entry`);
  }
  const validation = validatePortablePath(path, limits.maxPathLength);
  if (!validation.ok) {
    throw new TypeError(
      `invalid portable payload path ${path}: ${validation.errors.map((item) => item.code).join(", ")}`,
    );
  }
}

function payloadBytes(payload: WtfPackagePayload): Uint8Array {
  return "json" in payload ? bytesFromJson(payload.json) : Uint8Array.from(payload.bytes);
}

function entryLimit(path: string, limits: WtfSecurityLimits): number {
  if (path.endsWith(".json")) return Math.min(limits.maxEntryBytes, limits.maxJsonBytes);
  if (path.startsWith("assets/") || path.startsWith("fallback/") || path.startsWith("preview/")) {
    return Math.min(limits.maxEntryBytes, limits.maxAssetBytes);
  }
  return limits.maxEntryBytes;
}

async function preparePayloads(
  payloads: readonly WtfPackagePayload[],
  limits: WtfSecurityLimits,
): Promise<{ descriptors: WtfFileDescriptor[]; entries: WtfPackagedEntry[] }> {
  if (payloads.length + 2 > limits.maxEntries)
    throw new RangeError("package exceeds entry-count limit");
  const seen = new Set<string>();
  const entries: WtfPackagedEntry[] = [];
  const descriptors: WtfFileDescriptor[] = [];
  for (const payload of [...payloads].sort((left, right) => left.path.localeCompare(right.path))) {
    assertPayloadPath(payload.path, limits);
    if (seen.has(payload.path)) throw new TypeError(`duplicate payload path: ${payload.path}`);
    seen.add(payload.path);
    const bytes = payloadBytes(payload);
    if (bytes.byteLength > entryLimit(payload.path, limits)) {
      throw new RangeError(`payload exceeds configured entry limit: ${payload.path}`);
    }
    const digest = await sha256(bytes);
    const mediaType =
      "json" in payload ? (payload.mediaType ?? "application/json") : payload.mediaType;
    descriptors.push({
      path: payload.path,
      role: payload.role,
      mediaType,
      sizeBytes: bytes.byteLength,
      sha256: digest,
    });
    entries.push({ path: payload.path, role: payload.role, mediaType, bytes, sha256: digest });
  }
  for (const requiredPath of WTF_REQUIRED_PAYLOAD_PATHS) {
    if (!seen.has(requiredPath)) throw new TypeError(`required payload missing: ${requiredPath}`);
  }
  return { descriptors, entries };
}

function assertManifest(value: WtfManifest): void {
  const validation = validateWtfManifest(value);
  if (!validation.ok) {
    throw new TypeError(
      `generated manifest is invalid: ${validation.errors.map((item) => `${item.path}:${item.code}`).join(", ")}`,
    );
  }
}

function assertChecksums(value: WtfChecksums, manifest: WtfManifest): void {
  const validation = validateChecksums(value, manifest);
  if (!validation.ok) {
    throw new TypeError(
      `generated checksums are invalid: ${validation.errors.map((item) => `${item.path}:${item.code}`).join(", ")}`,
    );
  }
}

export async function packageWtf(input: WtfPackagerInput): Promise<WtfPackageResult> {
  const limits = writerSecurityLimits(input.securityLimits);
  const prepared = await preparePayloads(input.payloads, limits);
  const capabilities = [...new Set(input.compatibility.capabilities)].sort();
  const requiredFeatures = [...new Set(input.features.required)].sort();
  const optionalFeatures = [...new Set(input.features.optional)]
    .filter((feature) => !requiredFeatures.includes(feature))
    .sort();
  const manifest: WtfManifest = {
    kind: WTF_CONTAINER_KIND,
    compatibility: {
      formatVersion: WTF_FORMAT_VERSION,
      schemaVersion: WTF_SCHEMA_VERSION,
      writerVersion: input.compatibility.writerVersion,
      minReaderVersion: input.compatibility.minReaderVersion,
      assetCodecVersion: input.compatibility.assetCodecVersion ?? WTF_ASSET_CODEC_VERSION,
      capabilities,
    },
    identity: { ...input.identity },
    captureTarget: input.captureTarget,
    entrypoints: {
      ...WTF_DEFAULT_ENTRYPOINTS,
      ...(input.referenceTilesPath ? { referenceTiles: input.referenceTilesPath } : {}),
    },
    features: { required: requiredFeatures, optional: optionalFeatures },
    files: prepared.descriptors,
    security: { limits },
  };
  assertManifest(manifest);

  const checksumFiles = Object.fromEntries(
    prepared.descriptors.map((descriptor) => [descriptor.path, descriptor.sha256]),
  );
  const checksums: WtfChecksums = { algorithm: "sha256", files: checksumFiles };
  assertChecksums(checksums, manifest);

  const manifestBytes = bytesFromJson(manifest);
  const checksumsBytes = bytesFromJson(checksums);
  const allEntries: WtfPackagedEntry[] = [
    {
      path: WTF_MANIFEST_PATH,
      role: "manifest",
      mediaType: "application/json",
      bytes: manifestBytes,
    },
    {
      path: WTF_CHECKSUMS_PATH,
      role: "checksums",
      mediaType: "application/json",
      bytes: checksumsBytes,
    },
    ...prepared.entries,
  ].sort((left, right) => left.path.localeCompare(right.path));

  const containerValidation = validateContainerEntries(
    allEntries.map((entry) => ({
      path: entry.path,
      mediaType: entry.mediaType,
      uncompressedSize: entry.bytes.byteLength,
      compressedSize: entry.bytes.byteLength,
    })),
    manifest,
  );
  if (!containerValidation.ok) {
    throw new TypeError(
      `generated container inventory is invalid: ${containerValidation.errors.map((item) => `${item.path}:${item.code}`).join(", ")}`,
    );
  }

  const bytes = encodeDeterministicZip(
    allEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes })),
  );
  if (bytes.byteLength > limits.maxArchiveBytes)
    throw new RangeError("generated archive exceeds limit");
  const archiveSha256 = await sha256(bytes);
  return {
    version: WTF_PACKAGER_VERSION,
    filename: wtfFilename(input.filenameBase),
    mimeType: WTF_MIME_TYPE,
    manifest,
    checksums,
    files: prepared.descriptors,
    entries: allEntries,
    bytes,
    sha256: archiveSha256,
  };
}

export function summarizeWtfPackage(result: WtfPackageResult): WtfPackageSummary {
  return {
    version: result.version,
    filename: result.filename,
    payloadCount: result.files.length,
    archiveEntryCount: result.entries.length,
    archiveByteCount: result.bytes.byteLength,
    jsonPayloadCount: result.files.filter((file) => file.mediaType === "application/json").length,
    binaryPayloadCount: result.files.filter((file) => file.mediaType !== "application/json").length,
    assetPayloadCount: result.files.filter((file) => file.role === "asset").length,
    referencePayloadCount: result.files.filter(
      (file) => file.role === "reference-tile" || file.role === "reference-tiles-index",
    ).length,
    fallbackPayloadCount: result.files.filter((file) => file.role === "fallback").length,
    archiveSha256: result.sha256,
  };
}
