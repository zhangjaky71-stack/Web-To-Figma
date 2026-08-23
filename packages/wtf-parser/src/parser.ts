import {
  validateWtfIrBundle,
  type WtfAssetsPayload,
  type WtfIrBundle,
  type WtfRenderTree,
} from "@w2f/w2f-ir";
import {
  WTF_CHECKSUMS_PATH,
  WTF_DEFAULT_ENTRYPOINTS,
  WTF_HARD_SECURITY_LIMITS,
  WTF_KNOWN_FEATURES,
  WTF_MANIFEST_PATH,
  checkReaderCompatibility,
  validateChecksums,
  validateContainerEntries,
  validateWtfManifest,
  type WtfChecksums,
  type WtfFileDescriptor,
  type WtfManifest,
} from "@w2f/w2f-schema";
import { migrateCompatibleV2 } from "./migrations.js";
import { sanitizeSvgBytes } from "./svg-sanitize.js";
import {
  WTF_PARSER_READER_VERSION,
  WTF_PARSER_SUPPORTED_CAPABILITIES,
  WtfParserError,
  type WtfParsedPackage,
  type WtfParsedPreview,
  type WtfParseOptions,
  type WtfParserIssue,
} from "./types.js";
import { openSecureZip } from "./zip-reader.js";

const JSON_MEDIA_TYPES = new Set(["application/json", "text/json"]);
const EXECUTABLE_MEDIA = /(?:text\/html|application\/(?:javascript|x-javascript|ecmascript|zip|x-zip-compressed)|text\/(?:javascript|ecmascript))/i;
const NESTED_ARCHIVE_SUFFIX = /\.(?:zip|wtf|rar|7z|tar|tgz|gz|bz2|xz)$/i;

