import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const extensionRoot = resolve("apps/browser-extension/dist");
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

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP pipe response: ${method}.\n${this.stderr()}`));
      }, 10000);
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

  const browserVersion = await browserClient.send("Browser.getVersion");
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
  const extensionPageUrl = `chrome-extension://${extensionId}/options.html`;

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

  await updateFileAccess(primaryClient, extensionId, false);
  await navigate(primaryClient, extensionPageUrl, "extension options with file access disabled");
  const disabledAccess = await evaluate(
    primaryClient,
    `chrome.extension.isAllowedFileSchemeAccess()`,
  );
  assert(disabledAccess === false, "Explicit file URL access disable did not take effect");

  await navigate(primaryClient, "chrome://extensions/", "chrome://extensions after disable");
  await waitFor(
    primaryClient,
    `typeof chrome?.developerPrivate?.updateExtensionConfiguration === "function"`,
    "chrome.developerPrivate did not recover after extension reload",
  );
  await updateFileAccess(primaryClient, extensionId, true);
  await navigate(primaryClient, extensionPageUrl, "extension options with file access enabled");
  const enabledAccess = await evaluate(
    primaryClient,
    `chrome.extension.isAllowedFileSchemeAccess()`,
  );
  assert(enabledAccess === true, "Explicit file URL access enable did not take effect");

  await navigate(primaryClient, fixtureUrl, "file protocol fixture");
  assert(
    await evaluate(
      primaryClient,
      `document.querySelector('[data-node31-role="file-protocol-proof"]')?.textContent?.includes("NODE-31 explicit file URL permission runtime proof") === true`,
    ),
    "File protocol fixture content did not load",
  );

  const helper = await createPageSession(browserClient, extensionPageUrl, "extension helper");
  const extensionClient = helper.client;
  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });
  await delay(100);

  const activeTabUrl = await evaluate(
    extensionClient,
    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.url ?? null)`,
  );
  assert(activeTabUrl === fixtureUrl, `Active extension-visible tab mismatch: ${activeTabUrl}`);
  assert(
    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,
    "Extension helper did not retain enabled file access",
  );

  const sourceResolution = await evaluate(
    extensionClient,
    `(async () => {
      const module = await import(chrome.runtime.getURL("runtime/source-runtime.js"));
      const result = await module.resolveActiveTabSource();
      return {
        tabId: result.tabId,
        capability: result.capability,
        descriptor: result.descriptor ?? null,
      };
    })()`,
  );
  assert(sourceResolution?.capability?.provider === "file-tab", "File source provider mismatch");
  assert(sourceResolution?.capability?.supported === true, "File source is not marked supported");
  assert(sourceResolution?.capability?.available === true, "File source is not marked available");
  assert(sourceResolution?.capability?.code === "ready", "File source capability is not ready");
  assert(sourceResolution?.descriptor?.sourceType === "file", "File source descriptor type mismatch");
  assert(sourceResolution?.descriptor?.sourceUrl === fixtureUrl, "File source URL was not preserved");
  assert(sourceResolution?.descriptor?.offline === true, "File source descriptor lost offline=true");

  const snapshot = await evaluate(
    extensionClient,
    `(async () => {
      const sourceModule = await import(chrome.runtime.getURL("runtime/source-runtime.js"));
      const captureModule = await import(
        chrome.runtime.getURL("runtime/standard-capture-adapter/capture.js")
      );
      const source = await sourceModule.resolveActiveTabSource();
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: source.tabId },
        func: captureModule.captureStandardSnapshotInPage,
        args: [{ captureTarget: { type: "document" }, maxNodes: 100000, includeComments: false }],
      });
      return injection?.result?.snapshot ?? null;
    })()`,
  );
  assert(snapshot?.adapter === "standard", "File page did not use the final Standard capture adapter");
  assert(snapshot?.url === fixtureUrl, "Captured file URL mismatch");
  assert(snapshot?.title === "NODE-31 File Protocol Runtime", "Captured file title mismatch");
  assert(
    snapshot?.nodes?.some(
      (node) =>
        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&
        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),
    ),
    "Captured file snapshot is missing editable fixture text",
  );

  console.log(
    JSON.stringify(
      {
        version: "1.1.0",
        evidenceType: "node31-file-protocol-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        browserExecutable: chromePath,
        extensionArtifact: "apps/browser-extension/dist",
        sourceRuntimeArtifact: "apps/browser-extension/dist/runtime/source-runtime.js",
        captureArtifact:
          "apps/browser-extension/dist/runtime/standard-capture-adapter/capture.js",
        fixtureArtifact: "qa/corpus/node31/p0/file-protocol-runtime.html",
        assertions: [
          "built-manifest-declares-file-scheme-host-permission",
          "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",
          "chrome-user-setting-explicitly-disables-file-access",
          "public-extension-api-reports-file-access-disabled",
          "chrome-user-setting-explicitly-enables-file-access",
          "public-extension-api-reports-file-access-enabled",
          "real-file-url-fixture-loads-in-active-tab",
          "enabled-extension-can-observe-active-file-url",
          "final-source-runtime-resolves-file-tab-ready",
          "file-source-descriptor-preserves-offline-file-url",
          "final-standard-adapter-captures-real-file-tab",
          "file-capture-preserves-editable-text-structure",
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
} finally {
  browserClient?.close();
  await stopChrome(chromeProcess);
  await removeProfileDir(profileDir);
}
