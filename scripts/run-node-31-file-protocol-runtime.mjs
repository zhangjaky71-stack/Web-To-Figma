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
      // Try the next runner-supported Chrome/Chromium path.
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
        if (message.error) {
          pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result ?? {});
        }
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
      send: (method, params = {}) => this.send(method, params, sessionId),
    };
  }

  close() {
    this.input.end();
    this.output.destroy();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  return response.result?.value;
}

async function waitFor(client, expression, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function navigate(client, url, label) {
  const response = await client.send("Page.navigate", { url });
  if (response.errorText) {
    throw new Error(`${label} navigation failed: ${response.errorText}`);
  }
  await waitFor(client, `document.readyState === "complete"`, `${label} did not finish loading`);
}

async function createPageSession(browserClient, url, label) {
  const created = await browserClient.send("Target.createTarget", { url });
  assert(created.targetId, `Unable to create ${label} target`);
  const attached = await browserClient.send("Target.attachToTarget", {
    targetId: created.targetId,
    flatten: true,
  });
  assert(attached.sessionId, `Unable to attach to ${label} target`);
  const client = browserClient.session(attached.sessionId);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await waitFor(client, `document.readyState === "complete"`, `${label} did not finish loading`);
  return { targetId: created.targetId, client };
}

async function reactivateUnpackedExtension(browserClient, extensionPath, extensionId) {
  const reactivated = await browserClient.send("Extensions.loadUnpacked", {
    path: extensionPath,
    enableInIncognito: false,
  });
  assert(reactivated.id, "Extensions.loadUnpacked did not return an id during reactivation");
  assert(
    reactivated.id === extensionId,
    `Unpacked extension id changed during reactivation: ${reactivated.id}`,
  );
}

async function createExtensionWorkerSession(browserClient, extensionId) {
  const expectedUrl = `chrome-extension://${extensionId}/runtime/service-worker.js`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const targets = await browserClient.send("Target.getTargets");
    const worker = targets.targetInfos?.find(
      (target) => target.type === "service_worker" && target.url === expectedUrl,
    );
    if (worker?.targetId) {
      const attached = await browserClient.send("Target.attachToTarget", {
        targetId: worker.targetId,
        flatten: true,
      });
      assert(attached.sessionId, "Unable to attach to final extension service worker");
      const client = browserClient.session(attached.sessionId);
      await client.send("Runtime.enable");
      await client.send("Runtime.runIfWaitingForDebugger");
      const workerUrl = await evaluate(client, "self.location.href");
      assert(workerUrl === expectedUrl, `Attached worker URL mismatch: ${workerUrl}`);
      return client;
    }
    await delay(25);
  }
  const targets = await browserClient.send("Target.getTargets");
  const summary = (targets.targetInfos ?? []).map((target) => ({
    type: target.type,
    url: target.url,
  }));
  throw new Error(
    `Final extension service worker target not found after unpacked reactivation. Targets: ${JSON.stringify(summary)}`,
  );
}

async function updateFileAccess(client, extensionId, enabled) {
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
  if (!(await waitForProcessExit(childProcess, 1500))) {
    throw new Error("Chrome did not exit after SIGTERM and SIGKILL");
  }
}

