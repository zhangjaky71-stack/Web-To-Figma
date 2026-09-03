import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const extensionRoot = resolve("apps/browser-extension/dist-high-fidelity");
const manifestPath = join(extensionRoot, "manifest.json");
const fixturePath = resolve("qa/corpus/node31/p0/file-protocol-runtime.html");
const fixtureUrl = pathToFileURL(fixturePath).href;
const chromeCandidates = [
  process.env.W2F_EXTENSION_TEST_CHROME_BIN,
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  process.env.CHROMIUM_BIN,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next runner-supported Chrome path.
    }
  }
  throw new Error(`Chrome executable not found. Checked: ${chromeCandidates.join(", ")}`);
}

class PipeCdpClient {
  constructor(input, output, stderr) {
    this.input = input;
    this.output = output;
    this.stderr = stderr;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";

    output.setEncoding("utf8");
    output.on("data", (chunk) => {
      this.buffer += chunk;
      for (;;) {
        const boundary = this.buffer.indexOf("\0");
        if (boundary < 0) break;
        const payload = this.buffer.slice(0, boundary);
        this.buffer = this.buffer.slice(boundary + 1);
        if (!payload) continue;
        const message = JSON.parse(payload);
        if (typeof message.id !== "number") continue;
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error)
          pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
      }
    });

    output.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`CDP pipe closed before response.\n${this.stderr()}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId, timeoutMs = 10000) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP pipe response: ${method}.\n${this.stderr()}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.input.write(
        `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
      );
    });
  }

  session(sessionId) {
    return {
      send: (method, params = {}, timeoutMs = 10000) =>
        this.send(method, params, sessionId, timeoutMs),
    };
  }

  close() {
    this.input.end();
    this.output.destroy();
  }
}

async function evaluate(client, expression, timeoutMs = 10000) {
  const response = await client.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs,
  );
  if (response.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  return response.result?.value;
}

async function waitFor(client, expression, message, attempts = 300) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolvePromise) => childProcess.once("exit", () => resolvePromise(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function stopChrome(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill("SIGTERM");
  if (await waitForProcessExit(childProcess, 1500)) return;
  childProcess.kill("SIGKILL");
  await waitForProcessExit(childProcess, 1500);
}

async function startRawChrome(chromePath, label) {
  const profileDir = await mkdtemp(join(tmpdir(), `w2f-node31-file-v18-${label}-`));
  let stderr = "";
  const process = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  process.stderr.setEncoding("utf8");
  process.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-30000);
  });
  const pipeInput = process.stdio[3];
  const pipeOutput = process.stdio[4];
  assert(pipeInput && pipeOutput, "Chrome remote debugging pipe was not created");
  const browser = new PipeCdpClient(pipeInput, pipeOutput, () => stderr);
  const browserVersion = await browser.send("Browser.getVersion", {}, undefined, 60000);
  return {
    process,
    browser,
    profileDir,
    browserVersion,
    stderr: () => stderr,
    async cleanup() {
      browser.close();
      await stopChrome(process).catch(() => undefined);
      await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch(
        () => undefined,
      );
    },
  };
}

async function attachPageTarget(browser, targetId, label) {
  const attached = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  assert(attached.sessionId, `Unable to attach ${label} target`);
  const client = browser.session(attached.sessionId);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await waitFor(
    client,
    `document.readyState === "complete"`,
    `${label} did not finish loading`,
    400,
  );
  return client;
}

async function createPageSession(browser, url, label) {
  const created = await browser.send("Target.createTarget", { url });
  assert(created.targetId, `Unable to create ${label} target`);
  return {
    targetId: created.targetId,
    client: await attachPageTarget(browser, created.targetId, label),
  };
}

async function loadExtension(browser) {
  const loaded = await browser.send(
    "Extensions.loadUnpacked",
    { path: extensionRoot, enableInIncognito: false },
    undefined,
    30000,
  );
  assert(loaded.id, "Extensions.loadUnpacked did not return an extension id");
  const listed = await browser.send("Extensions.getExtensions");
  assert(
    listed.extensions?.some((extension) => extension.id === loaded.id),
    "Extensions.getExtensions did not list the loaded Web-To-Figma extension",
  );
  return loaded.id;
}

