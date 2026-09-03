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
      // Try next candidate.
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

async function stopProcess(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => childProcess.once("exit", resolvePromise)),
    delay(1500),
  ]);
  if (childProcess.exitCode === null) childProcess.kill("SIGKILL");
}

async function startHarness({ chromePath, chromeDriverPath, port, profileLabel }) {
  const base = `http://127.0.0.1:${port}`;
  const profileDir = await mkdtemp(join(tmpdir(), `w2f-node31-file-${profileLabel}-`));
  const process = spawn(chromeDriverPath, [`--port=${port}`, "--verbose"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  process.stderr.setEncoding("utf8");
  process.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-30000);
  });

  async function request(path, method = "GET", body) {
    const response = await fetch(`${base}${path}`, {
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

  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(`${base}/status`);
      if (response.ok) break;
    } catch {
      // ChromeDriver may still be starting.
    }
    if (attempt === 199) throw new Error(`Timed out waiting for ChromeDriver. ${stderr}`);
    await delay(25);
  }

  const session = await request("/session", "POST", {
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
  const sessionId = session?.sessionId;
  const webSocketUrl = session?.capabilities?.webSocketUrl;
  assert(sessionId, `ChromeDriver did not create a session. ${stderr}`);
  assert(typeof webSocketUrl === "string", "ChromeDriver did not expose a WebDriver BiDi URL");

  const bidi = new BidiClient(webSocketUrl);
  await bidi.connect();

  return {
    base,
    sessionId,
    bidi,
    request,
    profileDir,
    process,
    async cleanup() {
      bidi.close();
      await request(`/session/${sessionId}`, "DELETE").catch(() => undefined);
      await stopProcess(process).catch(() => undefined);
      await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch(
        () => undefined,
      );
    },
  };
}

async function navigate(harness, url) {
  await harness.request(`/session/${harness.sessionId}/url`, "POST", { url });
}

async function execute(harness, script, args = []) {
  return harness.request(`/session/${harness.sessionId}/execute/sync`, "POST", { script, args });
}

async function executeAsync(harness, script, args = []) {
  return harness.request(`/session/${harness.sessionId}/execute/async`, "POST", { script, args });
}

async function currentWindow(harness) {
  return harness.request(`/session/${harness.sessionId}/window`);
}

async function switchWindow(harness, handle) {
  await harness.request(`/session/${harness.sessionId}/window`, "POST", { handle });
}

async function currentUrl(harness) {
  return harness.request(`/session/${harness.sessionId}/url`);
}

async function newTab(harness) {
  const value = await harness.request(`/session/${harness.sessionId}/window/new`, "POST", {
    type: "tab",
  });
  assert(value?.handle, "ChromeDriver did not return a new tab handle");
  return value.handle;
}

async function installExtension(harness) {
  const installed = await harness.bidi.send(
    "webExtension.install",
    { extensionData: { type: "path", path: extensionRoot } },
    60000,
  );
  const extensionId = installed?.extension;
  assert(
    typeof extensionId === "string" && extensionId.length > 0,
    `BiDi did not return extension id: ${JSON.stringify(installed)}`,
  );
  return extensionId;
}

async function readRegistryInfo(harness, extensionId) {
  return executeAsync(
    harness,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.developerPrivate.getExtensionInfo(extensionId, (info) => {
       if (chrome.runtime.lastError) {
         done({ ok: false, error: chrome.runtime.lastError.message });
         return;
       }
       done({
         ok: true,
         id: info.id,
         state: info.state,
         location: info.location,
         userMayModify: info.userMayModify ?? null,
         disableReasons: info.disableReasons ?? null,
         fileAccess: info.fileAccess ?? null,
         optionsPage: info.optionsPage ?? null,
         views: (info.views ?? []).map((view) => ({
           type: view.type,
           url: view.url,
           incognito: view.incognito ?? null
         }))
       });
     });`,
    [extensionId],
  );
}

async function updateFileAccess(harness, extensionId, enabled) {
  return executeAsync(
    harness,
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

async function waitForFileAccess(harness, extensionId, active) {
  let lastInfo = null;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    lastInfo = await readRegistryInfo(harness, extensionId);
    if (lastInfo?.ok && lastInfo.fileAccess?.isEnabled === true && lastInfo.fileAccess?.isActive === active) {
      return lastInfo;
    }
    await delay(25);
  }
  throw new Error(
    `File access did not become ${active ? "active" : "inactive"}: ${JSON.stringify(lastInfo)}`,
  );
}

async function findWindowByUrl(harness, predicate) {
  const handles = await harness.request(`/session/${harness.sessionId}/window/handles`);
  const diagnostics = [];
  for (const handle of handles ?? []) {
    try {
      await switchWindow(harness, handle);
      const url = await currentUrl(harness);
      diagnostics.push({ handle, url });
      if (predicate(url)) return { handle, url, diagnostics };
    } catch (error) {
      diagnostics.push({ handle, error: String(error) });
    }
  }
  return { handle: null, url: null, diagnostics };
}

async function openOptionsThroughChrome(harness, extensionId) {
  const management = await findWindowByUrl(
    harness,
    (url) => typeof url === "string" && url.startsWith("chrome://extensions"),
  );
  assert(management.handle, `chrome://extensions window missing: ${JSON.stringify(management.diagnostics)}`);
  await switchWindow(harness, management.handle);
  const result = await executeAsync(
    harness,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     Promise.resolve(chrome.developerPrivate.showOptions(extensionId))
       .then(() => done({ ok: true }))
       .catch((error) => done({ ok: false, error: String(error?.stack ?? error) }));`,
    [extensionId],
  );
  assert(result?.ok === true, `developerPrivate.showOptions failed: ${result?.error}`);

  let lastDiagnostics = [];
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const found = await findWindowByUrl(
      harness,
      (url) => typeof url === "string" && url.startsWith(`chrome-extension://${extensionId}/`),
    );
    lastDiagnostics = found.diagnostics;
    if (found.handle) return found;
    await delay(25);
  }
  throw new Error(`Authorized extension options window not found: ${JSON.stringify(lastDiagnostics)}`);
}

async function provePermissionControl({ chromePath, chromeDriverPath }) {
  const harness = await startHarness({
    chromePath,
    chromeDriverPath,
    port: 9515,
    profileLabel: "permission-proof",
  });
  try {
    console.log("NODE-31 file protocol v14: permission session installing extension");
    const extensionId = await installExtension(harness);
    await navigate(harness, "chrome://extensions/");
    assert(
      (await execute(harness, "return typeof chrome?.developerPrivate?.getExtensionInfo;")) === "function",
      "chrome.developerPrivate unavailable in permission session",
    );

    const initial = await readRegistryInfo(harness, extensionId);
    assert(initial?.ok === true, "Permission session extension missing from diagnostics");
    assert(initial?.location === "UNPACKED", "Permission session extension is not unpacked");
    assert(initial?.state === "ENABLED", `Fresh BiDi extension is not enabled: ${JSON.stringify(initial)}`);
    assert(initial?.fileAccess?.isActive === true, "Fresh BiDi extension lacks active file access");

    const disabledUpdate = await updateFileAccess(harness, extensionId, false);
    assert(disabledUpdate?.ok === true, `Failed to disable file access: ${disabledUpdate?.error}`);
    const disabled = await waitForFileAccess(harness, extensionId, false);
    assert(disabled.fileAccess?.isActive === false, "File access did not become inactive");

    const enabledUpdate = await updateFileAccess(harness, extensionId, true);
    assert(enabledUpdate?.ok === true, `Failed to enable file access: ${enabledUpdate?.error}`);
    const reenabled = await waitForFileAccess(harness, extensionId, true);
    assert(reenabled.fileAccess?.isActive === true, "File access did not become active again");

    const automationReloadLimitation =
      disabled?.state === "DISABLED" &&
      disabled?.disableReasons?.unsupportedDeveloperExtension === true &&
      reenabled?.state === "DISABLED";

    console.log(
      `NODE-31 file protocol v14: permission proof ${JSON.stringify({ initial, disabled, reenabled, automationReloadLimitation })}`,
    );
    return {
      extensionId,
      initialState: initial.state,
      disabledState: disabled.state,
      reenabledState: reenabled.state,
      disabledFileAccess: disabled.fileAccess,
      reenabledFileAccess: reenabled.fileAccess,
      automationReloadLimitation,
    };
  } finally {
    await harness.cleanup();
  }
}

async function proveProductionCapture({ chromePath, chromeDriverPath }) {
  const harness = await startHarness({
    chromePath,
    chromeDriverPath,
    port: 9516,
    profileLabel: "capture-proof",
  });
  try {
    console.log("NODE-31 file protocol v14: fresh capture session installing extension");
    const extensionId = await installExtension(harness);
    await navigate(harness, "chrome://extensions/");
    const fresh = await readRegistryInfo(harness, extensionId);
    assert(fresh?.ok === true, "Capture session extension missing from diagnostics");
    assert(fresh?.location === "UNPACKED", "Capture session extension is not unpacked");
    assert(fresh?.state === "ENABLED", `Fresh capture extension is not enabled: ${JSON.stringify(fresh)}`);
    assert(fresh?.fileAccess?.isEnabled === true, "Capture session file permission is not enabled");
    assert(fresh?.fileAccess?.isActive === true, "Capture session file permission is not active");
    assert(
      (fresh?.views ?? []).some(
        (view) =>
          view.type === "EXTENSION_SERVICE_WORKER_BACKGROUND" &&
          view.url === `chrome-extension://${extensionId}/runtime/service-worker.js`,
      ),
      "Fresh capture session did not start production MV3 service worker",
    );

    const managementHandle = await currentWindow(harness);
    const fileHandle = await newTab(harness);
    await switchWindow(harness, fileHandle);
    await navigate(harness, fixtureUrl);
    const fixtureLoaded = await execute(
      harness,
      `return document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true;`,
    );
    assert(fixtureLoaded === true, "File protocol fixture content did not load");

    const optionsTarget = await openOptionsThroughChrome(harness, extensionId);
    await switchWindow(harness, optionsTarget.handle);
    const extensionDiagnostics = await execute(harness, `return {
      href: location.href,
      runtimeId: chrome?.runtime?.id ?? null,
      scriptingExecuteScript: typeof chrome?.scripting?.executeScript,
      storageLocal: typeof chrome?.storage?.local,
      tabsQuery: typeof chrome?.tabs?.query
    };`);
    assert(extensionDiagnostics?.runtimeId === extensionId, "Authorized options runtime id mismatch");
    assert(extensionDiagnostics?.tabsQuery === "function", "Authorized options lacks chrome.tabs.query");
    assert(
      extensionDiagnostics?.scriptingExecuteScript === "function",
      "Authorized options lacks chrome.scripting.executeScript",
    );

    console.log("NODE-31 file protocol v14: dispatching production messages from real file tab");
    const productionResponses = await executeAsync(
      harness,
      `const fixtureUrl = arguments[0];
       const done = arguments[arguments.length - 1];
       (async () => {
         try {
           const tabs = await chrome.tabs.query({});
           const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
           if (!fileTab || typeof fileTab.id !== "number") {
             done({ ok: false, error: "file-tab-not-found", tabs: tabs.map((tab) => ({ id: tab.id, url: tab.url })) });
             return;
           }
           const [injection] = await chrome.scripting.executeScript({
             target: { tabId: fileTab.id },
             func: async () => {
               const capability = await chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" });
               const job = await chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" });
               return { capability, job };
             }
           });
           done({ ok: true, result: injection?.result ?? null });
         } catch (error) {
           done({ ok: false, error: String(error?.stack ?? error) });
         }
       })();`,
      [fixtureUrl],
    );
    assert(productionResponses?.ok === true, `Production dispatch failed: ${productionResponses?.error}`);
    const responses = productionResponses.result;
    assert(responses, "Production message injection returned no result");

    const capabilityResponse = responses.capability;
    assert(capabilityResponse?.ok === true, "Production source-capability request failed");
    const capability = capabilityResponse?.data;
    assert(capability?.provider === "file-tab", "File source provider mismatch");
    assert(capability?.supported === true, "File source is not marked supported");
    assert(capability?.available === true, "File source is not marked available");
    assert(capability?.code === "ready", "File source capability is not ready");

    const startJobResponse = responses.job;
    assert(
      startJobResponse?.ok === true,
      `Production W2F_START_JOB failed: ${startJobResponse?.error ?? "unknown"}`,
    );
    const job = startJobResponse?.data;
    assert(job?.mode === "full-page", "Production file capture job mode mismatch");
    assert(
      job?.status === "completed",
      `Production file capture job is not completed: ${job?.error ?? job?.status}`,
    );
    assert(job?.source?.provider === "file-tab", "Completed job lost file-tab provider");
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

    const snapshotResult = await executeAsync(
      harness,
      `const key = arguments[0];
       const done = arguments[arguments.length - 1];
       (async () => {
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
             done({ ok: true, value });
           } finally {
             database.close();
           }
         } catch (error) {
           done({ ok: false, error: String(error?.stack ?? error) });
         }
       })();`,
      [`raw-snapshot:${job.jobId}`],
    );
    assert(snapshotResult?.ok === true, `Snapshot read failed: ${snapshotResult?.error}`);
    const rawSnapshot = snapshotResult.value;
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

    await switchWindow(harness, managementHandle).catch(() => undefined);
    return {
      extensionId,
      freshState: fresh.state,
      fileAccess: fresh.fileAccess,
      optionsUrl: optionsTarget.url,
      captureAdapter: job.capture.adapter,
      captureNodeCount: job.capture.nodeCount,
      storageKey: job.capture.storageKey,
      jobId: job.jobId,
      editableProofText: true,
    };
  } finally {
    await harness.cleanup();
  }
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

const permissionProof = await provePermissionControl({ chromePath, chromeDriverPath });
const captureProof = await proveProductionCapture({ chromePath, chromeDriverPath });

console.log(
  JSON.stringify(
    {
      version: "14.0.0",
      evidenceType: "node31-file-protocol-browser-runtime",
      status: "PASS",
      browserExecutable: chromePath,
      chromeDriverExecutable: chromeDriverPath,
      extensionArtifact: "apps/browser-extension/dist-high-fidelity",
      captureProfile: "high-fidelity",
      fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
      proofArchitecture: "two-fresh-webdriver-bidi-sessions",
      proofSeparationReason:
        "Chromium file-access configuration synchronously reloads the extension; ChromeDriver marks the WebDriver-BiDi temporary unpacked extension as unsupportedDeveloperExtension after that automation-only reload. Permission-control and production-capture claims are therefore verified in isolated fresh sessions without fabricating extension state.",
      permissionProof,
      captureProof,
      assertions: [
        "fresh-bidi-extension-starts-enabled-with-explicit-file-access-active",
        "chrome-file-access-setting-can-be-explicitly-disabled",
        "chrome-file-access-setting-can-be-explicitly-reenabled",
        "automation-reload-state-is-recorded-not-overridden",
        "fresh-capture-session-starts-production-mv3-service-worker",
        "chrome-opens-real-authorized-extension-options-page",
        "authorized-extension-page-has-tabs-and-scripting-apis",
        "production-extension-injects-into-real-file-tab",
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
      prohibitedWorkerHarnessDependency: "CDP direct service-worker target attach",
      prohibitedEvidenceFabrication: "no mocked permission state or mocked production W2F responses"
    },
    null,
    2,
  ),
);
