import { isRawSnapshot, type RawSnapshot } from "@w2f/capture-core";

export const W2F_SNAPSHOT_DB_NAME = "w2f-capture-snapshots" as const;
export const W2F_SNAPSHOT_STORE_NAME = "rawSnapshots" as const;
export const W2F_REFERENCE_SCREENSHOT_STORE_NAME = "referenceScreenshots" as const;
export const W2F_SNAPSHOT_DB_VERSION = 2 as const;
export const W2F_SNAPSHOT_KEY_PREFIX = "raw-snapshot:" as const;
export const W2F_REFERENCE_SCREENSHOT_KEY_PREFIX = "reference-screenshot:" as const;

export interface ReferenceScreenshotRecord {
  format: "png";
  dataBase64: string;
  captureBeyondViewport: true;
}

export function snapshotStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_SNAPSHOT_KEY_PREFIX}${normalized}`;
}

export function referenceScreenshotStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_REFERENCE_SCREENSHOT_KEY_PREFIX}${normalized}`;
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_SNAPSHOT_DB_NAME, W2F_SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_SNAPSHOT_STORE_NAME)) {
        database.createObjectStore(W2F_SNAPSHOT_STORE_NAME);
      }
      if (!database.objectStoreNames.contains(W2F_REFERENCE_SCREENSHOT_STORE_NAME)) {
        database.createObjectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("snapshot transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("snapshot transaction aborted"));
  });
}

function isReferenceScreenshotRecord(value: unknown): value is ReferenceScreenshotRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === "png" &&
    typeof record.dataBase64 === "string" &&
    record.dataBase64.length > 0 &&
    record.captureBeyondViewport === true
  );
}

export async function writeRawSnapshot(jobId: string, snapshot: RawSnapshot): Promise<string> {
  if (!isRawSnapshot(snapshot)) throw new TypeError("invalid RawSnapshot");
  const key = snapshotStorageKey(jobId);
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).put(snapshot, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readRawSnapshot(jobId: string): Promise<RawSnapshot | null> {
  const key = snapshotStorageKey(jobId);
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isRawSnapshot(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function writeReferenceScreenshot(
  jobId: string,
  screenshot: ReferenceScreenshotRecord,
): Promise<string> {
  if (!isReferenceScreenshotRecord(screenshot)) throw new TypeError("invalid reference screenshot");
  const key = referenceScreenshotStorageKey(jobId);
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_REFERENCE_SCREENSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME).put(screenshot, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readReferenceScreenshot(
  jobId: string,
): Promise<ReferenceScreenshotRecord | null> {
  const key = referenceScreenshotStorageKey(jobId);
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_REFERENCE_SCREENSHOT_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read reference screenshot"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isReferenceScreenshotRecord(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteCaptureArtifacts(jobId: string): Promise<void> {
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(
      [W2F_SNAPSHOT_STORE_NAME, W2F_REFERENCE_SCREENSHOT_STORE_NAME],
      "readwrite",
    );
    transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).delete(snapshotStorageKey(jobId));
    transaction
      .objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME)
      .delete(referenceScreenshotStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function deleteRawSnapshot(jobId: string): Promise<void> {
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).delete(snapshotStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
