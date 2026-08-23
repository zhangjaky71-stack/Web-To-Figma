import { describe, expect, it } from "vitest";
import { encodeDeterministicZip } from "@w2f/wtf-packager";
import { WtfParserError, openSecureZip } from "../src/index.js";

const text = (value: string) => new TextEncoder().encode(value);

function errorCodes(error: unknown): string[] {
  return error instanceof WtfParserError ? error.issues.map((issue) => issue.code) : [];
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

  it("rejects duplicate paths and overlapping metadata", () => {
    const bytes = encodeDeterministicZip([
      { path: "same.json", bytes: text("one") },
      { path: "other.json", bytes: text("two") },
    ]);
    const duplicate = Uint8Array.from(bytes);
    const view = new DataView(duplicate.buffer);
    let central = -1;
    for (let offset = 0; offset + 4 <= duplicate.byteLength; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        if (central < 0) central = offset;
        else {
          const firstNameLength = view.getUint16(central + 28, true);
          const secondNameLength = view.getUint16(offset + 28, true);
          if (firstNameLength === secondNameLength) {
            duplicate.set(
              duplicate.subarray(central + 46, central + 46 + firstNameLength),
              offset + 46,
            );
          }
          break;
        }
      }
    }
    expect(() => openSecureZip(duplicate)).toThrow();
  });
});
