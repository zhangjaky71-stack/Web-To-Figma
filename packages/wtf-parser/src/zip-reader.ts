import { WTF_HARD_SECURITY_LIMITS, validatePortablePath } from "@w2f/w2f-schema";
import {
  WtfParserError,
  type WtfParserIssue,
  type WtfSecureZipArchive,
  type WtfZipEntryMetadata,
} from "./types.js";

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const ZIP_FLAG_ENCRYPTED = 0x0001;
const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_ALLOWED_FLAGS = ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8 | 0x0006;
const EOCD_FIXED_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff];
    if (tableValue === undefined) throw new Error("CRC32 table lookup failed");
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fail(code: WtfParserIssue["code"], path: string, message: string): never {
  throw new WtfParserError({ code, path, message });
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ensureRange(bytes: Uint8Array, offset: number, length: number, path: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.byteLength
  ) {
    fail("WTF_PARSER_ZIP_TRUNCATED", path, "ZIP structure points outside the archive bytes");
  }
}

function u16(bytes: Uint8Array, offset: number, path: string): number {
  ensureRange(bytes, offset, 2, path);
  return viewOf(bytes).getUint16(offset, true);
}

function u32(bytes: Uint8Array, offset: number, path: string): number {
  ensureRange(bytes, offset, 4, path);
  return viewOf(bytes).getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  if (bytes.byteLength < EOCD_FIXED_SIZE) {
    fail("WTF_PARSER_ZIP_SIGNATURE", "$", "archive is too small to contain a ZIP EOCD record");
  }
  const minimum = Math.max(0, bytes.byteLength - EOCD_FIXED_SIZE - MAX_ZIP_COMMENT);
  const view = viewOf(bytes);
  for (let offset = bytes.byteLength - EOCD_FIXED_SIZE; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + EOCD_FIXED_SIZE + commentLength === bytes.byteLength) return offset;
  }
  fail("WTF_PARSER_ZIP_SIGNATURE", "$", "ZIP end-of-central-directory signature was not found");
}

function decodePath(nameBytes: Uint8Array, flags: number, target: string): string {
  if ((flags & ZIP_FLAG_UTF8) === 0 && nameBytes.some((byte) => byte >= 0x80)) {
    fail(
      "WTF_PARSER_ZIP_FLAG_UNSUPPORTED",
      target,
      "non-ASCII ZIP entry names must set the UTF-8 general-purpose flag",
    );
  }
  let path: string;
  try {
    path = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
  } catch {
    fail("WTF_PARSER_ZIP_PATH_INVALID", target, "ZIP entry path is not valid UTF-8");
  }
  const portable = validatePortablePath(path);
  if (!portable.ok) {
    throw new WtfParserError(
      portable.errors.map((error) => ({
        code: "WTF_PARSER_ZIP_PATH_INVALID",
        path: target,
        message: `${error.code}: ${error.message}`,
      })),
    );
  }
  return path;
}

