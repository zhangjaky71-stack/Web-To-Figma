from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  console.log("NODE-31 file protocol: navigating trusted extension origin to final packaged popup");\n  await navigate(primaryClient, extensionPageUrl, "extension options before final packaged popup");'''
new = '''  console.log("NODE-31 file protocol: navigating trusted extension origin to final packaged popup");\n  const extensionOptionsUrl = `chrome-extension://${extensionId}/options.html`;\n  await navigate(\n    primaryClient,\n    extensionOptionsUrl,\n    "extension options before final packaged popup",\n  );'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("trusted extension popup options URL anchor missing")

path.write_text(text)
print("NODE-31 explicit popup options URL candidate materialized in working tree.")
