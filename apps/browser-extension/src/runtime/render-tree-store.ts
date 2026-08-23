import {
  isRenderTreeOptimizationResult,
  type RenderTreeOptimizationResult,
} from "@w2f/render-tree-optimizer";

export const W2F_RENDER_TREE_DB_NAME = "w2f-render-tree" as const;
export const W2F_RENDER_TREE_STORE_NAME = "captures" as const;
export const W2F_RENDER_TREE_DB_VERSION = 1 as const;
export const W2F_RENDER_TREE_KEY_PREFIX = "render-tree:" as const;

export function renderTreeStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_RENDER_TREE_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(W2F_RENDER_TREE_DB_NAME, W2F_RENDER_TREE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_RENDER_TREE_STORE_NAME)) {
        database.createObjectStore(W2F_RENDER_TREE_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("failed to open render tree database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("render tree transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("render tree transaction aborted"));
  });
}

export async function writeRenderTreeOptimization(
  jobId: string,
  result: RenderTreeOptimizationResult,
): Promise<string> {
  if (!isRenderTreeOptimizationResult(result)) {
    throw new TypeError("invalid RenderTreeOptimizationResult");
  }
  const key = renderTreeStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RENDER_TREE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_RENDER_TREE_STORE_NAME).put(result, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readRenderTreeOptimization(
  jobId: string,
): Promise<RenderTreeOptimizationResult | null> {
  const key = renderTreeStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RENDER_TREE_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_RENDER_TREE_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read RenderTreeOptimizationResult"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isRenderTreeOptimizationResult(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteRenderTreeOptimization(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RENDER_TREE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_RENDER_TREE_STORE_NAME).delete(renderTreeStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
