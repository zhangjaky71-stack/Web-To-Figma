import { describe, expect, it } from "vitest";
import { encodeDeterministicZip } from "@w2f/wtf-packager";
import { WtfParserError, openSecureZip } from "../src/index.js";

const text = (value: string) => new TextEncoder().encode(value);

function errorCodes(error: unknown): string[] {
  return error instanceof WtfParserError ? error.issues.map((issue) => issue.code) : [];
}

function centralDirectoryOffsets(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsets: number[] = [];
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) offsets.push(offset);
  }
  return offsets;
}

describe("NODE-23 secure ZIP reader", () => {
  it("reads deterministic Store entries and verifies CRC", async () => {
    const bytes = encodeDeterministicZip([
      { path: "a.json", bytes: text('{"ok":true}') },
      { path: "assets/image.bin", bytes: Uint8Array.from([1, 2, 3, 4]) },
    ]);
    const archive = openSecureZip(bytes);
    expect(archive.entries.map((entry) => entry.path)).toEqual(["a.json", "assets/image.bin"]);
    expect(new TextDecoder().decode(await archive.read("a.json"))).toBe('{"ok":true}');
    expect(await archive.read("assets/image.bin")).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("rejects Zip Slip paths before entry data is trusted", () => {
    const bytes = encodeDeterministicZip([{ path: "../evil.json", bytes: text("{}") }]);
    try {
      openSecureZip(bytes);
      throw new Error("expected Zip Slip rejection");
    } catch (error) {
      expect(errorCodes(error)).toContain("WTF_PARSER_ZIP_PATH_INVALID");
    }
  });

  it("rejects duplicate central-directory paths", () => {
    const duplicate = Uint8Array.from(
      encodeDeterministicZip([
        { path: "same.json", bytes: text("one") },
        { path: "else.json", bytes: text("two") },
      ]),
    );
    const [firstCentral, secondCentral] = centralDirectoryOffsets(duplicate);
    expect(firstCentral).toBeDefined();
    expect(secondCentral).toBeDefined();
    if (firstCentral === undefined || secondCentral === undefined) return;

    const view = new DataView(duplicate.buffer, duplicate.byteOffset, duplicate.byteLength);
    const firstNameLength = view.getUint16(firstCentral + 28, true);
    const secondNameLength = view.getUint16(secondCentral + 28, true);
    expect(secondNameLength).toBe(firstNameLength);
    duplicate.set(
      duplicate.subarray(firstCentral + 46, firstCentral + 46 + firstNameLength),
      secondCentral + 46,
    );

    try {
      openSecureZip(duplicate);
      throw new Error("expected duplicate-path rejection");
    } catch (error) {
      expect(errorCodes(error)).toContain("WTF_PARSER_ZIP_DUPLICATE_PATH");
    }
  });

  it("rejects central entries that share one local header", () => {
    const overlapping = Uint8Array.from(
      encodeDeterministicZip([
        { path: "first.json", bytes: text("one") },
        { path: "second.json", bytes: text("two") },
      ]),
    );
    const [firstCentral, secondCentral] = centralDirectoryOffsets(overlapping);
    expect(firstCentral).toBeDefined();
    expect(secondCentral).toBeDefined();
    if (firstCentral === undefined || secondCentral === undefined) return;

    const view = new DataView(overlapping.buffer, overlapping.byteOffset, overlapping.byteLength);
    const firstLocalHeaderOffset = view.getUint32(firstCentral + 42, true);
    view.setUint32(secondCentral + 42, firstLocalHeaderOffset, true);

    try {
      openSecureZip(overlapping);
      throw new Error("expected overlapping-local-header rejection");
    } catch (error) {
      expect(errorCodes(error)).toContain("WTF_PARSER_ZIP_DUPLICATE_PATH");
    }
  });
});
