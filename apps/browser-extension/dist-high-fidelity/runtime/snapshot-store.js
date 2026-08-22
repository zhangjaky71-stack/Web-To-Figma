import { isRawSnapshot } from "./capture-core/index.js";
export const W2F_SNAPSHOT_DB_NAME = "w2f-capture-snapshots";
export const W2F_SNAPSHOT_STORE_NAME = "rawSnapshots";
export const W2F_REFERENCE_SCREENSHOT_STORE_NAME = "referenceScreenshots";
export const W2F_SNAPSHOT_DB_VERSION = 2;
export const W2F_SNAPSHOT_KEY_PREFIX = "raw-snapshot:";
export const W2F_REFERENCE_SCREENSHOT_KEY_PREFIX = "reference-screenshot:";
export function snapshotStorageKey(jobId) {
    const normalized = jobId.trim();
    if (!normalized)
        throw new TypeError("jobId must be non-empty");
    return `${W2F_SNAPSHOT_KEY_PREFIX}${normalized}`;
}
export function referenceScreenshotStorageKey(jobId) {
    const normalized = jobId.trim();
    if (!normalized)
        throw new TypeError("jobId must be non-empty");
    return `${W2F_REFERENCE_SCREENSHOT_KEY_PREFIX}${normalized}`;
}
function openSnapshotDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(W2F_SNAPSHOT_DB_NAME, W2F_SNAPSHOT_DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(W2F_SNAPSHOT_STORE_NAME)) {
                database.createObjectStore(W2F_SNAPSHOT_STORE_NAME);
            }
            if (!database.objectStoreNames.contains(W2F_REFERENCE_SCREENSHOT_STORE_NAME)) {
                database.createObjectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME);
            }
        };
        request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
        request.onsuccess = () => resolve(request.result);
    });
}
function waitForTransaction(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("snapshot transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("snapshot transaction aborted"));
    });
}
function isReferenceScreenshotRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (record.format === "png" &&
        typeof record.dataBase64 === "string" &&
        record.dataBase64.length > 0 &&
        record.captureBeyondViewport === true);
}
export async function writeRawSnapshot(jobId, snapshot) {
    if (!isRawSnapshot(snapshot))
        throw new TypeError("invalid RawSnapshot");
    const key = snapshotStorageKey(jobId);
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readwrite");
        transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).put(snapshot, key);
        await waitForTransaction(transaction);
        return key;
    }
    finally {
        database.close();
    }
}
export async function readRawSnapshot(jobId) {
    const key = snapshotStorageKey(jobId);
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readonly");
        const request = transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).get(key);
        const value = await new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
            request.onsuccess = () => resolve(request.result);
        });
        await waitForTransaction(transaction);
        return isRawSnapshot(value) ? value : null;
    }
    finally {
        database.close();
    }
}
export async function writeReferenceScreenshot(jobId, screenshot) {
    if (!isReferenceScreenshotRecord(screenshot))
        throw new TypeError("invalid reference screenshot");
    const key = referenceScreenshotStorageKey(jobId);
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction(W2F_REFERENCE_SCREENSHOT_STORE_NAME, "readwrite");
        transaction.objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME).put(screenshot, key);
        await waitForTransaction(transaction);
        return key;
    }
    finally {
        database.close();
    }
}
export async function readReferenceScreenshot(jobId) {
    const key = referenceScreenshotStorageKey(jobId);
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction(W2F_REFERENCE_SCREENSHOT_STORE_NAME, "readonly");
        const request = transaction.objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME).get(key);
        const value = await new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error ?? new Error("failed to read reference screenshot"));
            request.onsuccess = () => resolve(request.result);
        });
        await waitForTransaction(transaction);
        return isReferenceScreenshotRecord(value) ? value : null;
    }
    finally {
        database.close();
    }
}
export async function deleteCaptureArtifacts(jobId) {
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction([W2F_SNAPSHOT_STORE_NAME, W2F_REFERENCE_SCREENSHOT_STORE_NAME], "readwrite");
        transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).delete(snapshotStorageKey(jobId));
        transaction
            .objectStore(W2F_REFERENCE_SCREENSHOT_STORE_NAME)
            .delete(referenceScreenshotStorageKey(jobId));
        await waitForTransaction(transaction);
    }
    finally {
        database.close();
    }
}
export async function deleteRawSnapshot(jobId) {
    const database = await openSnapshotDatabase();
    try {
        const transaction = database.transaction(W2F_SNAPSHOT_STORE_NAME, "readwrite");
        transaction.objectStore(W2F_SNAPSHOT_STORE_NAME).delete(snapshotStorageKey(jobId));
        await waitForTransaction(transaction);
    }
    finally {
        database.close();
    }
}
//# sourceMappingURL=snapshot-store.js.map