async function removeProfileDir(profileDir) {
  try {
    await rm(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  } catch (error) {
    console.warn(`NODE-31 Chrome profile cleanup warning: ${String(error)}`);
  }
}

await access(manifestPath);
await access(fixturePath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert(
  Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes("file:///*"),
  "Built extension manifest does not declare file:///* host permission",
);

const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-file-protocol-"));
const chromePath = await findChrome();
let chromeProcess;
let browserClient;
let chromeStderr = "";
let runError;

try {
  chromeProcess = spawn(
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
  chromeProcess.stderr.setEncoding("utf8");
  chromeProcess.stderr.on("data", (chunk) => {
    chromeStderr = `${chromeStderr}${chunk}`.slice(-20000);
  });

  const pipeInput = chromeProcess.stdio[3];
  const pipeOutput = chromeProcess.stdio[4];
  assert(pipeInput && pipeOutput, "Chrome remote debugging pipe was not created");
  browserClient = new PipeCdpClient(pipeInput, pipeOutput, () => chromeStderr);

  const browserVersion = await browserClient.send("Browser.getVersion", {}, undefined, 60000);
  const loaded = await browserClient.send("Extensions.loadUnpacked", {
    path: extensionRoot,
    enableInIncognito: false,
  });
  assert(loaded.id, `Extensions.loadUnpacked did not return an extension id.\n${chromeStderr}`);
  const extensionId = loaded.id;
  const listed = await browserClient.send("Extensions.getExtensions");
  assert(
    listed.extensions?.some((extension) => extension.id === extensionId),
    `CDP did not list the newly loaded unpacked extension.\n${chromeStderr}`,
  );

  const primary = await createPageSession(
    browserClient,
    "chrome://extensions/",
    "chrome://extensions",
  );
  const primaryClient = primary.client;
  await waitFor(
    primaryClient,
    `typeof chrome?.developerPrivate?.getExtensionsInfo === "function"`,
    "chrome.developerPrivate is unavailable on chrome://extensions",
  );
  await waitFor(
    primaryClient,
    `new Promise((resolvePromise) => {
      chrome.developerPrivate.getExtensionsInfo(
        { includeDisabled: true, includeTerminated: true },
        (items) => resolvePromise(items.some((item) => item.id === ${JSON.stringify(extensionId)})),
      );
    })`,
    `CDP-loaded unpacked Web-To-Figma extension was not visible in chrome://extensions with ${chromePath}`,
  );

  console.log("NODE-31 file protocol: disabling explicit file access");
  await updateFileAccess(primaryClient, extensionId, false);
  await waitFor(
    primaryClient,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise(info.fileAccess?.isEnabled === true && info.fileAccess?.isActive === false),
      );
    })`,
    "Chrome extension management state did not report file access disabled",
  );
  const disabledAccess = await evaluate(
    primaryClient,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise(info.fileAccess ?? null),
      );
    })`,
  );
  assert(disabledAccess?.isEnabled === true, "File access permission toggle is unavailable");
  assert(
    disabledAccess?.isActive === false,
    "Explicit file URL access disable did not take effect",
  );

  console.log("NODE-31 file protocol: enabling explicit file access");
  await updateFileAccess(primaryClient, extensionId, true);
  await waitFor(
    primaryClient,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise(info.fileAccess?.isEnabled === true && info.fileAccess?.isActive === true),
      );
    })`,
    "Chrome extension management state did not report file access enabled",
  );
  const enabledAccess = await evaluate(
    primaryClient,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise(info.fileAccess ?? null),
      );
    })`,
  );
  assert(enabledAccess?.isEnabled === true, "File access permission toggle became unavailable");
  assert(enabledAccess?.isActive === true, "Explicit file URL access enable did not take effect");

  await navigate(primaryClient, fixtureUrl, "file protocol fixture");
  assert(
    await evaluate(
      primaryClient,
      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,
    ),
    "File protocol fixture content did not load",
  );

  console.log("NODE-31 file protocol: loading real file fixture before production message capture");
  await navigate(
    primaryClient,
    fixtureUrl,
    "file protocol fixture before production message capture",
  );
  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });
  await delay(100);
  assert(
    await evaluate(
      primaryClient,
      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,
    ),
    "File protocol fixture content did not load after explicit permission enable",
  );

  const extensionScopeUrl = `chrome-extension://${extensionId}/`;
  const extensionWorkerUrl = `${extensionScopeUrl}runtime/service-worker.js`;
  console.log(
    "NODE-31 file protocol: reusing trusted Chrome extensions UI for real inspect-view interaction",
  );
  await navigate(
    primaryClient,
    "chrome://extensions/",
    "trusted Chrome extensions manager for worker inspection",
  );
  const managementClient = primaryClient;
  await waitFor(
    managementClient,
    `document.querySelector("extensions-manager") !== null`,
    "Chrome extensions manager custom element did not initialize",
  );

  const deepElementExpression = `(() => {
    const visit = (root, result = []) => {
      for (const element of root.querySelectorAll("*")) {
        result.push(element);
        if (element.shadowRoot) visit(element.shadowRoot, result);
      }
      return result;
    };
    return visit(document);
  })()`;

  const devModeEnabled = await evaluate(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const toolbar = elements.find((element) => element.tagName === "EXTENSIONS-TOOLBAR");
      if (!toolbar) return { ready: false, reason: "toolbar-missing" };
      if (toolbar.inDevMode === true) return { ready: true, changed: false };
      const toggle = toolbar.shadowRoot?.querySelector("#devMode");
      if (!toggle) return { ready: false, reason: "dev-mode-toggle-missing" };
      toggle.click();
      return { ready: true, changed: true };
    })()`,
  );
  assert(
    devModeEnabled?.ready === true,
    `Unable to enable Chrome extensions developer mode: ${devModeEnabled?.reason}`,
  );

  await waitFor(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const toolbar = elements.find((element) => element.tagName === "EXTENSIONS-TOOLBAR");
      return toolbar?.inDevMode === true;
    })()`,
    "Chrome extensions UI did not enter developer mode",
  );

  await waitFor(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const item = elements.find(
        (element) => element.tagName === "EXTENSIONS-ITEM" && element.data?.id === ${JSON.stringify(extensionId)},
      );
      if (!item) return false;
      const views = item.data?.views ?? [];
      const hasWorker = views.some(
        (view) => view.type === "EXTENSION_SERVICE_WORKER_BACKGROUND" ||
          String(view.url ?? "").endsWith("/runtime/service-worker.js"),
      );
      return hasWorker && !!item.shadowRoot?.querySelector("#inspect-views a");
    })()`,
    "Chrome extensions UI did not expose the inactive Web-To-Figma service-worker inspect view",
  );

  const inspectClick = await evaluate(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const item = elements.find(
        (element) => element.tagName === "EXTENSIONS-ITEM" && element.data?.id === ${JSON.stringify(extensionId)},
      );
      if (!item) return { clicked: false, reason: "extension-item-missing" };
      const views = item.data?.views ?? [];
      const workerView = views.find(
        (view) => view.type === "EXTENSION_SERVICE_WORKER_BACKGROUND" ||
          String(view.url ?? "").endsWith("/runtime/service-worker.js"),
      );
      const link = item.shadowRoot?.querySelector("#inspect-views a");
      if (!workerView || !link) {
        return { clicked: false, reason: "inspect-link-missing", views };
      }
      link.click();
      return {
        clicked: true,
        view: {
          url: workerView.url,
          type: workerView.type,
          renderProcessId: workerView.renderProcessId,
          renderViewId: workerView.renderViewId,
        },
      };
    })()`,
  );
  assert(
    inspectClick?.clicked === true,
    `Chrome extensions UI worker inspect click failed: ${inspectClick?.reason ?? "unknown"}`,
  );

  let workerTarget = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const targets = await browserClient.send("Target.getTargets");
    workerTarget =
      (targets.targetInfos ?? []).find(
        (target) => target.type === "service_worker" && target.url === extensionWorkerUrl,
      ) ?? null;
    if (workerTarget?.targetId) break;
    await delay(25);
  }
  if (!workerTarget?.targetId) {
    const targets = await browserClient.send("Target.getTargets");
    const summary = (targets.targetInfos ?? []).map((target) => ({
      type: target.type,
      url: target.url,
    }));
    throw new Error(
      `Final extension service worker did not start after Chrome extensions UI inspect click. Targets: ${JSON.stringify(summary)}`,
    );
  }

  const workerAttached = await browserClient.send("Target.attachToTarget", {
    targetId: workerTarget.targetId,
    flatten: true,
  });
  assert(workerAttached.sessionId, "Unable to attach to final extension service worker");
  const extensionClient = browserClient.session(workerAttached.sessionId);
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
  const workerUrl = await evaluate(extensionClient, `self.location.href`);
  assert(workerUrl === extensionWorkerUrl, `Attached worker URL mismatch: ${workerUrl}`);

  await navigate(
    primaryClient,
    fixtureUrl,
    "file protocol fixture after Chrome extensions UI inspect",
  );
  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });
  await delay(100);

  const activeTab = await evaluate(
    extensionClient,
    `(async () => {
      const tabs = await chrome.tabs.query({});
      const fileTab = tabs.find((candidate) => candidate.url === ${JSON.stringify(fixtureUrl)});
      return fileTab && typeof fileTab.id === "number"
        ? { id: fileTab.id, url: fileTab.url, windowId: fileTab.windowId }
        : null;
    })()`,
  );
  assert(activeTab?.url === fixtureUrl, `Final worker file tab lookup mismatch: ${activeTab?.url}`);
  assert(typeof activeTab?.id === "number", "Final worker could not resolve file tab id");

  console.log(
    "NODE-31 file protocol: dispatching production messages from file-tab extension world",
  );
  const productionResponses = await evaluate(
    extensionClient,
    `(async () => {
      const tabId = ${JSON.stringify(activeTab.id)};
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const capability = await chrome.runtime.sendMessage({
            type: "W2F_GET_SOURCE_CAPABILITY",
          });
          const job = await chrome.runtime.sendMessage({
            type: "W2F_START_JOB",
            mode: "full-page",
          });
          return { capability, job };
        },
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
    "Production source-capability response type mismatch",
  );
  const capability = capabilityResponse?.data;
  assert(capability?.provider === "file-tab", "File source provider mismatch");
  assert(capability?.supported === true, "File source is not marked supported");
  assert(capability?.available === true, "File source is not marked available");
  assert(capability?.code === "ready", "File source capability is not ready");

  const startJobResponse = productionResponses.job;
  assert(
    startJobResponse?.ok === true,
    `Production W2F_START_JOB request failed: ${startJobResponse?.error ?? "unknown"}`,
  );
  assert(
    startJobResponse?.requestType === "W2F_START_JOB",
    "Production capture response type mismatch",
  );
  const job = startJobResponse?.data;
  assert(job?.mode === "full-page", "Production capture job mode mismatch");
  assert(
    job?.status === "completed",
    `Production file capture job is not completed: ${job?.error ?? job?.status}`,
  );
  assert(job?.source?.provider === "file-tab", "Completed job lost file-tab source provider");
  assert(job?.source?.sourceType === "file", "Completed job lost file source type");
  assert(job?.source?.sourceUrl === fixtureUrl, "Completed job lost the real file URL");
  assert(job?.source?.offline === true, "Completed job lost offline file semantics");
  assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");
  assert(
    job?.capture?.adapter === "cdp",
    `High Fidelity file capture did not use the production CDP adapter: ${job?.capture?.adapter}`,
  );
  assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");
  assert(
    typeof job?.capture?.storageKey === "string" && job.capture.storageKey.length > 0,
    "Completed file capture did not persist a RawSnapshot",
  );

  console.log(
    "NODE-31 file protocol: reading persisted RawSnapshot from production snapshot store",
  );
  const snapshot = await evaluate(
    extensionClient,
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("w2f-capture-snapshots", 2);
        request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const value = await new Promise((resolve, reject) => {
          const transaction = database.transaction("rawSnapshots", "readonly");
          const request = transaction.objectStore("rawSnapshots").get(
            ${JSON.stringify(`raw-snapshot:${job.jobId}`)},
          );
          request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
          request.onsuccess = () => resolve(request.result ?? null);
        });
        return value;
      } finally {
        database.close();
      }
    })()`,
    30000,
  );
  assert(snapshot, "Production snapshot store did not return the completed RawSnapshot");
  assert(snapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");
  assert(
    snapshot?.title === "NODE-31 File Protocol Runtime",
    "Persisted file snapshot title mismatch",
  );
  const snapshotNodeById = new Map(
    (snapshot?.nodes ?? []).map((node) => [node.captureNodeId, node]),
  );
  const proofElement = (snapshot?.nodes ?? []).find(
    (node) =>
      node.kind === "element" &&
      node.source?.attributes?.["data-node31-role"] === "file-protocol-proof",
  );
  assert(proofElement, "Persisted file snapshot is missing the proof element node");

  const descendantIds = [...(proofElement.childCaptureNodeIds ?? [])];
  let editableTextNode = null;
  while (descendantIds.length > 0) {
    const descendantId = descendantIds.shift();
    const descendant = snapshotNodeById.get(descendantId);
    if (!descendant) continue;
    if (
      descendant.kind === "text" &&
      (descendant.textContent?.includes("NODE-31 explicit file URL permission runtime proof") ||
        descendant.text?.value?.includes("NODE-31 explicit file URL permission runtime proof"))
    ) {
      editableTextNode = descendant;
      break;
    }
    descendantIds.push(...(descendant.childCaptureNodeIds ?? []));
  }
  assert(
    editableTextNode,
    "Persisted file snapshot proof element is missing its editable descendant text node",
  );

  console.log(
    JSON.stringify(
      {
        version: "1.9.0",
        evidenceType: "node31-file-protocol-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        browserExecutable: chromePath,
        extensionArtifact: "apps/browser-extension/dist-high-fidelity",
        captureProfile: "high-fidelity",
        serviceWorkerArtifact:
          "apps/browser-extension/dist-high-fidelity/runtime/service-worker.js",
        sourceRuntimeArtifact:
          "apps/browser-extension/dist-high-fidelity/runtime/source-runtime.js",
        snapshotStoreArtifact:
          "apps/browser-extension/dist-high-fidelity/runtime/snapshot-store.js",
        serviceWorkerArtifact: "apps/browser-extension/dist/runtime/service-worker.js",
        snapshotStoreArtifact: "apps/browser-extension/dist/runtime/snapshot-store.js",
        sourceRuntimeArtifact: "apps/browser-extension/dist/runtime/source-runtime.js",
        captureArtifact: "apps/browser-extension/dist/runtime/standard-capture-adapter/capture.js",
        fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
        assertions: [
          "built-manifest-declares-file-scheme-host-permission",
          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",
          "chrome-management-state-explicitly-disables-file-access",
          "chrome-management-state-explicitly-enables-file-access",
          "real-file-url-fixture-loads-after-explicit-permission",
          "trusted-chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",
          "inspected-high-fidelity-worker-resumes-and-exposes-required-extension-apis",
          "final-service-worker-resolves-real-file-tab-for-message-injection",
          "production-message-injection-targets-prevalidated-file-tab-id",
          "file-tab-extension-world-dispatches-production-runtime-messages",
          "production-source-capability-resolves-active-file-tab-ready",
          "production-full-page-job-completes-on-file-url",
          "completed-job-preserves-file-source-and-page-url",
          "completed-job-uses-high-fidelity-cdp-capture-adapter",
          "completed-job-persists-raw-snapshot",
          "service-worker-origin-indexeddb-exposes-persisted-raw-snapshot",
          "persisted-raw-snapshot-preserves-file-url-and-title",
          "persisted-raw-snapshot-preserves-editable-text-structure",
        ],
        provesP0Items: ["file-protocol-explicit-permission"],
        notProvenByThisArtifact: [
          "geometry-preserving-correction-policy",
          "raster-text-only-when-policy-justifies",
        ],
        prohibitedShortcutFlags: ["--allow-file-access-from-files"],
      },
      null,
      2,
    ),
  );
} catch (error) {
  runError = error;
  throw error;
} finally {
  browserClient?.close();
  try {
    await stopChrome(chromeProcess);
  } catch (cleanupError) {
    if (!runError) throw cleanupError;
    console.warn(`NODE-31 Chrome cleanup warning after primary failure: ${String(cleanupError)}`);
  } finally {
    await removeProfileDir(profileDir);
  }
}