function fail(code: WtfParserIssue["code"], path: string, message: string): never {
  throw new WtfParserError({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEntry<T>(payloads: ReadonlyMap<string, unknown>, path: string): T {
  if (!payloads.has(path)) fail("WTF_PARSER_REQUIRED_ENTRY", path, "required JSON payload is missing");
  return payloads.get(path) as T;
}

function jsonLimit(path: string, manifest?: WtfManifest): number {
  return Math.min(
    WTF_HARD_SECURITY_LIMITS.maxJsonBytes,
    manifest?.security.limits.maxJsonBytes ?? WTF_HARD_SECURITY_LIMITS.maxJsonBytes,
  );
}

function decodeJson(bytes: Uint8Array, path: string, maxBytes: number): unknown {
  if (bytes.byteLength > maxBytes) {
    fail("WTF_PARSER_ZIP_ENTRY_LIMIT", path, `JSON entry exceeds its ${maxBytes}-byte limit`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("WTF_PARSER_JSON_UTF8", path, "JSON payload is not valid UTF-8");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    fail(
      "WTF_PARSER_JSON_PARSE",
      path,
      `JSON payload could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    fail("WTF_PARSER_CHECKSUM_MISMATCH", "$", "Web Crypto SHA-256 is unavailable in this runtime");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isZipMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function assertKnownImageMagic(mediaType: string, bytes: Uint8Array, path: string): void {
  const valid =
    mediaType === "image/png"
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : mediaType === "image/jpeg"
        ? startsWith(bytes, [0xff, 0xd8, 0xff])
        : mediaType === "image/gif"
          ? new TextDecoder().decode(bytes.subarray(0, 6)) === "GIF87a" ||
            new TextDecoder().decode(bytes.subarray(0, 6)) === "GIF89a"
          : mediaType === "image/webp"
            ? new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
              new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
            : mediaType === "image/avif"
              ? new TextDecoder().decode(bytes.subarray(4, 12)).includes("ftypavif") ||
                new TextDecoder().decode(bytes.subarray(4, 12)).includes("ftypavis")
              : true;
  if (!valid) fail("WTF_PARSER_ASSET_POLICY", path, `payload magic does not match declared media type ${mediaType}`);
}

function assertPayloadMediaPolicy(descriptor: WtfFileDescriptor, bytes: Uint8Array): void {
  if (EXECUTABLE_MEDIA.test(descriptor.mediaType)) {
    fail("WTF_PARSER_ASSET_POLICY", descriptor.path, `executable/container media type ${descriptor.mediaType} is forbidden`);
  }
  if (NESTED_ARCHIVE_SUFFIX.test(descriptor.path) || isZipMagic(bytes)) {
    fail("WTF_PARSER_NESTED_ARCHIVE", descriptor.path, "nested archive payloads are not auto-expanded or accepted");
  }
  if (descriptor.mediaType.startsWith("image/") && descriptor.mediaType !== "image/svg+xml") {
    assertKnownImageMagic(descriptor.mediaType, bytes, descriptor.path);
  }
}

function validateAssetIndex(
  assets: WtfAssetsPayload,
  descriptors: ReadonlyMap<string, WtfFileDescriptor>,
  binaryPayloads: ReadonlyMap<string, Uint8Array>,
): void {
  for (const [index, asset] of assets.assets.entries()) {
    if (!asset.embeddedPath) continue;
    const target = `$.assets.assets[${index}]`;
    const descriptor = descriptors.get(asset.embeddedPath);
    if (!descriptor) fail("WTF_PARSER_ASSET_POLICY", `${target}.embeddedPath`, "embedded asset is absent from manifest inventory");
    if (descriptor.role !== "asset") {
      fail("WTF_PARSER_ASSET_POLICY", `${target}.embeddedPath`, "embedded asset path must use manifest role=asset");
    }
    if (descriptor.mediaType !== asset.mediaType) {
      fail("WTF_PARSER_ASSET_POLICY", `${target}.mediaType`, "asset index media type disagrees with manifest descriptor");
    }
    const bytes = binaryPayloads.get(asset.embeddedPath);
    if (!bytes) fail("WTF_PARSER_ASSET_POLICY", `${target}.embeddedPath`, "embedded asset bytes are missing");
    if (asset.byteLength !== undefined && asset.byteLength !== bytes.byteLength) {
      fail("WTF_PARSER_ASSET_POLICY", `${target}.byteLength`, "asset index byteLength disagrees with payload bytes");
    }
  }
}

function sectionPreview(renderTree: WtfRenderTree): WtfParsedPreview["sectionOutline"] {
  const renderNodes = new Map(renderTree.nodes.map((node) => [node.id, node]));
  const parentBySection = new Map<string, string>();
  for (const section of renderTree.sections) {
    for (const childId of section.childSectionIds) {
      if (!parentBySection.has(childId)) parentBySection.set(childId, section.id);
    }
  }
  return renderTree.sections.map((section) => {
    let depth = 0;
    let cursor = parentBySection.get(section.id);
    const seen = new Set<string>([section.id]);
    while (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      depth += 1;
      cursor = parentBySection.get(cursor);
    }
    const renderNode = renderNodes.get(section.renderNodeId);
    const parentId = parentBySection.get(section.id);
    return {
      id: section.id,
      name: section.name,
      depth,
      ...(parentId ? { parentId } : {}),
      renderNodeIds: [section.renderNodeId],
      sourceStableIds: [...(renderNode?.sourceStableIds ?? [])],
      defaultSelected: true,
    };
  });
}

function createPreview(
  manifest: WtfManifest,
  ir: WtfIrBundle,
  jsonPayloads: ReadonlyMap<string, unknown>,
): WtfParsedPreview {
  const metadata = jsonPayloads.get(WTF_DEFAULT_ENTRYPOINTS.sourceMetadata);
  const sourceUrl = isRecord(metadata) && typeof metadata.url === "string" ? metadata.url : undefined;
  const title = isRecord(metadata) && typeof metadata.title === "string" ? metadata.title : undefined;
  const stableIds = new Set(
    ir.renderTree.nodes.flatMap((node) => node.sourceStableIds ?? []),
  );
  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(title ? { title } : {}),
    renderNodeCount: ir.renderTree.nodes.length,
    assetCount: ir.assets.assets.length,
    referenceCount: ir.assets.referenceTiles.length,
    sectionOutline: sectionPreview(ir.renderTree),
    revision: {
      documentId: manifest.identity.documentId,
      captureId: manifest.identity.captureId,
      ...(manifest.identity.revisionId ? { revisionId: manifest.identity.revisionId } : {}),
      ...(manifest.identity.parentRevisionId
        ? { parentRevisionId: manifest.identity.parentRevisionId }
        : {}),
    },
    stableSourceMappingCount: stableIds.size,
    tokenUsageCount: ir.tokens.usages.length,
    tokenPolicy: "literal",
  };
}

function readerSupport(options: WtfParseOptions) {
  return {
    readerVersion: options.readerVersion ?? WTF_PARSER_READER_VERSION,
    supportedCapabilities: options.supportedCapabilities ?? WTF_PARSER_SUPPORTED_CAPABILITIES,
    supportedFeatures: options.supportedFeatures ?? [
      ...WTF_KNOWN_FEATURES,
      "authored-css",
      "double-precision-geometry",
      "compositing-groups",
      "table-layout",
    ],
  };
}

export async function parseWtfPackage(input: Uint8Array, options: WtfParseOptions = {}): Promise<WtfParsedPackage> {
  const archive = openSecureZip(input, { allowDeflate: options.allowDeflate });
  for (const reserved of [WTF_MANIFEST_PATH, WTF_CHECKSUMS_PATH]) {
    const entry = archive.entriesByPath.get(reserved);
    if (!entry) fail("WTF_PARSER_REQUIRED_ENTRY", reserved, `archive is missing required ${reserved}`);
    if (entry.uncompressedSize > WTF_HARD_SECURITY_LIMITS.maxJsonBytes) {
      fail("WTF_PARSER_ZIP_ENTRY_LIMIT", reserved, "reserved JSON entry exceeds the hard JSON limit");
    }
  }

  const manifestRaw = decodeJson(
    await archive.read(WTF_MANIFEST_PATH),
    WTF_MANIFEST_PATH,
    WTF_HARD_SECURITY_LIMITS.maxJsonBytes,
  );
  const manifestResult = validateWtfManifest(manifestRaw);
  if (!manifestResult.ok) {
    throw new WtfParserError(
      manifestResult.errors.map((error) => ({
        code: "WTF_PARSER_MANIFEST_INVALID",
        path: error.path,
        message: `${error.code}: ${error.message}`,
      })),
    );
  }
  const manifest = manifestResult.value;

  const compatibility = checkReaderCompatibility(manifest, readerSupport(options));
  if (!compatibility.compatible) {
    throw new WtfParserError(
      compatibility.reasons.map((reason) => ({
        code: "WTF_PARSER_COMPATIBILITY",
        path: "$.manifest.compatibility",
        message: reason,
      })),
    );
  }
  const migration = migrateCompatibleV2(manifest);

  const checksumsRaw = decodeJson(
    await archive.read(WTF_CHECKSUMS_PATH),
    WTF_CHECKSUMS_PATH,
    jsonLimit(WTF_CHECKSUMS_PATH, manifest),
  );
  const checksumsResult = validateChecksums(checksumsRaw, manifest);
  if (!checksumsResult.ok) {
    throw new WtfParserError(
      checksumsResult.errors.map((error) => ({
        code: "WTF_PARSER_CHECKSUMS_INVALID",
        path: error.path,
        message: `${error.code}: ${error.message}`,
      })),
    );
  }
  const checksums: WtfChecksums = checksumsResult.value;

  const descriptors = new Map(manifest.files.map((descriptor) => [descriptor.path, descriptor]));
  const containerResult = validateContainerEntries(
    archive.entries.map((entry) => ({
      path: entry.path,
      mediaType: descriptors.get(entry.path)?.mediaType ?? "application/json",
      uncompressedSize: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
    })),
    manifest,
  );
  if (!containerResult.ok) {
    throw new WtfParserError(
      containerResult.errors.map((error) => ({
        code: "WTF_PARSER_CONTAINER_INVALID",
        path: error.path,
        message: `${error.code}: ${error.message}`,
      })),
    );
  }

  const jsonPayloads = new Map<string, unknown>();
  const binaryPayloads = new Map<string, Uint8Array>();
  const sanitizedSvgPayloads = new Map<string, string>();

  for (const descriptor of manifest.files) {
    const bytes = await archive.read(descriptor.path);
    if (bytes.byteLength !== descriptor.sizeBytes) {
      fail("WTF_PARSER_ZIP_SIZE_MISMATCH", descriptor.path, "payload size disagrees with manifest descriptor");
    }
    const actualHash = await sha256(bytes);
    const checksumHash = checksums.files[descriptor.path];
    if (actualHash !== descriptor.sha256 || actualHash !== checksumHash) {
      fail("WTF_PARSER_CHECKSUM_MISMATCH", descriptor.path, "payload SHA-256 does not match manifest/checksums inventory");
    }
    assertPayloadMediaPolicy(descriptor, bytes);

    if (descriptor.path.endsWith(".json") || JSON_MEDIA_TYPES.has(descriptor.mediaType)) {
      jsonPayloads.set(descriptor.path, decodeJson(bytes, descriptor.path, jsonLimit(descriptor.path, manifest)));
    } else {
      binaryPayloads.set(descriptor.path, bytes);
      if (descriptor.mediaType === "image/svg+xml") {
        sanitizedSvgPayloads.set(descriptor.path, sanitizeSvgBytes(bytes, descriptor.path));
      }
    }
  }

  const irCandidate: WtfIrBundle = {
    document: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.document),
    sourceGraph: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.sourceGraph),
    renderTree: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.renderTree),
    styles: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.styles),
    assets: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.assets),
    responsive: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.responsive),
    states: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.states),
    diagnostics: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.diagnostics),
    tokens: requiredEntry(jsonPayloads, WTF_DEFAULT_ENTRYPOINTS.tokens),
  };
  const irResult = validateWtfIrBundle(irCandidate);
  if (!irResult.ok) {
    throw new WtfParserError(
      irResult.errors.map((error) => ({
        code: "WTF_PARSER_IR_INVALID",
        path: error.path,
        message: `${error.code}: ${error.message}`,
      })),
    );
  }
  const ir = irResult.value;
  validateAssetIndex(ir.assets, descriptors, binaryPayloads);

  return {
    manifest,
    checksums,
    ir,
    jsonPayloads,
    binaryPayloads,
    sanitizedSvgPayloads,
    migration,
    preview: createPreview(manifest, ir, jsonPayloads),
  };
}
