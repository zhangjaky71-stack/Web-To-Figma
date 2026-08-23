export interface WtfExportReceipt {
  storageKey: string;
  jobId: string;
  artifactId: string;
  filename: string;
  mimeType: "application/x-wtf";
  archiveByteCount: number;
  archiveSha256: string;
  payloadCount: number;
  archiveEntryCount: number;
  responsiveSnapshotCount: number;
}

export function isWtfExportReceipt(value: unknown): value is WtfExportReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.storageKey === "string" &&
    typeof record.jobId === "string" &&
    typeof record.artifactId === "string" &&
    typeof record.filename === "string" &&
    record.filename.toLowerCase().endsWith(".wtf") &&
    record.mimeType === "application/x-wtf" &&
    typeof record.archiveByteCount === "number" &&
    Number.isSafeInteger(record.archiveByteCount) &&
    record.archiveByteCount > 0 &&
    typeof record.archiveSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.archiveSha256) &&
    typeof record.payloadCount === "number" &&
    Number.isSafeInteger(record.payloadCount) &&
    typeof record.archiveEntryCount === "number" &&
    Number.isSafeInteger(record.archiveEntryCount) &&
    typeof record.responsiveSnapshotCount === "number" &&
    Number.isSafeInteger(record.responsiveSnapshotCount)
  );
}
