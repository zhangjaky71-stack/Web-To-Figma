from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

start_marker = '  console.log("NODE-31 file protocol: navigating trusted extension origin to final packaged popup");'
end_marker = '  console.log(\n    JSON.stringify('
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("packaged popup flow anchors missing")

new_flow = '''  console.log("NODE-31 file protocol: opening final extension options through Chrome management API");\n  await evaluate(\n    primaryClient,\n    `(() => {\n      chrome.developerPrivate.showOptions(${JSON.stringify(extensionId)});\n      return true;\n    })()`,\n  );\n\n  const extensionOptionsUrl = `chrome-extension://${extensionId}/options.html`;\n  let optionsTargetId = null;\n  for (let attempt = 0; attempt < 400; attempt += 1) {\n    const targets = await browserClient.send("Target.getTargets");\n    const target = targets.targetInfos?.find(\n      (candidate) => candidate.type === "page" && candidate.url === extensionOptionsUrl,\n    );\n    if (target?.targetId) {\n      optionsTargetId = target.targetId;\n      break;\n    }\n    await delay(25);\n  }\n  assert(optionsTargetId, "Chrome management API did not open the final extension options page");\n\n  const optionsAttached = await browserClient.send("Target.attachToTarget", {\n    targetId: optionsTargetId,\n    flatten: true,\n  });\n  assert(optionsAttached.sessionId, "Unable to attach to browser-opened final extension options page");\n  const extensionClient = browserClient.session(optionsAttached.sessionId);\n  await extensionClient.send("Page.enable");\n  await extensionClient.send("Runtime.enable");\n  await waitFor(\n    extensionClient,\n    `document.readyState === "complete"`,\n    "Browser-opened final extension options page did not finish loading",\n  );\n  assert(\n    (await evaluate(extensionClient, `location.href`)) === extensionOptionsUrl,\n    "Browser-opened extension page URL mismatch",\n  );\n  assert(\n    (await evaluate(extensionClient, `typeof chrome?.runtime?.sendMessage === "function"`)) === true,\n    "Browser-opened final extension context does not expose chrome.runtime.sendMessage",\n  );\n  assert(\n    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,\n    "Browser-opened final extension context did not retain explicitly enabled file access",\n  );\n\n  console.log("NODE-31 file protocol: opening real file fixture as active capture tab");\n  const filePage = await createPageSession(\n    browserClient,\n    fixtureUrl,\n    "file protocol fixture for production message capture",\n  );\n  const fileClient = filePage.client;\n  assert(\n    await evaluate(\n      fileClient,\n      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,\n    ),\n    "File protocol fixture content did not load after explicit permission enable",\n  );\n  await browserClient.send("Target.activateTarget", { targetId: filePage.targetId });\n  await delay(100);\n\n  console.log("NODE-31 file protocol: requesting source capability through production service worker");\n  const capabilityResponse = await evaluate(\n    extensionClient,\n    `(async () => chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" }))()`,\n  );\n  assert(capabilityResponse?.ok === true, "Production source-capability request failed");\n  const capability = capabilityResponse?.data;\n  assert(capability?.provider === "file-tab", "File source provider mismatch");\n  assert(capability?.supported === true, "File source is not marked supported");\n  assert(capability?.available === true, "File source is not marked available");\n  assert(capability?.code === "ready", "File source capability is not ready");\n\n  console.log("NODE-31 file protocol: dispatching production W2F_START_JOB message");\n  const startJobResponse = await evaluate(\n    extensionClient,\n    `(async () => chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" }))()`,\n  );\n  assert(startJobResponse?.ok === true, "Production W2F_START_JOB request failed");\n  const job = startJobResponse?.data;\n  assert(job?.mode === "full-page", "Production capture job mode mismatch");\n  assert(job?.status === "completed", `Production file capture job is not completed: ${job?.status}`);\n  assert(job?.source?.provider === "file-tab", "Completed job lost file-tab source provider");\n  assert(job?.source?.sourceType === "file", "Completed job lost file source type");\n  assert(job?.source?.sourceUrl === fixtureUrl, "Completed job lost the real file URL");\n  assert(job?.source?.offline === true, "Completed job lost offline file semantics");\n  assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");\n  assert(\n    job?.capture?.adapter === "standard" || job?.capture?.adapter === "cdp",\n    `Completed job did not report a production capture adapter: ${job?.capture?.adapter}`,\n  );\n  assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");\n  assert(\n    typeof job?.capture?.storageKey === "string" && job.capture.storageKey.length > 0,\n    "Completed file capture did not persist a RawSnapshot",\n  );\n\n  console.log("NODE-31 file protocol: reading persisted RawSnapshot from production snapshot store");\n  const snapshot = await evaluate(\n    extensionClient,\n    `(async () => {\n      const module = await import(chrome.runtime.getURL("runtime/snapshot-store.js"));\n      return module.readRawSnapshot(${JSON.stringify(job.jobId)});\n    })()`,\n  );\n  assert(snapshot, "Production snapshot store did not return the completed RawSnapshot");\n  assert(snapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");\n  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Persisted file snapshot title mismatch");\n  assert(\n    snapshot?.nodes?.some(\n      (node) =>\n        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&\n        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),\n    ),\n    "Persisted file snapshot is missing editable fixture text",\n  );\n\n'''
text = text[:start] + new_flow + text[end:]