function validateCompression(
  method: number,
  flags: number,
  compressedSize: number,
  uncompressedSize: number,
  allowDeflate: boolean,
  target: string,
): void {
  if ((flags & ZIP_FLAG_ENCRYPTED) !== 0) {
    fail("WTF_PARSER_ZIP_ENCRYPTED", target, "encrypted ZIP entries are not supported");
  }
  if ((flags & ~ZIP_ALLOWED_FLAGS) !== 0) {
    fail(
      "WTF_PARSER_ZIP_FLAG_UNSUPPORTED",
      target,
      `ZIP entry uses unsupported general-purpose flags 0x${flags.toString(16)}`,
    );
  }
  if (method !== ZIP_METHOD_STORE && !(allowDeflate && method === ZIP_METHOD_DEFLATE)) {
    fail(
      "WTF_PARSER_ZIP_METHOD_UNSUPPORTED",
      target,
      `ZIP compression method ${method} is not supported by this reader`,
    );
  }
  if (uncompressedSize > WTF_HARD_SECURITY_LIMITS.maxEntryBytes) {
    fail("WTF_PARSER_ZIP_ENTRY_LIMIT", target, "entry exceeds the hard uncompressed entry limit");
  }
  if (uncompressedSize > 0) {
    const ratio =
      compressedSize === 0 ? Number.POSITIVE_INFINITY : uncompressedSize / compressedSize;
    if (ratio > WTF_HARD_SECURITY_LIMITS.maxCompressionRatio) {
      fail("WTF_PARSER_ZIP_RATIO_LIMIT", target, "entry exceeds the hard compression-ratio limit");
    }
  }
  if (method === ZIP_METHOD_STORE && compressedSize !== uncompressedSize) {
    fail(
      "WTF_PARSER_ZIP_SIZE_MISMATCH",
      target,
      "stored ZIP entry must have equal compressed and uncompressed sizes",
    );
  }
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function inflateRawBounded(
  input: Uint8Array,
  expectedSize: number,
  target: string,
): Promise<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([ownedBytes(input)])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
  } catch (error) {
    fail(
      "WTF_PARSER_ZIP_METHOD_UNSUPPORTED",
      target,
      `raw DEFLATE is unavailable in this runtime: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (total + chunk.byteLength > expectedSize) {
        await reader.cancel("decompressed output exceeded declared size");
        fail(
          "WTF_PARSER_ZIP_SIZE_MISMATCH",
          target,
          "DEFLATE output exceeds the central-directory uncompressed size",
        );
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof WtfParserError) throw error;
    fail(
      "WTF_PARSER_ZIP_SIZE_MISMATCH",
      target,
      `DEFLATE stream could not be decoded safely: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (total !== expectedSize) {
    fail(
      "WTF_PARSER_ZIP_SIZE_MISMATCH",
      target,
      `DEFLATE output size ${total} does not match declared size ${expectedSize}`,
    );
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function openSecureZip(
  input: Uint8Array,
  options: { allowDeflate?: boolean } = {},
): WtfSecureZipArchive {
  const bytes = Uint8Array.from(input);
  const allowDeflate = options.allowDeflate ?? true;
  if (bytes.byteLength > WTF_HARD_SECURITY_LIMITS.maxArchiveBytes) {
    fail("WTF_PARSER_ARCHIVE_TOO_LARGE", "$", "archive exceeds the frozen 1 GiB hard limit");
  }

  const eocdOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = u16(bytes, eocdOffset + 4, "$.eocd.diskNumber");
  const centralDisk = u16(bytes, eocdOffset + 6, "$.eocd.centralDisk");
  const entriesOnDisk = u16(bytes, eocdOffset + 8, "$.eocd.entriesOnDisk");
  const totalEntries = u16(bytes, eocdOffset + 10, "$.eocd.totalEntries");
  const centralSize = u32(bytes, eocdOffset + 12, "$.eocd.centralSize");
  const centralOffset = u32(bytes, eocdOffset + 16, "$.eocd.centralOffset");

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    fail("WTF_PARSER_ZIP_MULTIDISK", "$.eocd", "multi-disk ZIP archives are forbidden");
  }
  if (
    totalEntries === ZIP64_SENTINEL_16 ||
    centralSize === ZIP64_SENTINEL_32 ||
    centralOffset === ZIP64_SENTINEL_32
  ) {
    fail(
      "WTF_PARSER_ZIP64_UNSUPPORTED",
      "$.eocd",
      "ZIP64 is unnecessary for V2 hard limits and is rejected",
    );
  }
  if (totalEntries > WTF_HARD_SECURITY_LIMITS.maxEntries) {
    fail(
      "WTF_PARSER_ZIP_ENTRY_LIMIT",
      "$.eocd.totalEntries",
      "archive exceeds the hard entry-count limit",
    );
  }
  if (centralOffset + centralSize > eocdOffset) {
    fail(
      "WTF_PARSER_ZIP_TRUNCATED",
      "$.centralDirectory",
      "central directory overlaps or exceeds EOCD",
    );
  }

  const entries: WtfZipEntryMetadata[] = [];
  const entriesByPath = new Map<string, WtfZipEntryMetadata>();
  const localOffsets = new Set<number>();
  const ranges: Array<{ start: number; end: number; path: string }> = [];
  let centralCursor = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    const target = `$.centralDirectory[${index}]`;
    ensureRange(bytes, centralCursor, 46, target);
    if (u32(bytes, centralCursor, target) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      fail(
        "WTF_PARSER_ZIP_SIGNATURE",
        target,
        "central-directory file-header signature is invalid",
      );
    }
    const flags = u16(bytes, centralCursor + 8, `${target}.flags`);
    const compressionMethod = u16(bytes, centralCursor + 10, `${target}.compressionMethod`);
    const crc = u32(bytes, centralCursor + 16, `${target}.crc32`);
    const compressedSize = u32(bytes, centralCursor + 20, `${target}.compressedSize`);
    const uncompressedSize = u32(bytes, centralCursor + 24, `${target}.uncompressedSize`);
    const nameLength = u16(bytes, centralCursor + 28, `${target}.nameLength`);
    const extraLength = u16(bytes, centralCursor + 30, `${target}.extraLength`);
    const commentLength = u16(bytes, centralCursor + 32, `${target}.commentLength`);
    const diskStart = u16(bytes, centralCursor + 34, `${target}.diskStart`);
    const localHeaderOffset = u32(bytes, centralCursor + 42, `${target}.localHeaderOffset`);

    if (
      compressedSize === ZIP64_SENTINEL_32 ||
      uncompressedSize === ZIP64_SENTINEL_32 ||
      localHeaderOffset === ZIP64_SENTINEL_32
    ) {
      fail("WTF_PARSER_ZIP64_UNSUPPORTED", target, "ZIP64 entry metadata is rejected");
    }
    if (diskStart !== 0) {
      fail("WTF_PARSER_ZIP_MULTIDISK", `${target}.diskStart`, "entry references another ZIP disk");
    }

    const recordLength = 46 + nameLength + extraLength + commentLength;
    ensureRange(bytes, centralCursor, recordLength, target);
    const pathBytes = bytes.subarray(centralCursor + 46, centralCursor + 46 + nameLength);
    const path = decodePath(pathBytes, flags, `${target}.path`);
    if (entriesByPath.has(path)) {
      fail("WTF_PARSER_ZIP_DUPLICATE_PATH", `${target}.path`, `duplicate archive path ${path}`);
    }
    if (localOffsets.has(localHeaderOffset)) {
      fail(
        "WTF_PARSER_ZIP_DUPLICATE_PATH",
        `${target}.localHeaderOffset`,
        "multiple entries share one local header",
      );
    }
    localOffsets.add(localHeaderOffset);
    validateCompression(
      compressionMethod,
      flags,
      compressedSize,
      uncompressedSize,
      allowDeflate,
      target,
    );

    ensureRange(bytes, localHeaderOffset, 30, `${target}.localHeader`);
    if (u32(bytes, localHeaderOffset, `${target}.localHeader`) !== ZIP_LOCAL_FILE_HEADER) {
      fail(
        "WTF_PARSER_ZIP_SIGNATURE",
        `${target}.localHeader`,
        "local file-header signature is invalid",
      );
    }
    const localFlags = u16(bytes, localHeaderOffset + 6, `${target}.localFlags`);
    const localMethod = u16(bytes, localHeaderOffset + 8, `${target}.localMethod`);
    const localNameLength = u16(bytes, localHeaderOffset + 26, `${target}.localNameLength`);
    const localExtraLength = u16(bytes, localHeaderOffset + 28, `${target}.localExtraLength`);
    if (localFlags !== flags || localMethod !== compressionMethod) {
      fail(
        "WTF_PARSER_ZIP_SIZE_MISMATCH",
        `${target}.localHeader`,
        "local and central ZIP metadata disagree",
      );
    }
    const localNameStart = localHeaderOffset + 30;
    ensureRange(bytes, localNameStart, localNameLength + localExtraLength, `${target}.localHeader`);
    const localPath = decodePath(
      bytes.subarray(localNameStart, localNameStart + localNameLength),
      localFlags,
      `${target}.localPath`,
    );
    if (localPath !== path) {
      fail(
        "WTF_PARSER_ZIP_PATH_INVALID",
        `${target}.localPath`,
        "local and central entry paths disagree",
      );
    }
    if ((flags & ZIP_FLAG_DATA_DESCRIPTOR) === 0) {
      const localCrc = u32(bytes, localHeaderOffset + 14, `${target}.localCrc32`);
      const localCompressed = u32(bytes, localHeaderOffset + 18, `${target}.localCompressedSize`);
      const localUncompressed = u32(
        bytes,
        localHeaderOffset + 22,
        `${target}.localUncompressedSize`,
      );
      if (
        localCrc !== crc ||
        localCompressed !== compressedSize ||
        localUncompressed !== uncompressedSize
      ) {
        fail(
          "WTF_PARSER_ZIP_SIZE_MISMATCH",
          `${target}.localHeader`,
          "local and central sizes/CRC disagree",
        );
      }
    }
    const dataOffset = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset) {
      fail(
        "WTF_PARSER_ZIP_TRUNCATED",
        `${target}.data`,
        "entry data overlaps the central directory",
      );
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > WTF_HARD_SECURITY_LIMITS.maxArchiveBytes) {
      fail(
        "WTF_PARSER_ZIP_TOTAL_LIMIT",
        target,
        "total uncompressed archive size exceeds the hard limit",
      );
    }

    const metadata: WtfZipEntryMetadata = {
      path,
      flags,
      compressionMethod,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataOffset,
    };
    entries.push(metadata);
    entriesByPath.set(path, metadata);
    ranges.push({ start: localHeaderOffset, end: dataEnd, path });
    centralCursor += recordLength;
  }

  if (centralCursor !== centralOffset + centralSize) {
    fail(
      "WTF_PARSER_ZIP_TRUNCATED",
      "$.centralDirectory",
      "central-directory size does not match parsed records",
    );
  }

  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous && current && current.start < previous.end) {
      fail(
        "WTF_PARSER_ZIP_TRUNCATED",
        `$.entries.${current.path}`,
        `local entry range overlaps ${previous.path}`,
      );
    }
  }

  return {
    bytes,
    entries,
    entriesByPath,
    async read(path: string): Promise<Uint8Array> {
      const entry = entriesByPath.get(path);
      if (!entry) fail("WTF_PARSER_REQUIRED_ENTRY", path, "archive entry is missing");
      const compressed = bytes.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
      const decoded =
        entry.compressionMethod === ZIP_METHOD_STORE
          ? compressed
          : await inflateRawBounded(compressed, entry.uncompressedSize, path);
      if (decoded.byteLength !== entry.uncompressedSize) {
        fail(
          "WTF_PARSER_ZIP_SIZE_MISMATCH",
          path,
          "decoded entry length does not match central directory",
        );
      }
      const actualCrc = crc32(decoded);
      if (actualCrc !== entry.crc32) {
        fail(
          "WTF_PARSER_ZIP_CRC_MISMATCH",
          path,
          "decoded entry CRC32 does not match ZIP metadata",
        );
      }
      return decoded;
    },
  };
}
