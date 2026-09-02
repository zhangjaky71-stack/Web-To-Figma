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
      if (
        !fileTab ||
        typeof fileTab.id !== "number" ||
        typeof fileTab.windowId !== "number"
      ) {
        return null;
      }
      await chrome.tabs.update(fileTab.id, { active: true });
      await chrome.windows.update(fileTab.windowId, { focused: true });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = currentTabs[0];
      return {
        id: fileTab.id,
        url: fileTab.url,
        windowId: fileTab.windowId,
        currentId: currentTab?.id ?? null,
        currentUrl: currentTab?.url ?? null,
      };
    })()`,
  );
  assert(activeTab?.url === fixtureUrl, `Final worker file tab lookup mismatch: ${activeTab?.url}`);
  assert(typeof activeTab?.id === "number", "Final worker could not resolve file tab id");
  assert(
    activeTab?.currentId === activeTab?.id && activeTab?.currentUrl === fixtureUrl,
    `Final worker could not restore file tab as active current-window source: ${activeTab?.currentUrl}`,
  );
'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("worker active-tab focus restoration anchor missing")

assertion_anchor = '          "final-service-worker-observes-active-file-url",\n'
assertion_replacement = '          "final-service-worker-refocuses-real-file-tab-window",\n'
if assertion_anchor in text:
    text = text.replace(assertion_anchor, assertion_replacement, 1)
elif assertion_replacement not in text:
    raise SystemExit("file-tab focus evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 file-tab window focus restoration candidate materialized in working tree.")
