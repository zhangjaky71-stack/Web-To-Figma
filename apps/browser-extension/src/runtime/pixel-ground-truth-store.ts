import { isPixelGroundTruth, type PixelGroundTruthCapture } from "@w2f/pixel-ground-truth";

export const W2F_PIXEL_DB_NAME = "w2f-pixel-ground-truth" as const;
export const W2F_PIXEL_STORE_NAME = "captures" as const;
export const W2F_PIXEL_DB_VERSION = 1 as const;
export const W2F_PIXEL_KEY_PREFIX = "pixel-ground-truth:" as const;

export function pixelGroundTruthStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_PIXEL_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_PIXEL_DB_NAME, W2F_PIXEL_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_PIXEL_STORE_NAME)) {
        database.createObjectStore(W2F_PIXEL_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open pixel ground truth database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("pixel ground truth transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("pixel ground truth transaction aborted"));
  });
}

export async function writePixelGroundTruth(
  jobId: string,
  capture: PixelGroundTruthCapture,
): Promise<string> {
  if (!isPixelGroundTruth(capture)) throw new TypeError("invalid PixelGroundTruthCapture");
  const key = pixelGroundTruthStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_PIXEL_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_PIXEL_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readPixelGroundTruth(jobId: string): Promise<PixelGroundTruthCapture | null> {
  const key = pixelGroundTruthStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_PIXEL_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_PIXEL_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read pixel ground truth capture"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isPixelGroundTruth(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deletePixelGroundTruth(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_PIXEL_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_PIXEL_STORE_NAME).delete(pixelGroundTruthStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
