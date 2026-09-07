from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  const extensionClient = browserClient.session(workerAttached.sessionId);
  await extensionClient.send("Runtime.enable");
  const workerUrl = await evaluate(extensionClient, `self.location.href`);'''
new = '''  const extensionClient = browserClient.session(workerAttached.sessionId);
  await extensionClient.send("Runtime.enable");
  await extensionClient.send("Runtime.runIfWaitingForDebugger").catch(() => undefined);
  await waitFor(
    extensionClient,
    `typeof chrome?.runtime?.id === "string" &&
      typeof chrome?.tabs?.query === "function" &&
      typeof chrome?.scripting?.executeScript === "function" &&
      typeof chrome?.debugger?.attach === "function"`,
    "Final High Fidelity MV3 worker extension APIs did not become ready after inspect start",
  );
  const workerUrl = await evaluate(extensionClient, `self.location.href`);'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("MV3 worker readiness anchor missing")

assertion_anchor = '          "trusted-chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",\n'
assertion_replacement = '''          "trusted-chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",\n          "inspected-high-fidelity-worker-resumes-and-exposes-required-extension-apis",\n'''
if assertion_anchor in text and "inspected-high-fidelity-worker-resumes-and-exposes-required-extension-apis" not in text:
    text = text.replace(assertion_anchor, assertion_replacement, 1)
elif "inspected-high-fidelity-worker-resumes-and-exposes-required-extension-apis" not in text:
    raise SystemExit("MV3 worker readiness evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 inspected High Fidelity worker readiness candidate materialized in working tree.")
