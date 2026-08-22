export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function shortStableHash(fullSha256: string, length = 32): string {
  if (!/^[a-f0-9]{64}$/.test(fullSha256)) {
    throw new TypeError("shortStableHash requires a canonical SHA-256 hex string");
  }
  if (!Number.isSafeInteger(length) || length < 8 || length > 64) {
    throw new RangeError("stable hash length must be an integer between 8 and 64");
  }
  return fullSha256.slice(0, length);
}
