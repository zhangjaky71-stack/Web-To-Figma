import { isCssCascadeCapture, type CssCascadeCapture } from "@w2f/css-cascade";

export const W2F_CSS_CASCADE_DB_NAME = "w2f-css-cascade" as const;
export const W2F_CSS_CASCADE_STORE_NAME = "captures" as const;
export const W2F_CSS_CASCADE_DB_VERSION = 1 as const;
export const W2F_CSS_CASCADE_KEY_PREFIX = "css-cascade:" as const;

export function cssCascadeStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_CSS_CASCADE_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_CSS_CASCADE_DB_NAME, W2F_CSS_CASCADE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_CSS_CASCADE_STORE_NAME)) {
        database.createObjectStore(W2F_CSS_CASCADE_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open CSS cascade database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("CSS cascade transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("CSS cascade transaction aborted"));
  });
}

export async function writeCssCascadeCapture(
  jobId: string,
  capture: CssCascadeCapture,
): Promise<string> {
  if (!isCssCascadeCapture(capture)) throw new TypeError("invalid CssCascadeCapture");
  const key = cssCascadeStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_CSS_CASCADE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_CSS_CASCADE_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readCssCascadeCapture(jobId: string): Promise<CssCascadeCapture | null> {
  const key = cssCascadeStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_CSS_CASCADE_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_CSS_CASCADE_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read CSS cascade capture"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isCssCascadeCapture(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteCssCascadeCapture(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_CSS_CASCADE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_CSS_CASCADE_STORE_NAME).delete(cssCascadeStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
