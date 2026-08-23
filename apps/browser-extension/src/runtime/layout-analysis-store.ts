import { isBaseLayoutAnalysis, type BaseLayoutAnalysis } from "@w2f/layout-analyzer";

export const W2F_LAYOUT_ANALYSIS_DB_NAME = "w2f-layout-analysis" as const;
export const W2F_LAYOUT_ANALYSIS_STORE_NAME = "captures" as const;
export const W2F_LAYOUT_ANALYSIS_DB_VERSION = 1 as const;
export const W2F_LAYOUT_ANALYSIS_KEY_PREFIX = "layout-analysis:" as const;

export function layoutAnalysisStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_LAYOUT_ANALYSIS_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_LAYOUT_ANALYSIS_DB_NAME, W2F_LAYOUT_ANALYSIS_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_LAYOUT_ANALYSIS_STORE_NAME)) {
        database.createObjectStore(W2F_LAYOUT_ANALYSIS_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open layout analysis database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("layout analysis transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("layout analysis transaction aborted"));
  });
}

export async function writeBaseLayoutAnalysis(
  jobId: string,
  analysis: BaseLayoutAnalysis,
): Promise<string> {
  if (!isBaseLayoutAnalysis(analysis)) throw new TypeError("invalid BaseLayoutAnalysis");
  const key = layoutAnalysisStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_LAYOUT_ANALYSIS_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_LAYOUT_ANALYSIS_STORE_NAME).put(analysis, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readBaseLayoutAnalysis(jobId: string): Promise<BaseLayoutAnalysis | null> {
  const key = layoutAnalysisStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_LAYOUT_ANALYSIS_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_LAYOUT_ANALYSIS_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read BaseLayoutAnalysis"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isBaseLayoutAnalysis(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteBaseLayoutAnalysis(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_LAYOUT_ANALYSIS_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_LAYOUT_ANALYSIS_STORE_NAME).delete(layoutAnalysisStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
