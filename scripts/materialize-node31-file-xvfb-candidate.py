from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

headless_line = '      "--headless=new",\n'
if headless_line in text:
    text = text.replace(headless_line, "", 1)
elif '"--headless=new"' in text:
    raise SystemExit("unexpected headless flag formatting")

artifact_anchor = '        browserExecutable: chromePath,\n'
artifact_replacement = '''        browserExecutable: chromePath,\n        displayEnvironment: "xvfb",\n        headless: false,\n'''
if artifact_anchor in text:
    text = text.replace(artifact_anchor, artifact_replacement, 1)
elif artifact_replacement not in text:
    raise SystemExit("Xvfb evidence metadata anchor missing")

assertion_anchor = '          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",\n'
assertion_replacement = '''          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",\n          "real-chrome-extension-action-runs-under-xvfb-display",\n'''
if assertion_anchor in text:
    text = text.replace(assertion_anchor, assertion_replacement, 1)
elif assertion_replacement not in text:
    raise SystemExit("Xvfb evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 Xvfb file protocol candidate materialized in working tree.")
