from pathlib import Path

VALIDATOR_REPLACEMENTS = {
    "scripts/validate-foundation.mjs": [(
        '''  assert(\n    !("host_permissions" in browserManifest),\n    "region selection must not introduce broad default host permissions",\n  );''',
        '''  const browserHostPermissions = [...(browserManifest.host_permissions ?? [])].sort();\n  assert(\n    JSON.stringify(browserHostPermissions) === JSON.stringify(["file:///*"]),\n    "browser host permissions must remain limited to file:///* for explicit local-file capture",\n  );''',
    )],
    "scripts/validate-node-08.mjs": [(
        '''  assert(!("host_permissions" in manifest), "NODE-08 must not add broad host permissions");''',
        '''  assert(\n    JSON.stringify([...(manifest.host_permissions ?? [])].sort()) ===\n      JSON.stringify(["file:///*"]),\n    "NODE-08 host permissions must remain limited to file:///*",\n  );''',
    )],
    "scripts/validate-node-09.mjs": [(
        '''  for (const manifest of [standardManifest, highManifest]) {\n    assert(!("host_permissions" in manifest), "NODE-09 must not add broad host permissions");\n    assert(!("content_scripts" in manifest), "NODE-09 must preserve user-action content injection");\n  }''',
        '''  for (const manifest of [standardManifest, highManifest]) {\n    assert(\n      JSON.stringify([...(manifest.host_permissions ?? [])].sort()) ===\n        JSON.stringify(["file:///*"]),\n      "NODE-09 host permissions must remain limited to file:///*",\n    );\n    assert(!("content_scripts" in manifest), "NODE-09 must preserve user-action content injection");\n  }''',
    )],
    "apps/browser-extension/scripts/validate-extension-package.mjs": [(
        '''assert(\n  !("host_permissions" in manifest),\n  "capture profiles must not request broad host permissions",\n);''',
        '''const hostPermissions = [...(manifest.host_permissions ?? [])].sort();\nassert(\n  JSON.stringify(hostPermissions) === JSON.stringify(["file:///*"]),\n  "capture profiles must request only file:///* host permission",\n);''',
    )],
}

for name, replacements in VALIDATOR_REPLACEMENTS.items():
    path = Path(name)
    text = path.read_text()
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
        elif new not in text:
            raise SystemExit(f"expected validator anchor missing in {name}")
    path.write_text(text)

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old_state = '''  await updateFileAccess(primaryClient, extensionId, false);\n  await navigate(primaryClient, extensionPageUrl, "extension options with file access disabled");\n  const disabledAccess = await evaluate(\n    primaryClient,\n    `chrome.extension.isAllowedFileSchemeAccess()`,\n  );\n  assert(disabledAccess === false, "Explicit file URL access disable did not take effect");\n\n  await navigate(primaryClient, "chrome://extensions/", "chrome://extensions after disable");\n  await waitFor(\n    primaryClient,\n    `typeof chrome?.developerPrivate?.updateExtensionConfiguration === "function"`,\n    "chrome.developerPrivate did not recover after extension reload",\n  );\n  await updateFileAccess(primaryClient, extensionId, true);\n  await navigate(primaryClient, extensionPageUrl, "extension options with file access enabled");\n  const enabledAccess = await evaluate(\n    primaryClient,\n    `chrome.extension.isAllowedFileSchemeAccess()`,\n  );\n  assert(enabledAccess === true, "Explicit file URL access enable did not take effect");'''

new_state = '''  console.log("NODE-31 file protocol: disabling explicit file access");\n  await updateFileAccess(primaryClient, extensionId, false);\n  await waitFor(\n    primaryClient,\n    `new Promise((resolvePromise, reject) => {\n      chrome.developerPrivate.getExtensionInfo(\n        ${JSON.stringify(extensionId)},\n        (info) => chrome.runtime.lastError\n          ? reject(new Error(chrome.runtime.lastError.message))\n          : resolvePromise(info.fileAccess?.isEnabled === true && info.fileAccess?.isActive === false),\n      );\n    })`,\n    "Chrome extension management state did not report file access disabled",\n  );\n  const disabledAccess = await evaluate(\n    primaryClient,\n    `new Promise((resolvePromise, reject) => {\n      chrome.developerPrivate.getExtensionInfo(\n        ${JSON.stringify(extensionId)},\n        (info) => chrome.runtime.lastError\n          ? reject(new Error(chrome.runtime.lastError.message))\n          : resolvePromise(info.fileAccess ?? null),\n      );\n    })`,\n  );\n  assert(disabledAccess?.isEnabled === true, "File access permission toggle is unavailable");\n  assert(disabledAccess?.isActive === false, "Explicit file URL access disable did not take effect");\n\n  console.log("NODE-31 file protocol: enabling explicit file access");\n  await updateFileAccess(primaryClient, extensionId, true);\n  await waitFor(\n    primaryClient,\n    `new Promise((resolvePromise, reject) => {\n      chrome.developerPrivate.getExtensionInfo(\n        ${JSON.stringify(extensionId)},\n        (info) => chrome.runtime.lastError\n          ? reject(new Error(chrome.runtime.lastError.message))\n          : resolvePromise(info.fileAccess?.isEnabled === true && info.fileAccess?.isActive === true),\n      );\n    })`,\n    "Chrome extension management state did not report file access enabled",\n  );\n  const enabledAccess = await evaluate(\n    primaryClient,\n    `new Promise((resolvePromise, reject) => {\n      chrome.developerPrivate.getExtensionInfo(\n        ${JSON.stringify(extensionId)},\n        (info) => chrome.runtime.lastError\n          ? reject(new Error(chrome.runtime.lastError.message))\n          : resolvePromise(info.fileAccess ?? null),\n      );\n    })`,\n  );\n  assert(enabledAccess?.isEnabled === true, "File access permission toggle became unavailable");\n  assert(enabledAccess?.isActive === true, "Explicit file URL access enable did not take effect");'''