async function createManagementSession(browser, extensionId) {
  const management = await createPageSession(
    browser,
    "chrome://extensions/",
    "chrome://extensions",
  );
  await waitFor(
    management.client,
    `typeof chrome?.developerPrivate?.getExtensionInfo === "function"`,
    "chrome.developerPrivate is unavailable on chrome://extensions",
  );
  await waitFor(
    management.client,
    `new Promise((resolvePromise) => {
      chrome.developerPrivate.getExtensionsInfo(
        { includeDisabled: true, includeTerminated: true },
        (items) => resolvePromise(items.some((item) => item.id === ${JSON.stringify(extensionId)})),
      );
    })`,
    "Loaded Web-To-Figma extension is not visible in chrome://extensions",
  );
  return management;
}

async function getExtensionInfo(client, extensionId) {
  return evaluate(
    client,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise({
              id: info.id,
              state: info.state,
              location: info.location,
              fileAccess: info.fileAccess ?? null,
              optionsPage: info.optionsPage ?? null,
              disableReasons: info.disableReasons ?? null
            }),
      );
    })`,
  );
}

async function setFileAccess(client, extensionId, enabled) {
  await evaluate(
    client,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.updateExtensionConfiguration(
        { extensionId: ${JSON.stringify(extensionId)}, fileAccess: ${enabled} },
        () => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise(true),
      );
    })`,
  );
}

async function waitForFileAccess(client, extensionId, active) {
  let last = null;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    last = await getExtensionInfo(client, extensionId);
    if (last?.fileAccess?.isEnabled === true && last.fileAccess.isActive === active) return last;
    await delay(25);
  }
  throw new Error(
    `File access did not become ${active ? "active" : "inactive"}: ${JSON.stringify(last)}`,
  );
}

async function openOptionsThroughChrome(browser, managementClient, extensionId) {
  await evaluate(
    managementClient,
    `Promise.resolve(chrome.developerPrivate.showOptions(${JSON.stringify(extensionId)})).then(() => true)`,
  );
  const expectedUrl = `chrome-extension://${extensionId}/options.html`;
  let lastTargets = [];
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const targets = await browser.send("Target.getTargets");
    lastTargets = (targets.targetInfos ?? []).map((target) => ({
      targetId: target.targetId,
      type: target.type,
      url: target.url,
    }));
    const optionsTarget = targets.targetInfos?.find(
      (target) => target.type === "page" && target.url === expectedUrl,
    );
    if (optionsTarget?.targetId) {
      return {
        targetId: optionsTarget.targetId,
        url: expectedUrl,
        client: await attachPageTarget(browser, optionsTarget.targetId, "extension options"),
      };
    }
    await delay(25);
  }
  throw new Error(`Chrome-opened options target not found: ${JSON.stringify(lastTargets)}`);
}

async function createUnattachedFileTarget(browser) {
  const created = await browser.send("Target.createTarget", { url: fixtureUrl });
  assert(created.targetId, "Unable to create real file target");
  let last = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const info = await browser.send("Target.getTargetInfo", { targetId: created.targetId });
    last = info.targetInfo ?? null;
    if (last?.url === fixtureUrl) break;
    await delay(25);
  }
  assert(
    last?.url === fixtureUrl,
    `File target did not navigate to fixture: ${JSON.stringify(last)}`,
  );
  await browser.send("Target.activateTarget", { targetId: created.targetId });
  return { targetId: created.targetId, info: last };
}

async function readIndexedDbValue(client, databaseName, version, storeName, key) {
  return evaluate(
    client,
    `(async () => {
      const database = await new Promise((resolvePromise, reject) => {
        const request = indexedDB.open(${JSON.stringify(databaseName)}, ${JSON.stringify(version)});
        request.onerror = () => reject(request.error ?? new Error("failed to open database"));
        request.onsuccess = () => resolvePromise(request.result);
      });
      try {
        return await new Promise((resolvePromise, reject) => {
          const transaction = database.transaction(${JSON.stringify(storeName)}, "readonly");
          const request = transaction.objectStore(${JSON.stringify(storeName)}).get(${JSON.stringify(key)});
          request.onerror = () => reject(request.error ?? new Error("failed to read database value"));
          request.onsuccess = () => resolvePromise(request.result ?? null);
        });
      } finally {
        database.close();
      }
    })()`,
    30000,
  );
}

