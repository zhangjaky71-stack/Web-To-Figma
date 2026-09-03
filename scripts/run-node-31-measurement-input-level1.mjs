import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { evaluateNode31MeasurementArtifact } from "../packages/figma-renderer/dist/index.js";
import { parseWtfPackage } from "../packages/wtf-parser/dist/index.js";

const sourceArtifact = "qa/corpus/node31/class-a/level1-core.html";
const sourcePath = resolve(sourceArtifact);
const fixtureUrl = pathToFileURL(sourcePath).href;
const extensionRoot = resolve("apps/browser-extension/dist-high-fidelity");
const outputDir = resolve(
  process.env.W2F_NODE31_MEASUREMENT_OUTPUT_DIR ?? "artifacts/node31-measurement-input",
);
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function checkoutRevision() {
  if (process.env.GITHUB_HEAD_SHA && /^[a-f0-9]{40}$/.test(process.env.GITHUB_HEAD_SHA)) {
    return process.env.GITHUB_HEAD_SHA;
  }
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    try {
      const parent = execFileSync("git", ["rev-parse", "HEAD^2"], { encoding: "utf8" }).trim();
      if (/^[a-f0-9]{40}$/.test(parent)) return parent;
    } catch {
      // Fall back to the checked-out revision below.
    }
  }
  const githubSha = process.env.GITHUB_SHA;
  if (githubSha && /^[a-f0-9]{40}$/.test(githubSha)) return githubSha;
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await readFile(candidate);
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
        reject(new Error(`Timed out waiting for CDP response: ${method}.\n${this.stderr()}`));
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

async function waitFor(client, expression, message, attempts = 400) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function waitForExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolvePromise) => childProcess.once("exit", () => resolvePromise(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function startChrome(chromePath) {
  const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-measurement-level1-"));
  let stderr = "";
  const processHandle = spawn(
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
  processHandle.stderr.setEncoding("utf8");
  processHandle.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-30000);
  });
  const pipeInput = processHandle.stdio[3];
  const pipeOutput = processHandle.stdio[4];
  assert(pipeInput && pipeOutput, "Chrome remote debugging pipe was not created");
  const browser = new PipeCdpClient(pipeInput, pipeOutput, () => stderr);
  const version = await browser.send("Browser.getVersion", {}, undefined, 60000);
  return {
    browser,
    processHandle,
    profileDir,
    version,
    async cleanup() {
      browser.close();
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGTERM");
        if (!(await waitForExit(processHandle, 1500))) {
          processHandle.kill("SIGKILL");
          await waitForExit(processHandle, 1500);
        }
      }
      await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    },
  };
}

async function attachPage(browser, targetId, label) {
  const attached = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  assert(attached.sessionId, `Unable to attach ${label} target`);
  const client = browser.session(attached.sessionId);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await waitFor(client, `document.readyState === "complete"`, `${label} did not finish loading`);
  return client;
}

async function createPage(browser, url, label) {
  const created = await browser.send("Target.createTarget", { url });
  assert(created.targetId, `Unable to create ${label} target`);
  return { targetId: created.targetId, client: await attachPage(browser, created.targetId, label) };
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

async function extensionInfo(managementClient, extensionId) {
  return evaluate(
    managementClient,
    `new Promise((resolvePromise, reject) => {
      chrome.developerPrivate.getExtensionInfo(
        ${JSON.stringify(extensionId)},
        (info) => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolvePromise({
              id: info.id,
              state: info.state,
              fileAccess: info.fileAccess ?? null,
              optionsPage: info.optionsPage ?? null
            })
      );
    })`,
  );
}

async function openOptions(browser, extensionId) {
  const management = await createPage(browser, "chrome://extensions/", "chrome://extensions");
  await waitFor(
    management.client,
    `typeof chrome?.developerPrivate?.getExtensionInfo === "function" &&
     typeof chrome?.developerPrivate?.showOptions === "function"`,
    "chrome.developerPrivate extension management APIs are unavailable",
  );
  const info = await extensionInfo(management.client, extensionId);
  assert(info?.state === "ENABLED", `Fresh High Fidelity extension is not enabled: ${info?.state}`);
  assert(info?.fileAccess?.isEnabled === true, "High Fidelity file-access toggle is unavailable");
  assert(info?.fileAccess?.isActive === true, "Fresh High Fidelity extension lacks active file access");

  await evaluate(
    management.client,
    `Promise.resolve(chrome.developerPrivate.showOptions(${JSON.stringify(extensionId)})).then(() => true)`,
  );
  const expectedUrl = `chrome-extension://${extensionId}/options.html`;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const targets = await browser.send("Target.getTargets");
    const target = targets.targetInfos?.find(
      (item) => item.type === "page" && item.url === expectedUrl,
    );
    if (target?.targetId) {
      const client = await attachPage(browser, target.targetId, "extension options");
      await waitFor(
        client,
        `typeof chrome?.tabs?.query === "function" &&
         typeof chrome?.scripting?.executeScript === "function" &&
         typeof chrome?.debugger?.getTargets === "function"`,
        "Chrome-opened extension options page lacks production extension APIs",
      );
      return { client, fileAccess: info.fileAccess };
    }
    await delay(25);
  }
  throw new Error("Chrome-opened extension options target not found");
}

