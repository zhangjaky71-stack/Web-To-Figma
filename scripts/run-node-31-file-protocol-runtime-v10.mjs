import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execFileAsync = promisify(execFile);
const extensionRoot = resolve("apps/browser-extension/dist-high-fidelity");
const manifestPath = join(extensionRoot, "manifest.json");
const fixturePath = resolve("qa/corpus/node31/p0/file-protocol-runtime.html");
const fixtureUrl = pathToFileURL(fixturePath).href;
const driverPort = 9515;
const driverBase = `http://127.0.0.1:${driverPort}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findExecutable(envName, command, knownPaths) {
  const explicit = process.env[envName];
  if (explicit) {
    await access(explicit);
    return explicit;
  }
  for (const candidate of knownPaths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  try {
    const { stdout } = await execFileAsync("which", [command]);
    const candidate = stdout.trim();
    if (candidate) return candidate;
  } catch {
    // Report one actionable error below.
  }
  throw new Error(`${command} executable not found`);
}

async function waitForHttp(url, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // ChromeDriver may still be starting.
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function driverRequest(path, method = "GET", body) {
  const response = await fetch(`${driverBase}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.value?.error) {
    throw new Error(
      `ChromeDriver ${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload?.value;
}

class BidiClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.type === "error") {
        pending.reject(new Error(`BiDi ${message.error}: ${message.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("WebDriver BiDi socket closed before response"));
      }
      this.pending.clear();
    });
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out opening WebDriver BiDi socket")),
        10000,
      );
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolvePromise();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Failed to open WebDriver BiDi socket"));
        },
        { once: true },
      );
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    assert(this.socket?.readyState === WebSocket.OPEN, "WebDriver BiDi socket is not open");
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for WebDriver BiDi command: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function navigate(sessionId, url) {
  await driverRequest(`/session/${sessionId}/url`, "POST", { url });
}

async function execute(sessionId, script, args = []) {
  return driverRequest(`/session/${sessionId}/execute/sync`, "POST", { script, args });
}

async function executeAsync(sessionId, script, args = []) {
  return driverRequest(`/session/${sessionId}/execute/async`, "POST", { script, args });
}

async function switchWindow(sessionId, handle) {
  await driverRequest(`/session/${sessionId}/window`, "POST", { handle });
}

async function currentWindow(sessionId) {
  return driverRequest(`/session/${sessionId}/window`);
}

async function newTab(sessionId) {
  const value = await driverRequest(`/session/${sessionId}/window/new`, "POST", { type: "tab" });
  assert(value?.handle, "ChromeDriver did not return a new tab handle");
  return value.handle;
}

async function updateFileAccess(sessionId, extensionId, enabled) {
  return executeAsync(
    sessionId,
    `const extensionId = arguments[0];
     const enabled = arguments[1];
     const done = arguments[arguments.length - 1];
     chrome.developerPrivate.updateExtensionConfiguration(
       { extensionId, fileAccess: enabled },
       () => chrome.runtime.lastError
         ? done({ ok: false, error: chrome.runtime.lastError.message })
         : done({ ok: true })
     );`,
    [extensionId, enabled],
  );
}

async function readExtensionInfo(sessionId, extensionId) {
  return executeAsync(
    sessionId,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.developerPrivate.getExtensionInfo(
       extensionId,
       (info) => chrome.runtime.lastError
         ? done({ ok: false, error: chrome.runtime.lastError.message })
         : done({
             ok: true,
             id: info.id,
             state: info.state,
             location: info.location,
             fileAccess: info.fileAccess ?? null,
             optionsPage: info.optionsPage ?? null,
             views: info.views ?? []
           })
     );`,
    [extensionId],
  );
}

async function waitForFileAccess(sessionId, extensionId, active) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const info = await readExtensionInfo(sessionId, extensionId);
    if (info?.ok && info.fileAccess?.isEnabled === true && info.fileAccess?.isActive === active) {
      return info;
    }
    await delay(25);
  }
  throw new Error(`File access did not become ${active ? "enabled" : "disabled"}`);
}

async function waitForExtensionServiceWorkerRealm(bidi, extensionId) {
  const expectedOrigin = `chrome-extension://${extensionId}`;
  let lastRealms = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await bidi.send("script.getRealms", { type: "service-worker" });
    lastRealms = result?.realms ?? [];
    const realm = lastRealms.find(
      (candidate) =>
        candidate?.type === "service-worker" &&
        typeof candidate?.origin === "string" &&
        candidate.origin.startsWith(expectedOrigin),
    );
    if (realm?.realm) return realm;
    await delay(25);
  }
  throw new Error(
    `BiDi service-worker realm for ${extensionId} not found: ${JSON.stringify(lastRealms)}`,
  );
}

