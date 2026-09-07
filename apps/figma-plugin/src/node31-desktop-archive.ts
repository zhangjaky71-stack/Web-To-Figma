import type { W2fNode31DesktopEvidenceFile } from "./node31-desktop-evidence.js";

export const W2F_NODE31_DESKTOP_ARCHIVE_VERSION = "1.0.0" as const;

export interface W2fNode31DesktopEvidenceArchive {
  version: typeof W2F_NODE31_DESKTOP_ARCHIVE_VERSION;
  evidenceType: "node31-figma-desktop-evidence-archive";
  sampleId: string;
  sourceSha256: string;
  createdAt: string;
  files: Array<{
    name: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
    base64: string;
  }>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function createNode31DesktopEvidenceArchive(input: {
  sampleId: string;
  sourceSha256: string;
  files: readonly W2fNode31DesktopEvidenceFile[];
}): W2fNode31DesktopEvidenceArchive {
  if (!input.sampleId.trim()) throw new TypeError("sampleId is required");
  if (!/^[a-f0-9]{64}$/.test(input.sourceSha256)) {
    throw new TypeError("sourceSha256 must be a lowercase SHA-256");
  }
  if (input.files.length === 0) throw new TypeError("desktop evidence archive cannot be empty");

  const names = new Set<string>();
  return {
    version: W2F_NODE31_DESKTOP_ARCHIVE_VERSION,
    evidenceType: "node31-figma-desktop-evidence-archive",
    sampleId: input.sampleId,
    sourceSha256: input.sourceSha256,
    createdAt: new Date().toISOString(),
    files: input.files.map((file) => {
      if (names.has(file.name)) throw new TypeError(`duplicate evidence filename: ${file.name}`);
      names.add(file.name);
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new TypeError(`invalid SHA-256 for ${file.name}`);
      }
      return {
        name: file.name,
        mediaType: file.mediaType,
        byteLength: file.bytes.byteLength,
        sha256: file.sha256,
        base64: bytesToBase64(file.bytes),
      };
    }),
  };
}
