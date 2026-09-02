from pathlib import Path

path = Path("scripts/validate-foundation.mjs")
text = path.read_text()

old = '''  assert(
    browserSourceRuntime.includes("isAllowedFileSchemeAccess"),
    "Browser source runtime must check Chrome file-scheme access explicitly",
  );
'''
new = '''  assert(
    browserSourceRuntime.includes("chrome.permissions.contains") &&
      browserSourceRuntime.includes('"file:///*"'),
    "Browser source runtime must check active file host permission via MV3 permissions API",
  );
'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("foundation file-scheme permission assertion anchor missing")

path.write_text(text)
print("NODE-31 MV3 file-permission foundation validator candidate materialized in working tree.")