if old_state in text:
    text = text.replace(old_state, new_state, 1)
elif new_state not in text:
    raise SystemExit("file-access state transition anchor missing")

helper_marker = "async function updateFileAccess"
worker_helper = '''async function createExtensionWorkerSession(browserClient, extensionId) {\n  for (let attempt = 0; attempt < 80; attempt += 1) {\n    const targets = await browserClient.send("Target.getTargets");\n    const worker = targets.targetInfos?.find(\n      (target) =>\n        target.type === "service_worker" &&\n        target.url.startsWith(`chrome-extension://${extensionId}/`),\n    );\n    if (worker?.targetId) {\n      const attached = await browserClient.send("Target.attachToTarget", {\n        targetId: worker.targetId,\n        flatten: true,\n      });\n      assert(attached.sessionId, "Unable to attach to extension service worker");\n      const client = browserClient.session(attached.sessionId);\n      await client.send("Runtime.enable");\n      await client.send("Runtime.runIfWaitingForDebugger");\n      return client;\n    }\n    await delay(25);\n  }\n  const targets = await browserClient.send("Target.getTargets");\n  const summary = (targets.targetInfos ?? []).map((target) => ({\n    type: target.type,\n    url: target.url,\n  }));\n  throw new Error(`Extension service worker target not found. Targets: ${JSON.stringify(summary)}`);\n}\n\n'''

if "async function createExtensionWorkerSession" not in text:
    if helper_marker not in text:
        raise SystemExit("worker helper insertion marker missing")
    text = text.replace(helper_marker, worker_helper + helper_marker, 1)
elif 'await client.send("Runtime.runIfWaitingForDebugger");' not in text:
    text = text.replace(
        '      await client.send("Runtime.enable");\n      return client;',
        '      await client.send("Runtime.enable");\n      await client.send("Runtime.runIfWaitingForDebugger");\n      return client;',
        1,
    )

old_helper = '''  const helper = await createPageSession(browserClient, extensionPageUrl, "extension helper");\n  const extensionClient = helper.client;\n  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });\n  await delay(100);\n\n  const activeTabUrl = await evaluate(\n    extensionClient,\n    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.url ?? null)`,\n  );\n  assert(activeTabUrl === fixtureUrl, `Active extension-visible tab mismatch: ${activeTabUrl}`);\n  assert(\n    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,\n    "Extension helper did not retain enabled file access",\n  );'''

new_helper = '''  console.log("NODE-31 file protocol: attaching final MV3 service worker");\n  const extensionClient = await createExtensionWorkerSession(browserClient, extensionId);\n  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });\n  await delay(100);\n\n  console.log("NODE-31 file protocol: checking MV3 worker APIs");\n  assert(\n    (await evaluate(extensionClient, `typeof chrome?.tabs?.query === "function"`)) === true,\n    "Final MV3 service worker does not expose chrome.tabs.query",\n  );\n  assert(\n    (await evaluate(extensionClient, `typeof chrome?.scripting?.executeScript === "function"`)) === true,\n    "Final MV3 service worker does not expose chrome.scripting.executeScript",\n  );\n  const activeTabUrl = await evaluate(\n    extensionClient,\n    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.url ?? null)`,\n  );\n  assert(activeTabUrl === fixtureUrl, `Active extension-visible tab mismatch: ${activeTabUrl}`);\n  assert(\n    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,\n    "Final MV3 service worker did not retain enabled file access",\n  );'''

if old_helper in text:
    text = text.replace(old_helper, new_helper, 1)
elif new_helper not in text:
    raise SystemExit("extension helper block anchor missing")

if 'version: "1.1.0"' in text:
    text = text.replace('version: "1.1.0"', 'version: "1.4.0"', 1)
elif 'version: "1.4.0"' not in text:
    text = text.replace('version: "1.3.0"', 'version: "1.4.0"', 1)

text = text.replace(
    '"public-extension-api-reports-file-access-disabled",',
    '"chrome-management-state-reports-file-access-disabled",',
    1,
)
text = text.replace(
    '"public-extension-api-reports-file-access-enabled",',
    '"chrome-management-state-reports-file-access-enabled",\n          "mv3-service-worker-public-api-reports-file-access-enabled",\n          "mv3-service-worker-exposes-tabs-and-scripting",',
    1,
)

path.write_text(text)
print("NODE-31 file permission candidate materialized in working tree.")
