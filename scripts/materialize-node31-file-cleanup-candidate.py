from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

state_old = '''let browserClient;\nlet chromeStderr = "";'''
state_new = '''let browserClient;\nlet chromeStderr = "";\nlet runError;'''
if state_old in text:
    text = text.replace(state_old, state_new, 1)
elif state_new not in text:
    raise SystemExit("primary error state anchor missing")

finally_old = '''} finally {\n  browserClient?.close();\n  await stopChrome(chromeProcess);\n  await removeProfileDir(profileDir);\n}'''
finally_new = '''} catch (error) {\n  runError = error;\n  throw error;\n} finally {\n  browserClient?.close();\n  try {\n    await stopChrome(chromeProcess);\n  } catch (cleanupError) {\n    if (!runError) throw cleanupError;\n    console.warn(\n      `NODE-31 Chrome cleanup warning after primary failure: ${String(cleanupError)}`,\n    );\n  } finally {\n    await removeProfileDir(profileDir);\n  }\n}'''
if finally_old in text:
    text = text.replace(finally_old, finally_new, 1)
elif finally_new not in text:
    raise SystemExit("cleanup error preservation anchor missing")

path.write_text(text)
print("NODE-31 file protocol cleanup error-preservation candidate materialized in working tree.")
