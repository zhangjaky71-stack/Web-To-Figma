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
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs,
  );
  if (response.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  return response.result?.value;
}

async function waitFor(client, expression, message, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
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

async function navigate(client, url, label) {
  const response = await client.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`${label} navigation failed: ${response.errorText}`);
  await waitFor(client, `document.readyState === "complete"`, `${label} did not finish loading`);
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
    await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
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

const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-file-protocol-v3-"));
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

  const management = await createPageSession(
    browserClient,
    "chrome://extensions/",
    "chrome://extensions",
  );
  await waitFor(
    management.client,
    `typeof chrome?.developerPrivate?.getExtensionInfo === "function"`,
    "chrome.developerPrivate is unavailable on chrome://extensions",
  );

  console.log("NODE-31 file protocol v3: disabling explicit file access");
  await updateFileAccess(management.client, extensionId, false);
  await waitFor(
    management.client,
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

  console.log("NODE-31 file protocol v3: enabling explicit file access");
  await updateFileAccess(management.client, extensionId, true);
  await waitFor(
    management.client,
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

  const filePage = await createPageSession(browserClient, fixtureUrl, "file protocol fixture");
  await browserClient.send("Target.activateTarget", { targetId: filePage.targetId });
  assert(
    await evaluate(
      filePage.client,
      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,
    ),
    "File protocol fixture content did not load after explicit permission enable",
  );

  const extensionPageUrl = `chrome-extension://${extensionId}/options.html`;
  const extensionPage = await createPageSession(browserClient, extensionPageUrl, "extension options page");
  await waitFor(
    extensionPage.client,
    `typeof chrome?.runtime?.id === "string" && typeof chrome?.tabs?.query === "function" && typeof chrome?.scripting?.executeScript === "function"`,
    "Extension page APIs did not become ready",
    400,
  );
  assert(
    await evaluate(extensionPage.client, `chrome.runtime.id === ${JSON.stringify(extensionId)}`),
    "Extension page runtime id mismatch",
  );

  console.log(
    "NODE-31 file protocol v3: dispatching production messages through the real file-tab extension world",
  );
  const productionResponses = await evaluate(
    extensionPage.client,
    `(async () => {
      const tabs = await chrome.tabs.query({});
      const fileTab = tabs.find((candidate) => candidate.url === ${JSON.stringify(fixtureUrl)});
      if (!fileTab || typeof fileTab.id !== "number") {
        return { error: "file-tab-not-found", tabs: tabs.map((tab) => ({ id: tab.id, url: tab.url })) };
      }
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: fileTab.id },
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
  assert(!productionResponses.error, `Extension-page dispatch failed: ${productionResponses.error}`);

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

  console.log("NODE-31 file protocol v3: reading persisted RawSnapshot from extension origin");
  const snapshot = await evaluate(
    extensionPage.client,
    `(async () => {
      const database = await new Promise((resolvePromise, reject) => {
        const request = indexedDB.open("w2f-capture-snapshots", 2);
        request.onerror = () => reject(request.error ?? new Error("failed to open snapshot database"));
        request.onsuccess = () => resolvePromise(request.result);
      });
      try {
        return await new Promise((resolvePromise, reject) => {
          const transaction = database.transaction("rawSnapshots", "readonly");
          const request = transaction.objectStore("rawSnapshots").get(
            ${JSON.stringify(`raw-snapshot:${job.jobId}`)},
          );
          request.onerror = () => reject(request.error ?? new Error("failed to read RawSnapshot"));
          request.onsuccess = () => resolvePromise(request.result ?? null);
        });
      } finally {
        database.close();
      }
    })()`,
    30000,
  );
  assert(snapshot, "Production snapshot store did not return the completed RawSnapshot");
  assert(snapshot?.url === fixtureUrl, "Persisted file snapshot URL mismatch");
  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Persisted file snapshot title mismatch");

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
        version: "3.0.0",
        evidenceType: "node31-file-protocol-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        browserExecutable: chromePath,
        extensionArtifact: "apps/browser-extension/dist-high-fidelity",
        captureProfile: "high-fidelity",
        fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
        assertions: [
          "built-manifest-declares-file-scheme-host-permission",
          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",
          "chrome-management-state-explicitly-disables-file-access",
          "chrome-management-state-explicitly-enables-file-access",
          "real-file-url-fixture-loads-after-explicit-permission",
          "extension-origin-page-exposes-real-extension-apis",
          "extension-page-injects-into-real-file-tab",
          "file-tab-extension-world-dispatches-production-runtime-messages",
          "chrome-naturally-wakes-mv3-service-worker-on-runtime-message",
          "production-source-capability-resolves-sender-file-tab-ready",
          "production-full-page-job-completes-on-file-url",
          "completed-job-preserves-file-source-and-page-url",
          "completed-job-uses-high-fidelity-cdp-capture-adapter",
          "completed-job-persists-raw-snapshot",
          "extension-origin-indexeddb-exposes-persisted-raw-snapshot",
          "persisted-raw-snapshot-preserves-file-url-and-title",
          "persisted-raw-snapshot-preserves-editable-text-structure",
        ],
        provesP0Items: ["file-protocol-explicit-permission"],
        prohibitedShortcutFlags: ["--allow-file-access-from-files"],
        prohibitedInternalUiDependency: "chrome://extensions inspect-view click",
        prohibitedWorkerHarnessDependency: "direct service-worker target attach",
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
