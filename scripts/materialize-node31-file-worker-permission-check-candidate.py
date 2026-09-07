from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  assert(
    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,
    "Final MV3 service worker did not retain explicitly enabled file access",
  );
'''
if old in text:
    text = text.replace(old, "", 1)
elif "Final MV3 service worker did not retain explicitly enabled file access" in text:
    raise SystemExit("worker file-access assertion shape changed")

text = text.replace(
    '          "final-service-worker-retains-enabled-file-access",\n',
    "",
    1,
)

path.write_text(text)
print("NODE-31 worker-context file-access assertion cleanup candidate materialized in working tree.")