async function provePermissionControl(chromePath) {
  const harness = await startRawChrome(chromePath, "permission");
  try {
    console.log(
      "NODE-31 file protocol v18: permission session loading unpacked extension through CDP",
    );
    const extensionId = await loadExtension(harness.browser);
    const management = await createManagementSession(harness.browser, extensionId);
    const initial = await getExtensionInfo(management.client, extensionId);
    assert(initial?.state === "ENABLED", `Fresh extension is not enabled: ${initial?.state}`);
    assert(initial?.fileAccess?.isEnabled === true, "File access toggle is unavailable");
    assert(initial?.fileAccess?.isActive === true, "Fresh extension file access is not active");

    await setFileAccess(management.client, extensionId, false);
    const disabled = await waitForFileAccess(management.client, extensionId, false);
    await setFileAccess(management.client, extensionId, true);
    const reenabled = await waitForFileAccess(management.client, extensionId, true);

    return {
      extensionId,
      initialState: initial.state,
      initialFileAccess: initial.fileAccess,
      disabledState: disabled.state,
      disabledFileAccess: disabled.fileAccess,
      reenabledState: reenabled.state,
      reenabledFileAccess: reenabled.fileAccess,
    };
  } finally {
    await harness.cleanup();
  }
}

async function proveProductionCapture(chromePath) {
  const harness = await startRawChrome(chromePath, "capture");
  try {
    console.log(
      "NODE-31 file protocol v18: fresh capture session loading extension without ChromeDriver",
    );
    const extensionId = await loadExtension(harness.browser);
    const management = await createManagementSession(harness.browser, extensionId);
    const fresh = await getExtensionInfo(management.client, extensionId);
    assert(fresh?.state === "ENABLED", `Fresh capture extension is not enabled: ${fresh?.state}`);
    assert(
      fresh?.fileAccess?.isActive === true,
      "Fresh capture extension lacks active file access",
    );

    const options = await openOptionsThroughChrome(harness.browser, management.client, extensionId);
    await waitFor(
      options.client,
      `typeof chrome?.runtime?.id === "string" &&
       typeof chrome?.tabs?.query === "function" &&
       typeof chrome?.scripting?.executeScript === "function" &&
       typeof chrome?.debugger?.getTargets === "function"`,
      "Chrome-opened extension options page lacks required production extension APIs",
      400,
    );

    const fileTarget = await createUnattachedFileTarget(harness.browser);
    const fileTab = await evaluate(
      options.client,
      `(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((candidate) => candidate.url === ${JSON.stringify(fixtureUrl)});
        return tab && typeof tab.id === "number"
          ? { id: tab.id, url: tab.url, windowId: tab.windowId, active: tab.active }
          : null;
      })()`,
      30000,
    );
    assert(
      fileTab?.url === fixtureUrl,
      `Extension could not resolve real file tab: ${JSON.stringify(fileTab)}`,
    );
    assert(typeof fileTab?.id === "number", "Resolved file tab has no numeric id");

    const debuggerState = await evaluate(
      options.client,
      `(async () => {
        const targets = await chrome.debugger.getTargets();
        const target = targets.find((item) => item.tabId === ${JSON.stringify(fileTab.id)});
        return target
          ? { id: target.id, tabId: target.tabId ?? null, attached: target.attached, url: target.url }
          : null;
      })()`,
    );
    console.log(
      `NODE-31 file protocol v18: pre-capture debugger target ${JSON.stringify(debuggerState)}`,
    );
    assert(debuggerState, "Production chrome.debugger target for file tab was not found");
    assert(
      debuggerState.attached === false,
      "Harness unexpectedly attached the file target before production capture",
    );

    console.log(
      "NODE-31 file protocol v18: dispatching real production messages from file-tab extension world",
    );
    const productionResponses = await evaluate(
      options.client,
      `(async () => {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: ${JSON.stringify(fileTab.id)} },
          func: async () => {
            const capability = await chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" });
            const job = await chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" });
            return { capability, job };
          }
        });
        return injection?.result ?? null;
      })()`,
      120000,
    );
    assert(productionResponses, "Production message injection returned no result");

    const capabilityResponse = productionResponses.capability;
    assert(capabilityResponse?.ok === true, "Production source-capability request failed");
    assert(
      capabilityResponse?.requestType === "W2F_GET_SOURCE_CAPABILITY",
      "Capability response type mismatch",
    );
    const capability = capabilityResponse.data;
    assert(capability?.provider === "file-tab", "File source provider mismatch");
    assert(
      capability?.supported === true && capability?.available === true,
      "File source is not supported/available",
    );
    assert(
      capability?.code === "ready",
      `File source capability is not ready: ${capability?.code}`,
    );

    const startJobResponse = productionResponses.job;
    assert(
      startJobResponse?.ok === true,
      `Production W2F_START_JOB failed: ${startJobResponse?.error ?? "unknown"}`,
    );
    assert(startJobResponse?.requestType === "W2F_START_JOB", "Capture response type mismatch");
    const job = startJobResponse.data;
    assert(
      job?.status === "completed",
      `Production file capture is not completed: ${job?.error ?? job?.status}`,
    );
    assert(job?.mode === "full-page", "Production file capture mode mismatch");
    assert(
      job?.phase === "high-fidelity-capture-complete",
      `High Fidelity phase mismatch: ${job?.phase}`,
    );
    assert(job?.source?.provider === "file-tab", "Completed job lost file-tab source provider");
    assert(job?.source?.sourceType === "file", "Completed job lost file source type");
    assert(job?.source?.sourceUrl === fixtureUrl, "Completed job lost real file URL");
    assert(job?.source?.offline === true, "Completed job lost offline file semantics");
    assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");
    assert(
      job?.capture?.adapter === "cdp",
      `High Fidelity file capture did not use CDP: ${job?.capture?.adapter}`,
    );
    assert(
      job?.capture?.fallbackFromCdp !== true,
      "Unexpected Standard fallback occurred in uncontended capture session",
    );
    assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");
    assert(
      typeof job?.capture?.storageKey === "string",
      "Completed capture did not persist RawSnapshot",
    );
    assert(
      typeof job?.capture?.pixelGroundTruthStorageKey === "string",
      "Completed capture did not persist PixelGroundTruth",
    );

    const rawSnapshot = await readIndexedDbValue(
      options.client,
      "w2f-capture-snapshots",
      2,
      "rawSnapshots",
      `raw-snapshot:${job.jobId}`,
    );
    assert(rawSnapshot, "Production RawSnapshot is missing");
    assert(
      rawSnapshot.adapter === "cdp",
      `Persisted RawSnapshot adapter mismatch: ${rawSnapshot.adapter}`,
    );
    assert(rawSnapshot.url === fixtureUrl, "Persisted file snapshot URL mismatch");
    assert(
      rawSnapshot.title === "NODE-31 File Protocol Runtime",
      "Persisted file snapshot title mismatch",
    );
    assert(
      !(rawSnapshot.diagnostics ?? []).some(
        (item) => item.code === "CDP_CAPTURE_FALLBACK_STANDARD",
      ),
      "Uncontended capture unexpectedly persisted a CDP fallback diagnostic",
    );

    const nodes = rawSnapshot.nodes ?? [];
    const byId = new Map(nodes.map((node) => [node.captureNodeId, node]));
    const proofElement = nodes.find(
      (node) =>
        node.kind === "element" &&
        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof",
    );
    assert(proofElement, "Persisted file snapshot is missing proof element");
    const queue = [...(proofElement.childCaptureNodeIds ?? [])];
    let editableTextNode = null;
    while (queue.length > 0) {
      const id = queue.shift();
      const node = byId.get(id);
      if (!node) continue;
      if (
        node.kind === "text" &&
        (node.textContent?.includes("NODE-31 explicit file URL permission runtime proof") ||
          node.text?.value?.includes("NODE-31 explicit file URL permission runtime proof"))
      ) {
        editableTextNode = node;
        break;
      }
      queue.push(...(node.childCaptureNodeIds ?? []));
    }
    assert(editableTextNode, "Persisted file snapshot proof element is missing editable text");

    const pixel = await readIndexedDbValue(
      options.client,
      "w2f-pixel-ground-truth",
      1,
      "captures",
      `pixel-ground-truth:${job.jobId}`,
    );
    assert(pixel, "Production PixelGroundTruth is missing");
    assert(pixel.adapter === "cdp", `PixelGroundTruth adapter mismatch: ${pixel.adapter}`);
    assert((pixel.references?.length ?? 0) > 0, "PixelGroundTruth has no raster references");
    assert(
      (pixel.references ?? []).some((reference) => reference.kind === "viewport"),
      "PixelGroundTruth is missing viewport reference",
    );
    assert(
      (pixel.references ?? []).some((reference) => reference.kind === "full-page"),
      "CDP PixelGroundTruth is missing full-page reference",
    );
    assert(
      !(pixel.diagnostics ?? []).some((item) => item.code === "RASTER_CAPTURE_FAILED"),
      "PixelGroundTruth recorded a raster capture failure",
    );

    const postTargets = await harness.browser.send("Target.getTargets");
    const fileTargetInfo = postTargets.targetInfos?.find(
      (item) => item.targetId === fileTarget.targetId,
    );
    assert(
      fileTargetInfo?.url === fixtureUrl,
      "Real file target disappeared or changed URL after capture",
    );

    return {
      extensionId,
      browserProduct: harness.browserVersion.product,
      freshState: fresh.state,
      fileAccess: fresh.fileAccess,
      fileTargetId: fileTarget.targetId,
      fileTabId: fileTab.id,
      preCaptureDebuggerAttached: debuggerState.attached,
      captureAdapter: job.capture.adapter,
      capturePhase: job.phase,
      captureNodeCount: job.capture.nodeCount,
      rasterReferenceCount: pixel.references.length,
      hasViewportReference: pixel.references.some((reference) => reference.kind === "viewport"),
      hasFullPageReference: pixel.references.some((reference) => reference.kind === "full-page"),
      editableProofText: true,
      jobId: job.jobId,
    };
  } finally {
    await harness.cleanup();
  }
}

