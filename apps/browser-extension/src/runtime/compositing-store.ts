import {
  isCompositingAnalysisResult,
  type CompositingAnalysisResult,
} from "@w2f/compositing-engine";

export const W2F_COMPOSITING_DB_NAME = "w2f-compositing" as const;
export const W2F_COMPOSITING_STORE_NAME = "captures" as const;
export const W2F_COMPOSITING_DB_VERSION = 1 as const;
export const W2F_COMPOSITING_KEY_PREFIX = "compositing:" as const;

export function compositingStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_COMPOSITING_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_COMPOSITING_DB_NAME, W2F_COMPOSITING_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_COMPOSITING_STORE_NAME)) {
        database.createObjectStore(W2F_COMPOSITING_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open compositing database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("compositing transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("compositing transaction aborted"));
  });
}

export async function writeCompositingAnalysis(
  jobId: string,
  result: CompositingAnalysisResult,
): Promise<string> {
  if (!isCompositingAnalysisResult(result))
    throw new TypeError("invalid CompositingAnalysisResult");
  const key = compositingStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_COMPOSITING_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_COMPOSITING_STORE_NAME).put(result, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readCompositingAnalysis(
  jobId: string,
): Promise<CompositingAnalysisResult | null> {
  const key = compositingStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_COMPOSITING_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_COMPOSITING_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read CompositingAnalysisResult"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isCompositingAnalysisResult(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteCompositingAnalysis(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_COMPOSITING_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_COMPOSITING_STORE_NAME).delete(compositingStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
