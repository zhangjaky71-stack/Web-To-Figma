import { isRawSnapshot, type RawSnapshot } from "@w2f/capture-core";

export const W2F_SNAPSHOT_DB_NAME = "w2f-capture-snapshots" as const;
export const W2F_SNAPSHOT_STORE_NAME = "rawSnapshots" as const;
export const W2F_SNAPSHOT_DB_VERSION = 1 as const;
export const W2F_SNAPSHOT_KEY_PREFIX = "raw-snapshot:" as const;

export function snapshotStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_SNAPSHOT_KEY_PREFIX}${normalized}`;
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_SNAPSHOT_DB_NAME, W2F_SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_SNAPSHOT_STORE_NAME)) {
        database.createObjectStore(W2F_SNAPSHOT_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("snapshot transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("snapshot transaction aborted"));
  });
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

export async function deleteRawSnapshot(jobId: string): Promise<void> {
  const key = snapshotStorageKey(jobId);
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).delete(key);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
