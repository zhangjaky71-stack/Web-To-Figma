from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

standard_root = 'const extensionRoot = resolve("apps/browser-extension/dist");'
high_fidelity_root = 'const extensionRoot = resolve("apps/browser-extension/dist-high-fidelity");'
if standard_root in text:
    text = text.replace(standard_root, high_fidelity_root, 1)
elif high_fidelity_root not in text:
    raise SystemExit("file protocol extension-root anchor missing")

adapter_old = '''  assert(
    job?.capture?.adapter === "standard" || job?.capture?.adapter === "cdp",
    `Completed job did not report a production capture adapter: ${job?.capture?.adapter}`,
  );'''
adapter_new = '''  assert(
    job?.capture?.adapter === "cdp",
    `High Fidelity file capture did not use the production CDP adapter: ${job?.capture?.adapter}`,
  );'''
if adapter_old in text:
    text = text.replace(adapter_old, adapter_new, 1)
elif adapter_new not in text:
    raise SystemExit("file protocol capture-adapter assertion anchor missing")

for old, new in (
    (
        '        extensionArtifact: "apps/browser-extension/dist",\n',
        '        extensionArtifact: "apps/browser-extension/dist-high-fidelity",\n        captureProfile: "high-fidelity",\n',
    ),
    (
        '        serviceWorkerArtifact: "apps/browser-extension/dist/runtime/service-worker.js",\n',
        '        serviceWorkerArtifact: "apps/browser-extension/dist-high-fidelity/runtime/service-worker.js",\n',
    ),
    (
        '        sourceRuntimeArtifact: "apps/browser-extension/dist/runtime/source-runtime.js",\n',
        '        sourceRuntimeArtifact: "apps/browser-extension/dist-high-fidelity/runtime/source-runtime.js",\n',
    ),
    (
        '        snapshotStoreArtifact: "apps/browser-extension/dist/runtime/snapshot-store.js",\n',
        '        snapshotStoreArtifact: "apps/browser-extension/dist-high-fidelity/runtime/snapshot-store.js",\n',
    ),
):
    if old in text:
        text = text.replace(old, new, 1)
    elif new.strip() not in text:
        raise SystemExit(f"High Fidelity evidence anchor missing: {old.strip()}")

assertion_old = '          "completed-job-uses-production-capture-adapter",\n'
assertion_new = '          "completed-job-uses-high-fidelity-cdp-capture-adapter",\n'
if assertion_old in text:
    text = text.replace(assertion_old, assertion_new, 1)
elif assertion_new not in text:
    raise SystemExit("High Fidelity capture evidence assertion anchor missing")

for old_version in (
    '        version: "1.6.0",\n',
    '        version: "1.7.0",\n',
    '        version: "1.8.0",\n',
):
    if old_version in text:
        text = text.replace(old_version, '        version: "1.9.0",\n', 1)
        break

path.write_text(text)
print("NODE-31 High Fidelity file-protocol profile candidate materialized in working tree.")