async function createFixtureTab(browser, optionsClient) {
  const created = await browser.send("Target.createTarget", { url: fixtureUrl });
  assert(created.targetId, "Unable to create Class A Level-1 file target");
  let targetInfo = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const result = await browser.send("Target.getTargetInfo", { targetId: created.targetId });
    targetInfo = result.targetInfo ?? null;
    if (targetInfo?.url === fixtureUrl) break;
    await delay(25);
  }
  assert(targetInfo?.url === fixtureUrl, `Level-1 file target URL mismatch: ${targetInfo?.url}`);
  await browser.send("Target.activateTarget", { targetId: created.targetId });

  let last = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    last = await evaluate(
      optionsClient,
      `(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((item) => item.url === ${JSON.stringify(fixtureUrl)});
        if (!tab?.id) return { tab: null, probe: null, error: "tab-not-found" };
        try {
          const [probe] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ readyState: document.readyState, title: document.title })
          });
          return {
            tab: { id: tab.id, title: tab.title, url: tab.url, active: tab.active },
            probe: probe?.result ?? null,
            error: null
          };
        } catch (error) {
          return {
            tab: { id: tab.id, title: tab.title, url: tab.url, active: tab.active },
            probe: null,
            error: String(error?.message ?? error)
          };
        }
      })()`,
    );
    if (last?.tab?.id && last?.probe?.readyState === "complete") {
      return { ...last.tab, targetId: created.targetId };
    }
    await delay(25);
  }
  throw new Error(`Class A Level-1 file tab did not become production-injectable: ${JSON.stringify(last)}`);
}

async function readIndexedDb(optionsClient, databaseName, version, storeName, key, mapper) {
  return evaluate(
    optionsClient,
    `(async () => {
      const database = await new Promise((resolvePromise, reject) => {
        const request = indexedDB.open(${JSON.stringify(databaseName)}, ${JSON.stringify(version)});
        request.onerror = () => reject(request.error ?? new Error("failed to open database"));
        request.onsuccess = () => resolvePromise(request.result);
      });
      try {
        const value = await new Promise((resolvePromise, reject) => {
          const transaction = database.transaction(${JSON.stringify(storeName)}, "readonly");
          const request = transaction.objectStore(${JSON.stringify(storeName)}).get(${JSON.stringify(key)});
          request.onerror = () => reject(request.error ?? new Error("failed to read database value"));
          request.onsuccess = () => resolvePromise(request.result ?? null);
        });
        return value === null ? null : (${mapper})(value);
      } finally {
        database.close();
      }
    })()`,
    30000,
  );
}

const sourceBytes = await readFile(sourcePath);
const sourceSha256 = sha256(sourceBytes);
const chromePath = await findChrome();
const chrome = await startChrome(chromePath);

