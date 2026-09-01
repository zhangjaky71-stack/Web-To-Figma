from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

session_old = '''  session(sessionId) {\n    return {\n      send: (method, params = {}) => this.send(method, params, sessionId),\n    };\n  }'''
session_new = '''  session(sessionId) {\n    return {\n      send: (method, params = {}, timeoutMs = 10000) =>\n        this.send(method, params, sessionId, timeoutMs),\n    };\n  }'''
if session_old in text:
    text = text.replace(session_old, session_new, 1)
elif session_new not in text:
    raise SystemExit("CDP session timeout forwarding anchor missing")

evaluate_old = '''async function evaluate(client, expression) {\n  const response = await client.send("Runtime.evaluate", {\n    expression,\n    awaitPromise: true,\n    returnByValue: true,\n  });\n  if (response.exceptionDetails) {\n    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);\n  }\n  return response.result?.value;\n}'''
evaluate_new = '''async function evaluate(client, expression, timeoutMs = 10000) {\n  const response = await client.send(\n    "Runtime.evaluate",\n    {\n      expression,\n      awaitPromise: true,\n      returnByValue: true,\n    },\n    timeoutMs,\n  );\n  if (response.exceptionDetails) {\n    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);\n  }\n  return response.result?.value;\n}'''
if evaluate_old in text:
    text = text.replace(evaluate_old, evaluate_new, 1)
elif evaluate_new not in text:
    raise SystemExit("Runtime.evaluate timeout anchor missing")

start_marker = '  console.log("NODE-31 file protocol: reactivating final unpacked extension after permission change");'
end_marker = '  console.log(\n    JSON.stringify('
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("file protocol execution block anchors missing")

new_flow = '''  console.log("NODE-31 file protocol: loading real file fixture before default action");\n  await navigate(primaryClient, fixtureUrl, "file protocol fixture before default action");\n  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });\n  await delay(100);\n  assert(\n    await evaluate(\n      primaryClient,\n      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,\n    ),\n    "File protocol fixture content did not load before default action",\n  );\n\n  const popupUrl = `chrome-extension://${extensionId}/popup.html`;\n  const targetsBeforeAction = await browserClient.send("Target.getTargets");\n  assert(\n    !(targetsBeforeAction.targetInfos ?? []).some((target) => target.url === popupUrl),\n    "Unexpected pre-existing Web-To-Figma popup target before default action",\n  );\n\n  console.log("NODE-31 file protocol: triggering real default extension action through CDP");\n  await browserClient.send("Extensions.triggerAction", {\n    id: extensionId,\n    targetId: primary.targetId,\n  });\n\n  let popupTarget = null;\n  for (let attempt = 0; attempt < 200; attempt += 1) {\n    const targets = await browserClient.send("Target.getTargets");\n    popupTarget = (targets.targetInfos ?? []).find((target) => target.url === popupUrl) ?? null;\n    if (popupTarget?.targetId) break;\n    await delay(25);\n  }\n  if (!popupTarget?.targetId) {\n    const targets = await browserClient.send("Target.getTargets");\n    const summary = (targets.targetInfos ?? []).map((target) => ({\n      type: target.type,\n      url: target.url,\n    }));\n    throw new Error(\n      `Default extension action did not open final popup target. Targets: ${JSON.stringify(summary)}`,\n    );\n  }\n\n  const popupAttached = await browserClient.send("Target.attachToTarget", {\n    targetId: popupTarget.targetId,\n    flatten: true,\n  });\n  assert(popupAttached.sessionId, "Unable to attach to final extension popup");\n  const popupClient = browserClient.session(popupAttached.sessionId);\n  await popupClient.send("Runtime.enable");\n  await waitFor(\n    popupClient,\n    `document.readyState === "complete"`,\n    "Final extension popup did not finish loading",\n  );\n  assert(\n    (await evaluate(popupClient, "location.href")) === popupUrl,\n    "Attached popup URL does not match final packaged popup",\n  );\n  assert(\n    (await evaluate(popupClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,\n    "Final popup did not retain explicitly enabled file access",\n  );\n\n  const activeTabUrl = await evaluate(\n    popupClient,\n    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.url ?? null)`,\n  );\n  assert(activeTabUrl === fixtureUrl, `Final popup active file tab mismatch: ${activeTabUrl}`);\n\n  console.log("NODE-31 file protocol: resolving source through production popup message channel");\n  const capabilityResponse = await evaluate(\n    popupClient,\n    `(async () => chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" }))()`,\n    30000,\n  );\n  assert(capabilityResponse?.ok === true, "Production source capability request failed");\n  assert(\n    capabilityResponse?.requestType === "W2F_GET_SOURCE_CAPABILITY",\n    "Production source capability response type mismatch",\n  );\n  const capability = capabilityResponse?.data;\n  assert(capability?.provider === "file-tab", "File source provider mismatch");\n  assert(capability?.supported === true, "File source is not marked supported");\n  assert(capability?.available === true, "File source is not marked available");\n  assert(capability?.code === "ready", "File source capability is not ready");\n\n  console.log("NODE-31 file protocol: starting production full-page capture from final popup");\n  const startResponse = await evaluate(\n    popupClient,\n    `(async () => chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" }))()`,\n    120000,\n  );\n  assert(startResponse?.ok === true, `Production full-page request failed: ${startResponse?.error ?? "unknown"}`);\n  assert(startResponse?.requestType === "W2F_START_JOB", "Production capture response type mismatch");\n  const job = startResponse?.data;\n  assert(job?.mode === "full-page", "Production capture job mode mismatch");\n  assert(job?.status === "completed", `Production file capture did not complete: ${job?.error ?? job?.status}`);\n  assert(job?.source?.provider === "file-tab", "Completed job lost file-tab source provider");\n  assert(job?.source?.sourceType === "file", "Completed job lost file source type");\n  assert(job?.source?.sourceUrl === fixtureUrl, "Completed job lost the real file URL");\n  assert(job?.source?.offline === true, "Completed job lost offline file semantics");\n  assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");\n  assert(\n    job?.capture?.adapter === "standard" || job?.capture?.adapter === "cdp",\n    `Completed job did not report a production capture adapter: ${job?.capture?.adapter}`,\n  );\n  assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");\n  assert(\n    typeof job?.capture?.storageKey === "string" && job.capture.storageKey.length > 0,\n    "Completed file capture did not persist a RawSnapshot",\n  );\n\n  console.log("NODE-31 file protocol: reading persisted RawSnapshot from production snapshot store");\n  const snapshot = await evaluate(\n    popupClient,\n    `(async () => {\n      const module = await import(chrome.runtime.getURL("runtime/snapshot-store.js"));\n      return module.readRawSnapshot(${JSON.stringify(job.jobId)});\n    })()`,\n    30000,\n  );\n  assert(snapshot, "Production snapshot store did not return the completed RawSnapshot");\n  assert(snapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");\n  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Persisted file snapshot title mismatch");\n  assert(\n    snapshot?.nodes?.some(\n      (node) =>\n        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&\n        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),\n    ),\n    "Persisted file snapshot is missing editable fixture text",\n  );\n\n'''
text = text[:start] + new_flow + text[end:]