await access(manifestPath);
await access(fixturePath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert(
  manifest.host_permissions?.includes("file:///*"),
  "Built extension lacks file:///* host permission",
);
assert(manifest.permissions?.includes("debugger"), "High Fidelity build lacks debugger permission");
const chromePath = await findChrome();

const permissionProof = await provePermissionControl(chromePath);
const captureProof = await proveProductionCapture(chromePath);

console.log(
  JSON.stringify(
    {
      version: "18.0.0",
      evidenceType: "node31-file-protocol-browser-runtime",
      status: "PASS",
      browserExecutable: chromePath,
      extensionArtifact: "apps/browser-extension/dist-high-fidelity",
      captureProfile: "high-fidelity",
      fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
      proofArchitecture: "two-fresh-native-chrome-cdp-sessions-with-unattached-file-target",
      proofSeparationReason:
        "The permission-control session mutates Chrome's explicit file-access setting and is discarded. The fresh capture session loads the same High Fidelity extension through the Chrome Extensions CDP domain but never attaches the file page target or service worker target, leaving chrome.debugger uncontended so the production CDP capture and PixelGroundTruth paths can execute without synthetic activeTab grants or Standard-fallback screenshot shortcuts.",
      permissionProof,
      captureProof,
      assertions: [
        "fresh-unpacked-extension-starts-enabled-with-explicit-file-access-active",
        "chrome-file-access-setting-can-be-explicitly-disabled",
        "chrome-file-access-setting-can-be-explicitly-reenabled",
        "fresh-capture-session-does-not-mutate-file-access-setting",
        "chrome-opens-real-authorized-extension-options-page",
        "harness-never-attaches-real-file-page-target",
        "harness-never-attaches-extension-service-worker-target",
        "production-debugger-target-is-unattached-before-capture",
        "production-extension-injects-into-real-file-tab",
        "file-tab-extension-world-dispatches-production-runtime-messages",
        "production-source-capability-resolves-file-tab-ready",
        "production-full-page-job-completes-on-file-url",
        "completed-job-uses-high-fidelity-cdp-capture-adapter",
        "pixel-ground-truth-retains-viewport-and-full-page-raster-references",
        "persisted-raw-snapshot-preserves-editable-text-structure",
      ],
      provesP0Items: ["file-protocol-explicit-permission"],
      prohibitedShortcutFlags: [
        "--allow-file-access-from-files",
        "--disable-extensions-file-access-check",
      ],
      prohibitedLegacyInstallFlags: ["--load-extension", "--disable-extensions-except"],
      testOnlyChromeFlag: "--enable-unsafe-extension-debugging",
      prohibitedInternalUiDependency: "chrome://extensions inspect-view click",
      prohibitedSyntheticExtensionNavigation: "manual chrome-extension:// page navigation",
      prohibitedFileTargetHarnessAttachment: "Target.attachToTarget on the file fixture target",
      prohibitedWorkerHarnessDependency: "CDP direct service-worker target attach",
      prohibitedEvidenceFabrication:
        "no mocked permission state or mocked production W2F responses",
    },
    null,
    2,
  ),
);