async function callRealmJson(bidi, realmId, functionDeclaration, args = [], timeoutMs = 60000) {
  const result = await bidi.send(
    "script.callFunction",
    {
      functionDeclaration,
      awaitPromise: true,
      target: { realm: realmId },
      arguments: args.map((value) => ({ type: "string", value })),
      resultOwnership: "none",
    },
    timeoutMs,
  );
  assert(
    result?.type === "success",
    `BiDi service-worker function failed: ${JSON.stringify(result?.exceptionDetails ?? result)}`,
  );
  assert(
    result?.result?.type === "string" && typeof result.result.value === "string",
    `BiDi service-worker function did not return JSON text: ${JSON.stringify(result)}`,
  );
  return JSON.parse(result.result.value);
}

async function stopProcess(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => childProcess.once("exit", resolvePromise)),
    delay(1500),
  ]);
  if (childProcess.exitCode === null) childProcess.kill("SIGKILL");
}

await access(manifestPath);
await access(fixturePath);
const chromePath = await findExecutable("W2F_EXTENSION_TEST_CHROME_BIN", "google-chrome", [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
]);
const chromeDriverPath = await findExecutable("CHROMEDRIVER_BIN", "chromedriver", [
  "/usr/bin/chromedriver",
  "/usr/local/bin/chromedriver",
]);
const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-file-protocol-v10-"));
let driverProcess;
let sessionId;
let bidi;
let driverStderr = "";
let runError;

