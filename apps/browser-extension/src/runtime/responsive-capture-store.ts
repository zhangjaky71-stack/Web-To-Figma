import { isResponsiveCapture, type ResponsiveCapture } from "@w2f/responsive-capture";

export const W2F_RESPONSIVE_DB_NAME = "w2f-responsive-capture" as const;
export const W2F_RESPONSIVE_STORE_NAME = "captures" as const;
export const W2F_RESPONSIVE_DB_VERSION = 1 as const;
export const W2F_RESPONSIVE_KEY_PREFIX = "responsive:" as const;

export function responsiveCaptureStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_RESPONSIVE_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_RESPONSIVE_DB_NAME, W2F_RESPONSIVE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_RESPONSIVE_STORE_NAME)) {
        database.createObjectStore(W2F_RESPONSIVE_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open responsive database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("responsive transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("responsive transaction aborted"));
  });
}

export async function writeResponsiveCapture(jobId: string, capture: ResponsiveCapture): Promise<string> {
  if (!isResponsiveCapture(capture)) throw new TypeError("invalid ResponsiveCapture");
  const key = responsiveCaptureStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_RESPONSIVE_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readResponsiveCapture(jobId: string): Promise<ResponsiveCapture | null> {
  const key = responsiveCaptureStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_RESPONSIVE_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read ResponsiveCapture"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isResponsiveCapture(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteResponsiveCapture(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_RESPONSIVE_STORE_NAME).delete(responsiveCaptureStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
