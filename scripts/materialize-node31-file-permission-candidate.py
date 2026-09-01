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

if old_state not in text:
    raise SystemExit("file-access state transition anchor missing")
text = text.replace(old_state, new_state, 1)

old_flow = '''  const helper = await createPageSession(browserClient, extensionPageUrl, "extension helper");\n  const extensionClient = helper.client;\n  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });\n  await delay(100);\n\n  const activeTabUrl = await evaluate(\n    extensionClient,\n    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.url ?? null)`,\n  );\n  assert(activeTabUrl === fixtureUrl, `Active extension-visible tab mismatch: ${activeTabUrl}`);\n  assert(\n    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,\n    "Extension helper did not retain enabled file access",\n  );\n\n  const sourceResolution = await evaluate(\n    extensionClient,\n    `(async () => {\n      const module = await import(chrome.runtime.getURL("runtime/source-runtime.js"));\n      const result = await module.resolveActiveTabSource();\n      return {\n        tabId: result.tabId,\n        capability: result.capability,\n        descriptor: result.descriptor ?? null,\n      };\n    })()`,\n  );\n  assert(sourceResolution?.capability?.provider === "file-tab", "File source provider mismatch");\n  assert(sourceResolution?.capability?.supported === true, "File source is not marked supported");\n  assert(sourceResolution?.capability?.available === true, "File source is not marked available");\n  assert(sourceResolution?.capability?.code === "ready", "File source capability is not ready");\n  assert(sourceResolution?.descriptor?.sourceType === "file", "File source descriptor type mismatch");\n  assert(sourceResolution?.descriptor?.sourceUrl === fixtureUrl, "File source URL was not preserved");\n  assert(sourceResolution?.descriptor?.offline === true, "File source descriptor lost offline=true");\n\n  const snapshot = await evaluate(\n    extensionClient,\n    `(async () => {\n      const sourceModule = await import(chrome.runtime.getURL("runtime/source-runtime.js"));\n      const captureModule = await import(\n        chrome.runtime.getURL("runtime/standard-capture-adapter/capture.js")\n      );\n      const source = await sourceModule.resolveActiveTabSource();\n      const [injection] = await chrome.scripting.executeScript({\n        target: { tabId: source.tabId },\n        func: captureModule.captureStandardSnapshotInPage,\n        args: [{ captureTarget: { type: "document" }, maxNodes: 100000, includeComments: false }],\n      });\n      return injection?.result?.snapshot ?? null;\n    })()`,\n  );\n  assert(snapshot?.adapter === "standard", "File page did not use the final Standard capture adapter");\n  assert(snapshot?.url === fixtureUrl, "Captured file URL mismatch");\n  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Captured file title mismatch");\n  assert(\n    snapshot?.nodes?.some(\n      (node) =>\n        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&\n        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),\n    ),\n    "Captured file snapshot is missing editable fixture text",\n  );'''

new_flow = '''  console.log("NODE-31 file protocol: opening final extension control page");\n  const helper = await createPageSession(browserClient, extensionPageUrl, "extension helper");\n  const extensionClient = helper.client;\n  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });\n  await delay(100);\n\n  console.log("NODE-31 file protocol: resolving source through product message channel");\n  const capabilityResponse = await evaluate(\n    extensionClient,\n    `chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" })`,\n  );\n  assert(\n    capabilityResponse?.ok === true,\n    `Product source-capability request failed: ${capabilityResponse?.error ?? "unknown"}`,\n  );\n  const capability = capabilityResponse.data;\n  assert(capability?.provider === "file-tab", "File source provider mismatch");\n  assert(capability?.supported === true, "File source is not marked supported");\n  assert(capability?.available === true, "File source is not marked available");\n  assert(capability?.code === "ready", "File source capability is not ready");\n\n  console.log("NODE-31 file protocol: running final full-page product capture job");\n  const jobResponse = await evaluate(\n    extensionClient,\n    `chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" })`,\n  );\n  assert(jobResponse?.ok === true, `Product capture request failed: ${jobResponse?.error ?? "unknown"}`);\n  const job = jobResponse.data;\n  assert(job?.mode === "full-page", "Product capture job mode mismatch");\n  assert(job?.status === "completed", `Product file capture did not complete: ${job?.error ?? job?.phase}`);\n  assert(job?.source?.provider === "file-tab", "Completed job lost file-tab provider");\n  assert(job?.source?.sourceType === "file", "Completed job source type mismatch");\n  assert(job?.source?.sourceUrl === fixtureUrl, "Completed job did not preserve file URL");\n  assert(job?.source?.offline === true, "Completed job lost offline=true");\n  assert(job?.capture?.adapter === "standard", "File page did not use final Standard capture path");\n  assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");\n  assert(job?.capture?.nodeCount > 0, "Completed job did not capture editable nodes");\n\n  const snapshot = await evaluate(\n    extensionClient,\n    `(async () => {\n      const module = await import(chrome.runtime.getURL("runtime/snapshot-store.js"));\n      return module.readRawSnapshot(${JSON.stringify(job.jobId)});\n    })()`,\n  );\n  assert(snapshot?.adapter === "standard", "Persisted file snapshot adapter mismatch");\n  assert(snapshot?.url === fixtureUrl, "Captured file URL mismatch");\n  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Captured file title mismatch");\n  assert(\n    snapshot?.nodes?.some(\n      (node) =>\n        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&\n        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),\n    ),\n    "Captured file snapshot is missing editable fixture text",\n  );'''

if old_flow not in text:
    raise SystemExit("product file-capture flow anchor missing")
text = text.replace(old_flow, new_flow, 1)

text = text.replace('version: "1.1.0"', 'version: "1.6.0"', 1)
text = text.replace(
    '"public-extension-api-reports-file-access-disabled",',
    '"chrome-management-state-reports-file-access-disabled",',
    1,
)
text = text.replace(
    '"public-extension-api-reports-file-access-enabled",',
    '"chrome-management-state-reports-file-access-enabled",\n          "product-source-runtime-accepts-explicit-file-access",',
    1,
)
text = text.replace(
    '"enabled-extension-can-observe-active-file-url",\n          "final-source-runtime-resolves-file-tab-ready",\n          "file-source-descriptor-preserves-offline-file-url",\n          "final-standard-adapter-captures-real-file-tab",',
    '"product-message-channel-wakes-final-mv3-service-worker",\n          "product-source-capability-resolves-file-tab-ready",\n          "product-full-page-job-preserves-offline-file-url",\n          "product-full-page-job-uses-final-standard-capture-path",\n          "persisted-raw-snapshot-recovered-through-final-store",',
    1,
)

path.write_text(text)
print("NODE-31 file permission candidate materialized in working tree.")
