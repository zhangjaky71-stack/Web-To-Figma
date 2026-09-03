from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  const snapshot = await evaluate(
    extensionClient,
    `(async () => {
      const module = await import(chrome.runtime.getURL("runtime/snapshot-store.js"));
      return module.readRawSnapshot(${JSON.stringify(job.jobId)});
    })()`,
    30000,
  );'''

new = '''  const snapshot = await evaluate(
    extensionClient,
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("w2f-capture-snapshots", 2);
        request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const value = await new Promise((resolve, reject) => {
          const transaction = database.transaction("rawSnapshots", "readonly");
          const request = transaction.objectStore("rawSnapshots").get(
            ${JSON.stringify(`raw-snapshot:${job.jobId}`)},
          );
          request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
          request.onsuccess = () => resolve(request.result ?? null);
        });
        return value;
      } finally {
        database.close();
      }
    })()`,
    30000,
  );'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("RawSnapshot dynamic-import evidence anchor missing")

old_assertion = '          "completed-job-persists-raw-snapshot",\n'
new_assertion = '''          "completed-job-persists-raw-snapshot",\n          "service-worker-origin-indexeddb-exposes-persisted-raw-snapshot",\n'''
if old_assertion in text and "service-worker-origin-indexeddb-exposes-persisted-raw-snapshot" not in text:
    text = text.replace(old_assertion, new_assertion, 1)
elif "service-worker-origin-indexeddb-exposes-persisted-raw-snapshot" not in text:
    raise SystemExit("RawSnapshot evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 ServiceWorker IndexedDB RawSnapshot evidence candidate materialized in working tree.")
