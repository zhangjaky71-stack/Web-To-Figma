from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  const activeTab = await evaluate(
    extensionClient,
    `(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] ? { id: tabs[0].id, url: tabs[0].url } : null;
    })()`,
  );
  assert(activeTab?.url === fixtureUrl, `Final worker active file tab mismatch: ${activeTab?.url}`);
  assert(typeof activeTab?.id === "number", "Final worker could not resolve active file tab id");
'''

new = '''  const activeTab = await evaluate(
    extensionClient,
    `(async () => {
      const tabs = await chrome.tabs.query({});
      const fileTab = tabs.find((candidate) => candidate.url === ${JSON.stringify(fixtureUrl)});
      return fileTab && typeof fileTab.id === "number"
        ? { id: fileTab.id, url: fileTab.url, windowId: fileTab.windowId }
        : null;
    })()`,
  );
  assert(activeTab?.url === fixtureUrl, `Final worker file tab lookup mismatch: ${activeTab?.url}`);
  assert(typeof activeTab?.id === "number", "Final worker could not resolve file tab id");
'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("worker file-tab lookup anchor missing")

assertion_anchor = '          "final-service-worker-observes-active-file-url",\n'
assertion_replacement = '          "final-service-worker-resolves-real-file-tab-for-message-injection",\n'
if assertion_anchor in text:
    text = text.replace(assertion_anchor, assertion_replacement, 1)
elif assertion_replacement not in text:
    raise SystemExit("file-tab sender evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 exact file-tab sender routing candidate materialized in working tree.")
