from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  console.log("NODE-31 file protocol: starting final MV3 worker from registered extension root scope");
  await browserClient.send("ServiceWorker.enable");
  await browserClient.send("ServiceWorker.startWorker", { scopeURL: extensionScopeUrl });'''
new = '''  console.log("NODE-31 file protocol: inspecting inactive final MV3 worker through Chrome management API");
  assert(
    (await evaluate(
      primaryClient,
      `typeof chrome?.developerPrivate?.openDevTools === "function"`,
    )) === true,
    "chrome.developerPrivate.openDevTools is unavailable on chrome://extensions",
  );
  await evaluate(
    primaryClient,
    `(async () => {
      await chrome.developerPrivate.openDevTools({
        extensionId: ${JSON.stringify(extensionId)},
        renderViewId: -1,
        renderProcessId: -1,
        isServiceWorker: true,
        incognito: false,
      });
      return true;
    })()`,
    30000,
  );'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("inactive service-worker inspect anchor missing")

text = text.replace(
    '          "extension-service-worker-starts-from-registered-root-scope",',
    '          "chrome-management-open-devtools-starts-inactive-extension-service-worker",',
    1,
)

path.write_text(text)
print("NODE-31 inactive service-worker openDevTools candidate materialized in working tree.")
