from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

send_old = '''  send(method, params = {}, sessionId) {'''
send_new = '''  send(method, params = {}, sessionId, timeoutMs = 10000) {'''
if send_old in text:
    text = text.replace(send_old, send_new, 1)
elif send_new not in text:
    raise SystemExit("CDP send timeout signature anchor missing")

timeout_old = '''        reject(new Error(`Timed out waiting for CDP pipe response: ${method}.\\n${this.stderr()}`));
      }, 10000);'''
timeout_new = '''        reject(new Error(`Timed out waiting for CDP pipe response: ${method}.\\n${this.stderr()}`));
      }, timeoutMs);'''
if timeout_old in text:
    text = text.replace(timeout_old, timeout_new, 1)
elif timeout_new not in text:
    raise SystemExit("CDP send timeout body anchor missing")

bootstrap_old = '''  const browserVersion = await browserClient.send("Browser.getVersion");'''
bootstrap_new = '''  const browserVersion = await browserClient.send(
    "Browser.getVersion",
    {},
    undefined,
    60000,
  );'''
if bootstrap_old in text:
    text = text.replace(bootstrap_old, bootstrap_new, 1)
elif bootstrap_new not in text:
    raise SystemExit("Browser.getVersion bootstrap anchor missing")

path.write_text(text)
print("NODE-31 file protocol bootstrap timeout candidate materialized in working tree.")
