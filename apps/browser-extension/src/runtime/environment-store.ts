import { isEnvironmentCapture, type EnvironmentCapture } from "@w2f/environment-capture";

export const W2F_ENVIRONMENT_DB_NAME = "w2f-environment" as const;
export const W2F_ENVIRONMENT_STORE_NAME = "captures" as const;
export const W2F_ENVIRONMENT_DB_VERSION = 1 as const;
export const W2F_ENVIRONMENT_KEY_PREFIX = "environment:" as const;

export function environmentStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_ENVIRONMENT_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_ENVIRONMENT_DB_NAME, W2F_ENVIRONMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_ENVIRONMENT_STORE_NAME)) {
        database.createObjectStore(W2F_ENVIRONMENT_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open environment database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("environment transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("environment transaction aborted"));
  });
}

export async function writeEnvironmentCapture(
  jobId: string,
  capture: EnvironmentCapture,
): Promise<string> {
  if (!isEnvironmentCapture(capture)) throw new TypeError("invalid EnvironmentCapture");
  const key = environmentStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ENVIRONMENT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_ENVIRONMENT_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readEnvironmentCapture(jobId: string): Promise<EnvironmentCapture | null> {
  const key = environmentStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ENVIRONMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_ENVIRONMENT_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read environment capture"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isEnvironmentCapture(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteEnvironmentCapture(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ENVIRONMENT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_ENVIRONMENT_STORE_NAME).delete(environmentStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
