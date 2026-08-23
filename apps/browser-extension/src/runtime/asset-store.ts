import { isAssetCapture, type AssetCapture } from "@w2f/asset-resolver";

export const W2F_ASSET_DB_NAME = "w2f-assets" as const;
export const W2F_ASSET_STORE_NAME = "captures" as const;
export const W2F_ASSET_DB_VERSION = 1 as const;
export const W2F_ASSET_KEY_PREFIX = "assets:" as const;

export function assetStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_ASSET_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_ASSET_DB_NAME, W2F_ASSET_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_ASSET_STORE_NAME)) {
        database.createObjectStore(W2F_ASSET_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open asset database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("asset transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("asset transaction aborted"));
  });
}

export async function writeAssetCapture(jobId: string, capture: AssetCapture): Promise<string> {
  if (!isAssetCapture(capture)) throw new TypeError("invalid AssetCapture");
  const key = assetStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_ASSET_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readAssetCapture(jobId: string): Promise<AssetCapture | null> {
  const key = assetStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ASSET_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_ASSET_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read asset capture"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isAssetCapture(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteAssetCapture(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_ASSET_STORE_NAME).delete(assetStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
