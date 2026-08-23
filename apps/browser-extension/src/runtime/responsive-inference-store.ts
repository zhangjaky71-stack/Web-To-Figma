import {
  isResponsiveInferenceResult,
  type ResponsiveInferenceResult,
} from "@w2f/responsive-inference";

export const W2F_RESPONSIVE_INFERENCE_DB_NAME = "w2f-responsive-inference" as const;
export const W2F_RESPONSIVE_INFERENCE_STORE_NAME = "captures" as const;
export const W2F_RESPONSIVE_INFERENCE_DB_VERSION = 1 as const;
export const W2F_RESPONSIVE_INFERENCE_KEY_PREFIX = "responsive-inference:" as const;

export function responsiveInferenceStorageKey(jobId: string): string {
  const normalized = jobId.trim();
  if (!normalized) throw new TypeError("jobId must be non-empty");
  return `${W2F_RESPONSIVE_INFERENCE_KEY_PREFIX}${normalized}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      W2F_RESPONSIVE_INFERENCE_DB_NAME,
      W2F_RESPONSIVE_INFERENCE_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(W2F_RESPONSIVE_INFERENCE_STORE_NAME)) {
        database.createObjectStore(W2F_RESPONSIVE_INFERENCE_STORE_NAME);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("failed to open responsive inference database"));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("responsive inference transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("responsive inference transaction aborted"));
  });
}

export async function writeResponsiveInference(
  jobId: string,
  capture: ResponsiveInferenceResult,
): Promise<string> {
  if (!isResponsiveInferenceResult(capture))
    throw new TypeError("invalid ResponsiveInferenceResult");
  const key = responsiveInferenceStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_INFERENCE_STORE_NAME, "readwrite");
    transaction.objectStore(W2F_RESPONSIVE_INFERENCE_STORE_NAME).put(capture, key);
    await waitForTransaction(transaction);
    return key;
  } finally {
    database.close();
  }
}

export async function readResponsiveInference(
  jobId: string,
): Promise<ResponsiveInferenceResult | null> {
  const key = responsiveInferenceStorageKey(jobId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_INFERENCE_STORE_NAME, "readonly");
    const request = transaction.objectStore(W2F_RESPONSIVE_INFERENCE_STORE_NAME).get(key);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error("failed to read ResponsiveInferenceResult"));
      request.onsuccess = () => resolve(request.result);
    });
    await waitForTransaction(transaction);
    return isResponsiveInferenceResult(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function deleteResponsiveInference(jobId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(W2F_RESPONSIVE_INFERENCE_STORE_NAME, "readwrite");
    transaction
      .objectStore(W2F_RESPONSIVE_INFERENCE_STORE_NAME)
      .delete(responsiveInferenceStorageKey(jobId));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
