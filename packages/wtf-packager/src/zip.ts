const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = 33; // 1980-01-01, the earliest DOS ZIP date.

export interface DeterministicZipEntry {
  path: string;
  bytes: Uint8Array;
}

interface EncodedZipEntry extends DeterministicZipEntry {
  nameBytes: Uint8Array;
  crc32: number;
  localOffset: number;
}

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

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function uint32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function localHeader(entry: EncodedZipEntry): Uint8Array {
  const output = new Uint8Array(30 + entry.nameBytes.byteLength);
  const view = new DataView(output.buffer);
  let offset = 0;
  offset = uint32(view, offset, ZIP_LOCAL_FILE_HEADER);
  offset = uint16(view, offset, ZIP_VERSION);
  offset = uint16(view, offset, ZIP_UTF8_FLAG);
  offset = uint16(view, offset, ZIP_STORE_METHOD);
  offset = uint16(view, offset, ZIP_DOS_TIME);
  offset = uint16(view, offset, ZIP_DOS_DATE);
  offset = uint32(view, offset, entry.crc32);
  offset = uint32(view, offset, entry.bytes.byteLength);
  offset = uint32(view, offset, entry.bytes.byteLength);
  offset = uint16(view, offset, entry.nameBytes.byteLength);
  offset = uint16(view, offset, 0);
  output.set(entry.nameBytes, offset);
  return output;
}

function centralHeader(entry: EncodedZipEntry): Uint8Array {
  const output = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(output.buffer);
  let offset = 0;
  offset = uint32(view, offset, ZIP_CENTRAL_DIRECTORY_HEADER);
  offset = uint16(view, offset, ZIP_VERSION);
  offset = uint16(view, offset, ZIP_VERSION);
  offset = uint16(view, offset, ZIP_UTF8_FLAG);
  offset = uint16(view, offset, ZIP_STORE_METHOD);
  offset = uint16(view, offset, ZIP_DOS_TIME);
  offset = uint16(view, offset, ZIP_DOS_DATE);
  offset = uint32(view, offset, entry.crc32);
  offset = uint32(view, offset, entry.bytes.byteLength);
  offset = uint32(view, offset, entry.bytes.byteLength);
  offset = uint16(view, offset, entry.nameBytes.byteLength);
  offset = uint16(view, offset, 0);
  offset = uint16(view, offset, 0);
  offset = uint16(view, offset, 0);
  offset = uint16(view, offset, 0);
  offset = uint32(view, offset, 0);
  offset = uint32(view, offset, entry.localOffset);
  output.set(entry.nameBytes, offset);
  return output;
}

function eocd(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const output = new Uint8Array(22);
  const view = new DataView(output.buffer);
  let offset = 0;
  offset = uint32(view, offset, ZIP_END_OF_CENTRAL_DIRECTORY);
  offset = uint16(view, offset, 0);
  offset = uint16(view, offset, 0);
  offset = uint16(view, offset, entryCount);
  offset = uint16(view, offset, entryCount);
  offset = uint32(view, offset, centralSize);
  offset = uint32(view, offset, centralOffset);
  uint16(view, offset, 0);
  return output;
}

function concat(parts: readonly Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function encodeDeterministicZip(entries: readonly DeterministicZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) {
    throw new RangeError("deterministic ZIP32 writer supports at most 65,535 entries");
  }
  const encoder = new TextEncoder();
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  const encoded: EncodedZipEntry[] = [];
  const localParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of sorted) {
    if (seen.has(entry.path)) throw new TypeError(`duplicate ZIP entry path: ${entry.path}`);
    seen.add(entry.path);
    if (entry.bytes.byteLength > 0xffffffff) throw new RangeError("ZIP32 entry exceeds 4 GiB");
    const nameBytes = encoder.encode(entry.path);
    if (nameBytes.byteLength > 0xffff) throw new RangeError("ZIP entry name exceeds 65,535 bytes");
    const item: EncodedZipEntry = {
      ...entry,
      nameBytes,
      crc32: crc32(entry.bytes),
      localOffset,
    };
    const header = localHeader(item);
    localParts.push(header, entry.bytes);
    localOffset += header.byteLength + entry.bytes.byteLength;
    if (localOffset > 0xffffffff) throw new RangeError("ZIP32 local data exceeds 4 GiB");
    encoded.push(item);
  }

  const centralParts = encoded.map(centralHeader);
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  if (centralSize > 0xffffffff || localOffset + centralSize > 0xffffffff) {
    throw new RangeError("ZIP32 central directory exceeds 4 GiB");
  }
  const end = eocd(encoded.length, centralSize, localOffset);
  return concat([...localParts, ...centralParts, end], localOffset + centralSize + end.byteLength);
}
