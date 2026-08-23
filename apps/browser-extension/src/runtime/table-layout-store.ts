import { isTableLayoutResult, type TableLayoutResult } from "@w2f/table-layout-engine";

export const W2F_TABLE_LAYOUT_DB_NAME = "w2f-table-layout" as const;
export const W2F_TABLE_LAYOUT_STORE_NAME = "captures" as const;
export const W2F_TABLE_LAYOUT_DB_VERSION = 1 as const;
export const W2F_TABLE_LAYOUT_KEY_PREFIX = "table-layout:" as const;

export function tableLayoutStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_TABLE_LAYOUT_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_TABLE_LAYOUT_DB_NAME, W2F_TABLE_LAYOUT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_TABLE_LAYOUT_STORE_NAME)) {
        database.createObjectStore(W2F_TABLE_LAYOUT_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open table layout database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("table layout transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("table layout transaction aborted"));
  });
}

export async function writeTableLayoutResult(jobId: string, result: TableLayoutResult): Promise<string> {
  if (!isTableLayoutResult(result)) throw new TypeError("invalid TableLayoutResult");
  const key = tableLayoutStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_TABLE_LAYOUT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_TABLE_LAYOUT_STORE_NAME).put(result, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readTableLayoutResult(jobId: string): Promise<TableLayoutResult | null> {
  const key = tableLayoutStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_TABLE_LAYOUT_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_TABLE_LAYOUT_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to read TableLayoutResult"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isTableLayoutResult(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteTableLayoutResult(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_TABLE_LAYOUT_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_TABLE_LAYOUT_STORE_NAME).delete(tableLayoutStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