text = text.replace(
    '        version: "1.1.0",\n        evidenceType: "node31-file-protocol-browser-runtime",',
    '        version: "1.2.0",\n        evidenceType: "node31-file-protocol-browser-runtime",',
    1,
)

artifact_anchor = '        extensionArtifact: "apps/browser-extension/dist",\n'
artifact_replacement = '''        extensionArtifact: "apps/browser-extension/dist",\n        popupArtifact: "apps/browser-extension/dist/popup.html",\n        serviceWorkerArtifact: "apps/browser-extension/dist/runtime/service-worker.js",\n'''
if artifact_anchor in text:
    text = text.replace(artifact_anchor, artifact_replacement, 1)
elif artifact_replacement not in text:
    raise SystemExit("evidence artifact anchor missing")

assertions_start_marker = '        assertions: [\n'
assertions_end_marker = '        ],\n        provesP0Items:'
assertions_start = text.find(assertions_start_marker, text.find(end_marker))
assertions_end = text.find(assertions_end_marker, assertions_start)
if assertions_start < 0 or assertions_end < 0:
    raise SystemExit("evidence assertion block anchors missing")

assertions_block = '''        assertions: [\n          "built-manifest-declares-file-scheme-host-permission",\n          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",\n          "chrome-management-state-explicitly-disables-file-access",\n          "chrome-management-state-explicitly-enables-file-access",\n          "real-file-url-fixture-loads-in-action-target-tab",\n          "default-extension-action-triggered-through-cdp",\n          "final-packaged-popup-opens-from-default-action",\n          "final-popup-retains-enabled-file-access",\n          "final-popup-observes-active-file-url",\n          "production-message-channel-resolves-file-tab-ready",\n          "production-full-page-job-completes-on-file-url",\n          "completed-job-preserves-file-source-and-page-url",\n          "completed-job-uses-production-capture-adapter",\n          "completed-job-persists-raw-snapshot",\n          "persisted-raw-snapshot-preserves-file-url-and-title",\n          "persisted-raw-snapshot-preserves-editable-text-structure",\n'''
text = text[:assertions_start] + assertions_block + text[assertions_end:]

path.write_text(text)
print("NODE-31 default-action file protocol candidate materialized in working tree.")