for old_version in ('"1.3.0"', '"1.4.0"'):
    text = text.replace(
        f'        version: {old_version},\n        evidenceType: "node31-file-protocol-browser-runtime",',
        '        version: "1.5.0",\n        evidenceType: "node31-file-protocol-browser-runtime",',
        1,
    )

artifact_anchor = '        extensionArtifact: "apps/browser-extension/dist",\n'
artifact_replacement = '''        extensionArtifact: "apps/browser-extension/dist",\n        optionsArtifact: "apps/browser-extension/dist/options.html",\n        serviceWorkerArtifact: "apps/browser-extension/dist/runtime/service-worker.js",\n        snapshotStoreArtifact: "apps/browser-extension/dist/runtime/snapshot-store.js",\n'''
if artifact_anchor in text:
    text = text.replace(artifact_anchor, artifact_replacement, 1)
elif artifact_replacement not in text:
    raise SystemExit("browser-opened extension evidence artifact anchor missing")

text = text.replace(
    '        popupArtifact: "apps/browser-extension/dist/popup.html",\n        popupRuntimeArtifact: "apps/browser-extension/dist/runtime/popup.js",\n',
    '',
    1,
)

assertions_start_marker = '        assertions: [\n'
assertions_end_marker = '        ],\n        provesP0Items:'
assertions_start = text.find(assertions_start_marker, text.find(end_marker))
assertions_end = text.find(assertions_end_marker, assertions_start)
if assertions_start < 0 or assertions_end < 0:
    raise SystemExit("file protocol evidence assertion block anchors missing")

assertions_block = '''        assertions: [\n          "built-manifest-declares-file-scheme-host-permission",\n          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",\n          "chrome-management-state-explicitly-disables-file-access",\n          "chrome-management-state-explicitly-enables-file-access",\n          "chrome-management-api-opens-final-extension-context",\n          "browser-opened-extension-context-retains-enabled-file-access",\n          "real-file-url-fixture-loads-after-explicit-permission",\n          "production-service-worker-wakes-from-runtime-message",\n          "production-source-capability-resolves-active-file-tab-ready",\n          "production-full-page-job-completes-on-file-url",\n          "completed-job-preserves-file-source-and-page-url",\n          "completed-job-uses-production-capture-adapter",\n          "completed-job-persists-raw-snapshot",\n          "persisted-raw-snapshot-preserves-file-url-and-title",\n          "persisted-raw-snapshot-preserves-editable-text-structure",\n'''
text = text[:assertions_start] + assertions_block + text[assertions_end:]

path.write_text(text)
print("NODE-31 browser-opened extension-context file protocol candidate materialized in working tree.")
