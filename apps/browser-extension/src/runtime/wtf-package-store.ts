import {
  summarizeWtfPackage,
  type WtfPackageResult,
  type WtfPackageSummary,
} from "@w2f/wtf-packager";
import { WTF_MIME_TYPE } from "@w2f/w2f-schema";

export const W2F_WTF_PACKAGE_DB_NAME = "w2f-wtf-packages" as const;
export const W2F_WTF_PACKAGE_STORE_NAME = "packages" as const;
export const W2F_WTF_PACKAGE_DB_VERSION = 1 as const;
export const W2F_WTF_PACKAGE_KEY_PREFIX = "wtf-package:" as const;

export interface StoredWtfPackage {
  version: "1.0.0";
  jobId: string;
  filename: string;
  mimeType: typeof WTF_MIME_TYPE;
  sha256: string;
  summary: WtfPackageSummary;
  bytes: Uint8Array;
}

export function wtfPackageStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_WTF_PACKAGE_KEY_PREFIX}${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStoredWtfPackage(value: unknown): value is StoredWtfPackage {
  if (!isRecord(value) || !isRecord(value.summary)) return false;
  return (
    value.version === "1.0.0" &&
    typeof value.jobId === "string" &&
    value.jobId.length > 0 &&
    typeof value.filename === "string" &&
    value.filename.toLowerCase().endsWith(".wtf") &&
    value.mimeType === WTF_MIME_TYPE &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    value.bytes instanceof Uint8Array &&
    typeof value.summary.archiveByteCount === "number" &&
    value.summary.archiveByteCount === value.bytes.byteLength &&
    value.summary.archiveSha256 === value.sha256
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_WTF_PACKAGE_DB_NAME, W2F_WTF_PACKAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_WTF_PACKAGE_STORE_NAME)) {
        database.createObjectStore(W2F_WTF_PACKAGE_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open WTF package database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("WTF package transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("WTF package transaction aborted"));
  });
}

export async function writeWtfPackage(jobId: string, result: WtfPackageResult): Promise<string> {
  const key = wtfPackageStorageKey(jobId);
  const record: StoredWtfPackage = {
    version: "1.0.0",
    jobId: jobId.trim(),
    filename: result.filename,
    mimeType: result.mimeType,
    sha256: result.sha256,
    summary: summarizeWtfPackage(result),
    bytes: Uint8Array.from(result.bytes),
  };
  if (!isStoredWtfPackage(record)) throw new TypeError("invalid StoredWtfPackage");
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_WTF_PACKAGE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_WTF_PACKAGE_STORE_NAME).put(record, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readWtfPackage(jobId: string): Promise<StoredWtfPackage | null> {
  const key = wtfPackageStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_WTF_PACKAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_WTF_PACKAGE_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read WTF package"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isStoredWtfPackage(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteWtfPackage(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_WTF_PACKAGE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_WTF_PACKAGE_STORE_NAME).delete(wtfPackageStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
