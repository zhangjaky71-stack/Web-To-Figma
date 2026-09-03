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
const jobStorageKey = "w2f.captureJob.v1";

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
      // Try the next known runner path.
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
  const profileDir = await mkdtemp(join(tmpdir(), `w2f-node31-file-v16-${profileLabel}-`));
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
    process,
    profileDir,
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

async function windowHandles(harness) {
  return harness.request(`/session/${harness.sessionId}/window/handles`);
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

async function provePermissionControl({ chromePath, chromeDriverPath }) {
  const harness = await startHarness({
    chromePath,
    chromeDriverPath,
    port: 9515,
    profileLabel: "permission",
  });
  try {
    console.log("NODE-31 file protocol v16: permission session installing extension");
    const extensionId = await installExtension(harness);
    await navigate(harness, "chrome://extensions/");
    assert(
      (await execute(harness, "return typeof chrome?.developerPrivate?.getExtensionInfo;")) === "function",
      "chrome.developerPrivate unavailable in permission session",
    );
    const initial = await readRegistryInfo(harness, extensionId);
    assert(initial?.ok === true && initial.state === "ENABLED", "Fresh extension is not enabled");
    assert(initial?.fileAccess?.isActive === true, "Fresh extension lacks active file access");

    const disabledUpdate = await updateFileAccess(harness, extensionId, false);
    assert(disabledUpdate?.ok === true, `Failed to disable file access: ${disabledUpdate?.error}`);
    const disabled = await waitForFileAccess(harness, extensionId, false);

    const enabledUpdate = await updateFileAccess(harness, extensionId, true);
    assert(enabledUpdate?.ok === true, `Failed to enable file access: ${enabledUpdate?.error}`);
    const reenabled = await waitForFileAccess(harness, extensionId, true);

    const automationReloadLimitation =
      disabled?.state === "DISABLED" &&
      disabled?.disableReasons?.unsupportedDeveloperExtension === true &&
      reenabled?.state === "DISABLED";
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

async function waitForPopupHandle(harness, handlesBefore, extensionId) {
  let diagnostics = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const handles = await windowHandles(harness);
    const candidates = handles.filter((handle) => !handlesBefore.includes(handle));
    diagnostics = candidates;
    for (const handle of candidates) {
      try {
        await switchWindow(harness, handle);
        const url = await currentUrl(harness);
        if (url === `chrome-extension://${extensionId}/popup.html`) return { handle, url };
      } catch {
        // Popup targets can appear while Chrome is still initializing the view.
      }
    }
    await delay(25);
  }
  throw new Error(`Keyboard action did not expose popup target: ${JSON.stringify(diagnostics)}`);
}

async function sendCaptureShortcut(harness) {
  const actions = [
    { type: "keyDown", value: "\uE009" },
    { type: "keyDown", value: "\uE008" },
    { type: "keyDown", value: "y" },
    { type: "keyUp", value: "y" },
    { type: "keyUp", value: "\uE008" },
    { type: "keyUp", value: "\uE009" },
  ];
  await harness.request(`/session/${harness.sessionId}/actions`, "POST", {
    actions: [{ type: "key", id: "node31-capture-shortcut", actions }],
  });
  await harness.request(`/session/${harness.sessionId}/actions`, "DELETE").catch(() => undefined);
}

async function readJobFromPopup(harness) {
  return executeAsync(
    harness,
    `const key = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.storage.local.get(key, (values) => {
       if (chrome.runtime.lastError) {
         done({ ok: false, error: chrome.runtime.lastError.message });
         return;
       }
       done({ ok: true, job: values[key] ?? null });
     });`,
    [jobStorageKey],
  );
}

async function waitForTerminalJob(harness, timeoutMs = 45000) {
  const startedAt = Date.now();
  let last = null;
  let signature = "";
  while (Date.now() - startedAt < timeoutMs) {
    const stored = await readJobFromPopup(harness);
    assert(stored?.ok === true, `Failed to read capture job: ${stored?.error}`);
    last = stored.job;
    const nextSignature = JSON.stringify({
      jobId: last?.jobId ?? null,
      status: last?.status ?? null,
      phase: last?.phase ?? null,
      adapter: last?.capture?.adapter ?? null,
      error: last?.error ?? null,
    });
    if (nextSignature !== signature) {
      signature = nextSignature;
      console.log(`NODE-31 file protocol v16: job ${signature}`);
    }
    if (["completed", "failed", "cancelled"].includes(last?.status)) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for keyboard-action capture job: ${JSON.stringify(last)}`);
}

async function readIndexedDbValue(harness, databaseName, version, storeName, key) {
  return executeAsync(
    harness,
    `const databaseName = arguments[0];
     const version = arguments[1];
     const storeName = arguments[2];
     const key = arguments[3];
     const done = arguments[arguments.length - 1];
     (async () => {
       try {
         const database = await new Promise((resolvePromise, reject) => {
           const request = indexedDB.open(databaseName, version);
           request.onerror = () => reject(request.error ?? new Error("failed to open database"));
           request.onsuccess = () => resolvePromise(request.result);
         });
         try {
           const value = await new Promise((resolvePromise, reject) => {
             const transaction = database.transaction(storeName, "readonly");
             const request = transaction.objectStore(storeName).get(key);
             request.onerror = () => reject(request.error ?? new Error("failed to read database value"));
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
    [databaseName, version, storeName, key],
  );
}

async function proveProductionCapture({ chromePath, chromeDriverPath }) {
  const harness = await startHarness({
    chromePath,
    chromeDriverPath,
    port: 9516,
    profileLabel: "capture",
  });
  try {
    console.log("NODE-31 file protocol v16: fresh capture session installing extension");
    const extensionId = await installExtension(harness);
    await navigate(harness, "chrome://extensions/");
    const fresh = await readRegistryInfo(harness, extensionId);
    assert(fresh?.ok === true && fresh.state === "ENABLED", "Fresh capture extension is not enabled");
    assert(fresh?.fileAccess?.isActive === true, "Fresh capture extension lacks file access");
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

    const handlesBefore = await windowHandles(harness);
    console.log("NODE-31 file protocol v16: invoking extension action with real keyboard shortcut");
    await sendCaptureShortcut(harness);
    const popup = await waitForPopupHandle(harness, handlesBefore, extensionId);
    assert(popup.url === `chrome-extension://${extensionId}/popup.html`, "Unexpected popup URL");

    const popupReady = await execute(
      harness,
      `return document.readyState === "complete" && !!document.getElementById("capture-full-page");`,
    );
    assert(popupReady === true, "Real extension popup did not expose the Full page button");

    const commandInfo = await executeAsync(
      harness,
      `const done = arguments[arguments.length - 1];
       chrome.commands.getAll((commands) => {
         if (chrome.runtime.lastError) {
           done({ ok: false, error: chrome.runtime.lastError.message });
           return;
         }
         done({ ok: true, commands });
       });`,
    );
    assert(commandInfo?.ok === true, `Unable to inspect registered commands: ${commandInfo?.error}`);
    const actionCommand = (commandInfo.commands ?? []).find((item) => item.name === "_execute_action");
    assert(actionCommand?.shortcut, "_execute_action shortcut is not registered in Chrome");

    const fileTabId = await executeAsync(
      harness,
      `const fixtureUrl = arguments[0];
       const done = arguments[arguments.length - 1];
       chrome.tabs.query({}, (tabs) => {
         if (chrome.runtime.lastError) {
           done({ ok: false, error: chrome.runtime.lastError.message });
           return;
         }
         const fileTab = tabs.find((tab) => tab.url === fixtureUrl);
         done({ ok: !!fileTab && typeof fileTab.id === "number", tabId: fileTab?.id ?? null });
       });`,
      [fixtureUrl],
    );
    assert(fileTabId?.ok === true, "Popup could not resolve the real file tab");

    const debuggerState = await executeAsync(
      harness,
      `const tabId = arguments[0];
       const done = arguments[arguments.length - 1];
       chrome.debugger.getTargets((targets) => {
         if (chrome.runtime.lastError) {
           done({ ok: false, error: chrome.runtime.lastError.message });
           return;
         }
         const target = (targets ?? []).find((item) => item.tabId === tabId);
         done({
           ok: true,
           target: target ? { id: target.id, tabId: target.tabId ?? null, attached: target.attached, url: target.url } : null
         });
       });`,
      [fileTabId.tabId],
    );
    assert(debuggerState?.ok === true, `Unable to inspect debugger ownership: ${debuggerState?.error}`);
    const debuggerOccupied = debuggerState.target?.attached === true;
    console.log(`NODE-31 file protocol v16: debugger target ${JSON.stringify(debuggerState.target)}`);

    const capability = await executeAsync(
      harness,
      `const done = arguments[arguments.length - 1];
       chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" })
         .then((response) => done({ ok: true, response }))
         .catch((error) => done({ ok: false, error: String(error?.stack ?? error) }));`,
    );
    assert(capability?.ok === true && capability.response?.ok === true, "Popup source capability request failed");
    assert(capability.response.data?.provider === "file-tab", "Popup did not resolve file-tab provider");
    assert(capability.response.data?.available === true, "Popup file source capability is unavailable");

    const clicked = await execute(
      harness,
      `const button = document.getElementById("capture-full-page");
       if (!button) return false;
       button.click();
       return true;`,
    );
    assert(clicked === true, "Failed to click the real popup Full page button");

    const job = await waitForTerminalJob(harness);
    assert(job?.status === "completed", `Keyboard-action file capture failed: ${job?.error ?? job?.status}`);
    assert(job?.mode === "full-page", "Keyboard-action capture mode mismatch");
    assert(job?.source?.provider === "file-tab", "Completed job lost file-tab provider");
    assert(job?.source?.sourceType === "file", "Completed job lost file source type");
    assert(job?.source?.sourceUrl === fixtureUrl, "Completed job lost the real file URL");
    assert(job?.source?.offline === true, "Completed job lost offline file semantics");
    assert(job?.page?.url === fixtureUrl, "Completed job page URL mismatch");
    assert((job?.capture?.nodeCount ?? 0) > 0, "Completed file capture contains no nodes");
    assert(typeof job?.capture?.storageKey === "string", "Completed capture did not persist RawSnapshot");
    assert(
      typeof job?.capture?.pixelGroundTruthStorageKey === "string",
      "Completed capture did not persist PixelGroundTruth",
    );

    if (debuggerOccupied) {
      assert(job.phase === "standard-fallback-complete", `Occupied debugger did not use fallback phase: ${job.phase}`);
      assert(job.capture.adapter === "standard", `Occupied debugger fallback adapter mismatch: ${job.capture.adapter}`);
      assert(job.capture.fallbackFromCdp === true, "Occupied debugger fallback was not recorded");
    } else {
      assert(job.phase === "high-fidelity-capture-complete", `Free debugger did not complete CDP phase: ${job.phase}`);
      assert(job.capture.adapter === "cdp", `Free debugger did not use CDP adapter: ${job.capture.adapter}`);
    }

    const rawResult = await readIndexedDbValue(
      harness,
      "w2f-capture-snapshots",
      2,
      "rawSnapshots",
      `raw-snapshot:${job.jobId}`,
    );
    assert(rawResult?.ok === true, `RawSnapshot read failed: ${rawResult?.error}`);
    const rawSnapshot = rawResult.value;
    assert(rawSnapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");
    assert(rawSnapshot?.title === "NODE-31 File Protocol Runtime", "Persisted file snapshot title mismatch");
    if (debuggerOccupied) {
      const fallbackDiagnostic = (rawSnapshot?.diagnostics ?? []).find(
        (item) => item.code === "CDP_CAPTURE_FALLBACK_STANDARD",
      );
      assert(fallbackDiagnostic, "Standard fallback snapshot is missing CDP fallback diagnostic");
      assert(
        String(fallbackDiagnostic.message ?? "").includes("already has an attached debugger"),
        "Fallback diagnostic did not preserve debugger-ownership reason",
      );
    }

    const nodes = rawSnapshot?.nodes ?? [];
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

    const pixelResult = await readIndexedDbValue(
      harness,
      "w2f-pixel-ground-truth",
      1,
      "captures",
      `pixel-ground-truth:${job.jobId}`,
    );
    assert(pixelResult?.ok === true, `PixelGroundTruth read failed: ${pixelResult?.error}`);
    const pixelGroundTruth = pixelResult.value;
    assert((pixelGroundTruth?.references?.length ?? 0) > 0, "PixelGroundTruth has no raster references");
    assert(
      (pixelGroundTruth?.references ?? []).some((reference) => reference.kind === "viewport"),
      "PixelGroundTruth is missing viewport reference",
    );
    assert(
      !(pixelGroundTruth?.diagnostics ?? []).some((item) => item.code === "RASTER_CAPTURE_FAILED"),
      "PixelGroundTruth recorded a raster capture failure",
    );

    await switchWindow(harness, managementHandle).catch(() => undefined);
    return {
      extensionId,
      freshState: fresh.state,
      fileAccess: fresh.fileAccess,
      actionShortcut: actionCommand.shortcut,
      popupUrl: popup.url,
      debuggerOccupied,
      captureAdapter: job.capture.adapter,
      capturePhase: job.phase,
      fallbackFromCdp: job.capture.fallbackFromCdp === true,
      captureNodeCount: job.capture.nodeCount,
      rasterReferenceCount: pixelGroundTruth.references.length,
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
      version: "16.0.0",
      evidenceType: "node31-file-protocol-browser-runtime",
      status: "PASS",
      browserExecutable: chromePath,
      chromeDriverExecutable: chromeDriverPath,
      extensionArtifact: "apps/browser-extension/dist-high-fidelity",
      captureProfile: "high-fidelity",
      fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
      proofArchitecture: "two-fresh-webdriver-bidi-sessions-plus-real-keyboard-action",
      proofSeparationReason:
        "Chromium file-access configuration reloads the extension and ChromeDriver disables its temporary unpacked extension after that automation-only reload. Permission-control and production-capture claims therefore use isolated fresh sessions. Production capture is invoked by the registered keyboard action shortcut so Chrome grants activeTab through a documented user-gesture path.",
      permissionProof,
      captureProof,
      assertions: [
        "fresh-bidi-extension-starts-enabled-with-explicit-file-access-active",
        "chrome-file-access-setting-can-be-explicitly-disabled",
        "chrome-file-access-setting-can-be-explicitly-reenabled",
        "automation-reload-state-is-recorded-not-overridden",
        "real-keyboard-shortcut-invokes-existing-extension-action",
        "chrome-opens-real-production-popup",
        "real-popup-full-page-button-starts-production-job",
        "active-file-tab-resolves-file-tab-source-capability",
        "debugger-ownership-is-observed-before-capture",
        "occupied-debugger-fails-fast-and-uses-explicit-standard-fallback",
        "free-debugger-retains-high-fidelity-cdp-path",
        "production-full-page-job-completes-on-file-url",
        "pixel-ground-truth-retains-real-viewport-raster-reference",
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