try {
  const extensionId = await loadExtension(chrome.browser);
  const options = await openOptions(chrome.browser, extensionId);
  const fixtureTab = await createFixtureTab(chrome.browser, options.client);

  const debuggerState = await evaluate(
    options.client,
    `(async () => {
      const targets = await chrome.debugger.getTargets();
      const target = targets.find((item) => item.tabId === ${JSON.stringify(fixtureTab.id)});
      return target
        ? { id: target.id, tabId: target.tabId ?? null, attached: target.attached, url: target.url }
        : null;
    })()`,
  );
  assert(debuggerState, "Production chrome.debugger target for Level-1 file tab was not found");
  assert(debuggerState.attached === false, "Harness unexpectedly attached Level-1 file target before capture");

  const production = await evaluate(
    options.client,
    `(async () => {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: ${JSON.stringify(fixtureTab.id)} },
        func: async () => {
          const capability = await chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" });
          const job = await chrome.runtime.sendMessage({ type: "W2F_START_JOB", mode: "full-page" });
          if (!job?.ok || job?.data?.status !== "completed") return { capability, job, exported: null };
          const exported = await chrome.runtime.sendMessage({
            type: "W2F_EXPORT_WTF",
            jobId: job.data.jobId
          });
          return { capability, job, exported };
        }
      });
      return injection?.result ?? null;
    })()`,
    120000,
  );

  assert(production?.capability?.ok === true, "Production source capability failed");
  assert(production?.capability?.data?.provider === "file-tab", "Level-1 capability provider is not file-tab");
  assert(production?.capability?.data?.supported === true, "Level-1 file source is unsupported");
  assert(production?.capability?.data?.available === true, "Level-1 file source is unavailable");
  assert(production?.capability?.data?.code === "ready", "Level-1 file source is not ready");
  assert(
    production?.job?.ok === true,
    `Production capture failed: ${production?.job?.error ?? "unknown"}`,
  );
  const job = production.job.data;
  assert(job?.status === "completed", `Production capture is ${job?.status ?? "missing"}`);
  assert(job?.mode === "full-page", "Class A Level-1 capture mode mismatch");
  assert(job?.source?.provider === "file-tab", "Class A Level-1 job lost file-tab provider");
  assert(job?.source?.sourceType === "file", "Class A Level-1 job lost file source type");
  assert(job?.source?.sourceUrl === fixtureUrl, "Class A Level-1 job lost exact file URL");
  assert(job?.source?.offline === true, "Class A Level-1 job lost offline file semantics");
  assert(job?.page?.url === fixtureUrl, "Class A Level-1 page URL mismatch");
  assert(job?.capture?.adapter === "cdp", "Class A Level-1 capture did not use high-fidelity CDP");
  assert(job?.capture?.fallbackFromCdp !== true, "Class A Level-1 capture unexpectedly fell back from CDP");
  assert(production?.exported?.ok === true, `Production WTF export failed: ${production?.exported?.error ?? "unknown"}`);
  const exportReceipt = production.exported.data;
  assert(exportReceipt?.archiveSha256, "Production WTF export did not return archive SHA-256");

  const rawSnapshot = await readIndexedDb(
    options.client,
    "w2f-capture-snapshots",
    2,
    "rawSnapshots",
    `raw-snapshot:${job.jobId}`,
    `(value) => value`,
  );
  assert(rawSnapshot?.url === fixtureUrl, "Persisted RawSnapshot URL mismatch");
  assert(rawSnapshot?.adapter === "cdp", "Persisted RawSnapshot adapter is not CDP");
  assert(rawSnapshot?.nodes?.length > 0, "Persisted RawSnapshot contains no nodes");
  assert(
    !(rawSnapshot?.diagnostics ?? []).some((item) => item.code === "CDP_CAPTURE_FALLBACK_STANDARD"),
    "Persisted RawSnapshot recorded an unexpected Standard fallback",
  );
  assert(
    (rawSnapshot?.nodes ?? []).some(
      (node) =>
        node.kind === "text" &&
        (node.textContent?.includes("Editable structure with deterministic visual evidence") ||
          node.text?.value?.includes("Editable structure with deterministic visual evidence")),
    ),
    "Persisted Level-1 RawSnapshot is missing deterministic editable text",
  );

  const storedPackage = await readIndexedDb(
    options.client,
    "w2f-wtf-packages",
    1,
    "packages",
    `wtf-package:${job.jobId}`,
    `(value) => ({
      version: value.version,
      jobId: value.jobId,
      filename: value.filename,
      mimeType: value.mimeType,
      sha256: value.sha256,
      summary: value.summary,
      bytes: Array.from(value.bytes ?? [])
    })`,
  );
  assert(storedPackage?.bytes?.length > 0, "Persisted production WTF package bytes are missing");
  const wtfBytes = Uint8Array.from(storedPackage.bytes);
  const computedWtfSha = sha256(wtfBytes);
  assert(computedWtfSha === exportReceipt.archiveSha256, "Export receipt SHA-256 disagrees with WTF bytes");
  assert(computedWtfSha === storedPackage.sha256, "Stored WTF SHA-256 disagrees with WTF bytes");

  const parsed = await parseWtfPackage(wtfBytes);
  assert(parsed.preview.renderNodeCount > 0, "Secure parser returned an empty render tree");
  assert(parsed.ir.sourceGraph.nodes.length > 0, "Secure parser returned an empty source graph");

  await mkdir(outputDir, { recursive: true });
  const base = "deterministic-level1-core";
  const rawPath = join(outputDir, `${base}.raw-snapshot.json`);
  const wtfPath = join(outputDir, `${base}.wtf`);
  const parsedPath = join(outputDir, `${base}.parsed-summary.json`);
  const measurementPath = join(outputDir, `${base}.measurement.json`);
  const rawBytes = Buffer.from(JSON.stringify(rawSnapshot, null, 2));
  const parsedSummary = {
    manifest: parsed.manifest,
    migration: parsed.migration,
    preview: parsed.preview,
    sourceNodeCount: parsed.ir.sourceGraph.nodes.length,
    renderNodeCount: parsed.ir.renderTree.nodes.length,
    assetCount: parsed.ir.assets.assets.length,
  };
  const parsedBytes = Buffer.from(JSON.stringify(parsedSummary, null, 2));
  await writeFile(rawPath, rawBytes);
  await writeFile(wtfPath, wtfBytes);
  await writeFile(parsedPath, parsedBytes);

  const unavailableMetric = (label) => ({
    status: "UNAVAILABLE",
    reason: `${label} requires observed output from the real Figma Desktop render/export stage`,
  });
  const measurementArtifact = {
    version: "1.0.0",
    evidenceType: "node31-fidelity-measurement",
    sample: {
      id: base,
      testClass: "A",
      category: "deterministic-standard",
      supportClass: "native-supported",
      standardHtmlCss: true,
      level: 1,
      sourceArtifact,
      sourceSha256,
    },
    provenance: {
      branchHead: checkoutRevision(),
      generatedAt: new Date().toISOString(),
      environmentFingerprint: `${process.platform}-${process.arch}-node-${process.versions.node}-${chrome.version.product}-high-fidelity-file`,
      ...(process.env.GITHUB_RUN_ID && Number.isSafeInteger(Number(process.env.GITHUB_RUN_ID))
        ? { ciRunId: Number(process.env.GITHUB_RUN_ID) }
        : {}),
    },
    pipeline: {
      browserCapture: {
        status: "PASS",
        artifact: rawPath.replace(`${process.cwd()}/`, ""),
        sha256: sha256(rawBytes),
      },
      wtfPackage: {
        status: "PASS",
        artifact: wtfPath.replace(`${process.cwd()}/`, ""),
        sha256: computedWtfSha,
      },
      secureParse: {
        status: "PASS",
        artifact: parsedPath.replace(`${process.cwd()}/`, ""),
        sha256: sha256(parsedBytes),
      },
      figmaRender: {
        status: "UNAVAILABLE",
        reason:
          "Hosted Ubuntu CI does not provide the real Figma Desktop host; no simulator output is promoted to release evidence",
        host: {
          kind: "figma-host-simulator",
          version: "not-executed",
        },
      },
      figmaExport: {
        status: "UNAVAILABLE",
        reason: "Figma Desktop export cannot run before the real Figma Desktop render stage",
      },
    },
    metrics: {
      visualSimilarity: unavailableMetric("visualSimilarity"),
      geometryFidelity: unavailableMetric("geometryFidelity"),
      textFidelity: unavailableMetric("textFidelity"),
      assetFidelity: unavailableMetric("assetFidelity"),
      structureFidelity: unavailableMetric("structureFidelity"),
      responsiveFidelity: unavailableMetric("responsiveFidelity"),
    },
    antiCheatingViolations: [],
    notes: [
      "Production High Fidelity browser capture and production WTF export ran against the explicitly permitted file:// source path without synthetic activeTab grants.",
      "The harness never attached the Level-1 fixture target before production capture, leaving chrome.debugger uncontended for the production CDP path.",
      "Production parseWtfPackage accepted the emitted archive through secure ZIP, checksum, schema, media-policy and W2F IR validation.",
      "This partial artifact intentionally remains UNAVAILABLE until real Figma Desktop render/export evidence exists.",
    ],
  };

  const report = evaluateNode31MeasurementArtifact(measurementArtifact);
  assert(report.status === "UNAVAILABLE", `Partial measurement must remain UNAVAILABLE, got ${report.status}`);
  assert(report.releaseEligible === false, "Partial measurement must not be release eligible");
  assert(report.failures.length === 0, `Partial measurement has contract failures: ${report.failures.join("; ")}`);
  await writeFile(measurementPath, `${JSON.stringify(measurementArtifact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        version: "1.1.0",
        evidenceType: "node31-measurement-input-runtime",
        status: "PASS",
        sampleId: base,
        chrome: chrome.version.product,
        sourceProtocol: "file",
        explicitFileAccess: options.fileAccess,
        preCaptureDebuggerAttached: debuggerState.attached,
        captureAdapter: job.capture.adapter,
        sourceArtifact,
        sourceSha256,
        rawSnapshotSha256: measurementArtifact.pipeline.browserCapture.sha256,
        wtfSha256: computedWtfSha,
        secureParseSha256: measurementArtifact.pipeline.secureParse.sha256,
        parsedRenderNodeCount: parsed.preview.renderNodeCount,
        parsedSourceNodeCount: parsed.ir.sourceGraph.nodes.length,
        measurementArtifact: measurementPath.replace(`${process.cwd()}/`, ""),
        measurementStatus: report.status,
        releaseEligible: report.releaseEligible,
        remainingBoundary: "real Figma Desktop render/export and fidelity comparison",
      },
      null,
      2,
    ),
  );
} finally {
  await chrome.cleanup().catch(() => undefined);
}