try {
  driverProcess = spawn(chromeDriverPath, [`--port=${driverPort}`, "--verbose"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  driverProcess.stderr.setEncoding("utf8");
  driverProcess.stderr.on("data", (chunk) => {
    driverStderr = `${driverStderr}${chunk}`.slice(-30000);
  });
  await waitForHttp(`${driverBase}/status`);

  const session = await driverRequest("/session", "POST", {
    capabilities: {
      alwaysMatch: {
        browserName: "chrome",
        webSocketUrl: true,
        "goog:chromeOptions": {
          binary: chromePath,
          enableExtensionTargets: true,
          args: [
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--remote-debugging-pipe",
            "--enable-unsafe-extension-debugging",
            `--user-data-dir=${profileDir}`,
          ],
        },
      },
    },
  });
  sessionId = session?.sessionId;
  const webSocketUrl = session?.capabilities?.webSocketUrl;
  assert(sessionId, `ChromeDriver did not create a session. ${driverStderr}`);
  assert(typeof webSocketUrl === "string", "ChromeDriver did not expose a WebDriver BiDi URL");

  bidi = new BidiClient(webSocketUrl);
  await bidi.connect();

  console.log("NODE-31 file protocol v10: installing unpacked extension with WebDriver BiDi");
  const installed = await bidi.send(
    "webExtension.install",
    { extensionData: { type: "path", path: extensionRoot } },
    60000,
  );
  const extensionId = installed?.extension;
  assert(
    typeof extensionId === "string" && extensionId.length > 0,
    `BiDi did not return extension id: ${JSON.stringify(installed)}`,
  );
  console.log(`NODE-31 file protocol v10: installed extension ${extensionId}`);

  await navigate(sessionId, "chrome://extensions/");
  const developerPrivate = await execute(
    sessionId,
    "return typeof chrome?.developerPrivate?.getExtensionInfo;",
  );
  assert(
    developerPrivate === "function",
    "chrome.developerPrivate is unavailable in Chrome extensions manager",
  );

  const installedInfo = await readExtensionInfo(sessionId, extensionId);
  console.log(
    `NODE-31 file protocol v10: BiDi-installed extension registry diagnostics ${JSON.stringify(installedInfo)}`,
  );
  assert(installedInfo?.ok === true, "BiDi-installed extension is absent from Chrome diagnostics");
  assert(installedInfo?.location === "UNPACKED", "BiDi-installed extension is not unpacked");

  console.log("NODE-31 file protocol v10: disabling explicit file access");
  const disabledUpdate = await updateFileAccess(sessionId, extensionId, false);
  assert(disabledUpdate?.ok === true, `Failed to disable file access: ${disabledUpdate?.error}`);
  await waitForFileAccess(sessionId, extensionId, false);

  console.log("NODE-31 file protocol v10: enabling explicit file access");
  const enabledUpdate = await updateFileAccess(sessionId, extensionId, true);
  assert(enabledUpdate?.ok === true, `Failed to enable file access: ${enabledUpdate?.error}`);
  const enabledInfo = await waitForFileAccess(sessionId, extensionId, true);
  assert(enabledInfo?.fileAccess?.isActive === true, "Explicit file access is not active");

  const managementHandle = await currentWindow(sessionId);
  const fileHandle = await newTab(sessionId);
  await switchWindow(sessionId, fileHandle);
  await navigate(sessionId, fixtureUrl);
  const fixtureLoaded = await execute(
    sessionId,
    `return document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true;`,
  );
  assert(fixtureLoaded === true, "File protocol fixture content did not load");

  console.log("NODE-31 file protocol v10: resolving production MV3 service-worker realm through W3C BiDi");
  const serviceWorkerRealm = await waitForExtensionServiceWorkerRealm(bidi, extensionId);
  console.log(
    `NODE-31 file protocol v10: service-worker realm ${JSON.stringify(serviceWorkerRealm)}`,
  );

  console.log("NODE-31 file protocol v10: dispatching production messages from worker through real file tab");
  const dispatch = await callRealmJson(
    bidi,
    serviceWorkerRealm.realm,
    `async function(fixtureUrl) {
       try {
         const tabs = await chrome.tabs.query({});
         const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
         if (!fileTab || typeof fileTab.id !== "number") {
           return JSON.stringify({
             error: "file-tab-not-found",
             runtimeId: chrome?.runtime?.id ?? null,
             tabs: tabs.map((tab) => ({ id: tab.id, url: tab.url }))
           });
         }
         const [injection] = await chrome.scripting.executeScript({
           target: { tabId: fileTab.id },
           func: async () => {
             const capability = await chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" });
             const job = await chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" });
             return { capability, job };
           },
         });
         return JSON.stringify({
           runtimeId: chrome?.runtime?.id ?? null,
           tabsQuery: typeof chrome?.tabs?.query,
           scriptingExecuteScript: typeof chrome?.scripting?.executeScript,
           response: injection?.result ?? null
         });
       } catch (error) {
         return JSON.stringify({ error: String(error?.stack ?? error) });
       }
     }`,
    [fixtureUrl],
    90000,
  );
  assert(!dispatch?.error, `Service-worker dispatch failed: ${dispatch?.error}`);
  assert(dispatch?.runtimeId === extensionId, "BiDi service-worker runtime id mismatch");
  assert(dispatch?.tabsQuery === "function", "Production service worker lacks chrome.tabs.query");
  assert(
    dispatch?.scriptingExecuteScript === "function",
    "Production service worker lacks chrome.scripting.executeScript",
  );

  const productionResponses = dispatch?.response;
  assert(productionResponses, "Production message injection returned no result");

  const capabilityResponse = productionResponses.capability;
  assert(capabilityResponse?.ok === true, "Production source-capability request failed");
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
    `High Fidelity file capture adapter mismatch: ${job?.capture?.adapter}`,
  );
  assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");
  assert(
    typeof job?.capture?.storageKey === "string",
    "Completed file capture did not persist a RawSnapshot",
  );

  const currentRealm = await waitForExtensionServiceWorkerRealm(bidi, extensionId);
  const snapshot = await callRealmJson(
    bidi,
    currentRealm.realm,
    `async function(key) {
       try {
         const database = await new Promise((resolvePromise, reject) => {
           const request = indexedDB.open("w2f-capture-snapshots", 2);
           request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
           request.onsuccess = () => resolvePromise(request.result);
         });
         try {
           const value = await new Promise((resolvePromise, reject) => {
             const transaction = database.transaction("rawSnapshots", "readonly");
             const request = transaction.objectStore("rawSnapshots").get(key);
             request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
             request.onsuccess = () => resolvePromise(request.result ?? null);
           });
           return JSON.stringify({ value });
         } finally {
           database.close();
         }
       } catch (error) {
         return JSON.stringify({ error: String(error?.stack ?? error) });
       }
     }`,
    [`raw-snapshot:${job.jobId}`],
    60000,
  );
  assert(!snapshot?.error, `Snapshot read failed: ${snapshot?.error}`);
  const rawSnapshot = snapshot?.value;
  assert(rawSnapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");
  assert(
    rawSnapshot?.title === "NODE-31 File Protocol Runtime",
    "Persisted file snapshot title mismatch",
  );

  const nodes = rawSnapshot?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.captureNodeId, node]));
  const proofElement = nodes.find(
    (node) =>
      node.kind === "element" &&
      node.source?.attributes?.["data-node31-role"] === "file-protocol-proof",
  );
  assert(proofElement, "Persisted file snapshot is missing the proof element node");
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

  console.log(
    JSON.stringify(
      {
        version: "10.0.0",
        evidenceType: "node31-file-protocol-browser-runtime",
        status: "PASS",
        browserExecutable: chromePath,
        chromeDriverExecutable: chromeDriverPath,
        extensionId,
        extensionInstallProtocol: "WebDriver-BiDi-webExtension.install",
        extensionExecutionProtocol: "WebDriver-BiDi-script.getRealms+script.callFunction",
        extensionRealmType: "service-worker",
        extensionArtifact: "apps/browser-extension/dist-high-fidelity",
        captureProfile: "high-fidelity",
        fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
        observedRegistryState: installedInfo?.state ?? null,
        assertions: [
          "unpacked-extension-installed-through-current-webdriver-bidi-webextension-protocol",
          "chrome-management-state-explicitly-disables-file-access",
          "chrome-management-state-explicitly-enables-file-access",
          "w3c-bidi-resolves-production-mv3-service-worker-realm",
          "production-service-worker-has-tabs-and-scripting-apis",
          "production-service-worker-injects-into-real-file-tab",
          "file-tab-extension-world-dispatches-production-runtime-messages",
          "production-source-capability-resolves-sender-file-tab-ready",
          "production-full-page-job-completes-on-file-url",
          "completed-job-uses-high-fidelity-cdp-capture-adapter",
          "persisted-raw-snapshot-preserves-editable-text-structure"
        ],
        provesP0Items: ["file-protocol-explicit-permission"],
        prohibitedShortcutFlags: [
          "--allow-file-access-from-files",
          "--disable-extensions-file-access-check"
        ],
        prohibitedLegacyInstallFlags: ["--load-extension", "--disable-extensions-except"],
        prohibitedInternalUiDependency: "chrome://extensions inspect-view click",
        prohibitedSyntheticExtensionNavigation: "manual chrome-extension:// page navigation",
        prohibitedRegistryMutation: "management.setEnabled for BiDi-owned extension",
        prohibitedWorkerHarnessDependency: "CDP direct service-worker target attach"
      },
      null,
      2,
    ),
  );

  await switchWindow(sessionId, managementHandle);
} catch (error) {
  runError = error;
  throw error;
} finally {
  bidi?.close();
  if (sessionId) {
    await driverRequest(`/session/${sessionId}`, "DELETE").catch(() => undefined);
  }
  await stopProcess(driverProcess).catch((cleanupError) => {
    if (!runError) throw cleanupError;
  });
  await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch(
    () => undefined,
  );
}
