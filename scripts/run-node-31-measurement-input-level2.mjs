import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { evaluateNode31MeasurementArtifact } from "../packages/figma-renderer/dist/index.js";
import { parseWtfPackage } from "../packages/wtf-parser/dist/index.js";

const sourceArtifact = "qa/corpus/node31/class-a/level2-responsive.html";
const sourcePath = resolve(sourceArtifact);
const fixtureUrl = pathToFileURL(sourcePath).href;
const extensionRoot = resolve("apps/browser-extension/dist-high-fidelity");
const outputDir = resolve(
  process.env.W2F_NODE31_LEVEL2_OUTPUT_DIR ?? "artifacts/node31-measurement-input-level2",
);
const expectedWidths = [1440, 768, 390];
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
  const explicitBranchHead = process.env.W2F_NODE31_BRANCH_HEAD;
  if (explicitBranchHead && /^[a-f0-9]{40}$/.test(explicitBranchHead)) return explicitBranchHead;
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
  const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-measurement-level2-"));
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
  assert(
    info?.fileAccess?.isActive === true,
    "Fresh High Fidelity extension lacks active file access",
  );

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
  assert(created.targetId, "Unable to create Class A Level-2 file target");
  let targetInfo = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const result = await browser.send("Target.getTargetInfo", { targetId: created.targetId });
    targetInfo = result.targetInfo ?? null;
    if (targetInfo?.url === fixtureUrl) break;
    await delay(25);
  }
  assert(targetInfo?.url === fixtureUrl, `Level-2 file target URL mismatch: ${targetInfo?.url}`);
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
  throw new Error(
    `Class A Level-2 file tab did not become production-injectable: ${JSON.stringify(last)}`,
  );
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
  assert(debuggerState, "Production chrome.debugger target for Level-2 file tab was not found");
  assert(
    debuggerState.attached === false,
    "Harness unexpectedly attached Level-2 file target before capture",
  );

  const production = await evaluate(
    options.client,
    `(async () => {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: ${JSON.stringify(fixtureTab.id)} },
        func: async () => {
          const capability = await chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" });
          const job = await chrome.runtime.sendMessage({
            type: "W2F_START_RESPONSIVE_JOB",
            capture: { mode: "common" }
          });
          if (!job?.ok || job?.data?.status !== "completed") {
            return { capability, job, exported: null };
          }
          const exported = await chrome.runtime.sendMessage({
            type: "W2F_EXPORT_WTF",
            jobId: job.data.jobId
          });
          return { capability, job, exported };
        }
      });
      return injection?.result ?? null;
    })()`,
    180000,
  );

  assert(production?.capability?.ok === true, "Production source capability request failed");
  assert(
    production?.capability?.data?.provider === "file-tab",
    "Level-2 capability provider is not file-tab",
  );
  assert(production?.capability?.data?.supported === true, "Level-2 file source is unsupported");
  assert(production?.capability?.data?.available === true, "Level-2 file source is unavailable");
  assert(production?.capability?.data?.code === "ready", "Level-2 file source is not ready");

  assert(
    production?.job?.ok === true,
    `Responsive production job failed: ${production?.job?.error ?? "unknown"}`,
  );
  const job = production.job.data;
  assert(job?.status === "completed", `Responsive production job status is ${job?.status}`);
  assert(job?.mode === "responsive", `Responsive production job mode is ${job?.mode}`);
  assert(
    job?.phase === "responsive-capture-complete",
    `Unexpected responsive phase: ${job?.phase}`,
  );
  assert(
    job?.source?.provider === "file-tab",
    "Level-2 job did not use the file-tab source provider",
  );
  assert(job?.source?.sourceType === "file", "Level-2 job lost file source type");
  assert(job?.source?.sourceUrl === fixtureUrl, "Level-2 job lost exact file URL");
  assert(job?.source?.offline === true, "Level-2 job lost offline file semantics");
  assert(job?.page?.url === fixtureUrl, "Level-2 job page URL mismatch");
  assert(
    job?.responsive?.mode === "common",
    "Level-2 job did not use the product common responsive plan",
  );
  assert(
    job?.responsive?.plannedViewportCount === 3,
    "Level-2 did not plan exactly three viewports",
  );
  assert(
    job?.responsive?.capturedSnapshotCount === 3,
    "Level-2 did not capture exactly three viewports",
  );
  assert(
    job?.responsive?.diagnosticCount === 0,
    "Level-2 responsive capture emitted capture diagnostics",
  );
  assert(
    JSON.stringify(job.responsive.viewportWidths) === JSON.stringify(expectedWidths),
    `Level-2 responsive widths mismatch: ${JSON.stringify(job.responsive.viewportWidths)}`,
  );
  assert(
    Array.isArray(job.responsivePlan) && job.responsivePlan.length === 3,
    "Level-2 responsive plan is missing",
  );
  assert(
    job.responsivePlan.every((plan) => plan.source === "synthetic"),
    "Level-2 common plan must use production High Fidelity synthetic viewport overrides",
  );

  assert(
    production?.exported?.ok === true,
    `Production responsive WTF export failed: ${production?.exported?.error ?? "unknown"}`,
  );
  const exportReceipt = production.exported.data;
  assert(exportReceipt?.archiveSha256, "Responsive WTF export did not return archive SHA-256");

  const responsiveCapture = await readIndexedDb(
    options.client,
    "w2f-responsive-capture",
    1,
    "captures",
    `responsive:${job.jobId}`,
    `(value) => value`,
  );
  assert(
    responsiveCapture?.version === "1.0.0",
    "Persisted ResponsiveCapture is missing or invalid",
  );
  assert(responsiveCapture?.mode === "common", "Persisted ResponsiveCapture mode mismatch");
  assert(
    responsiveCapture?.snapshots?.length === 3,
    "Persisted ResponsiveCapture snapshot count mismatch",
  );
  assert(
    responsiveCapture?.diagnostics?.length === 0,
    "Persisted ResponsiveCapture has diagnostics",
  );

  const snapshots = [];
  for (const snapshot of responsiveCapture.snapshots) {
    const rawSnapshot = await readIndexedDb(
      options.client,
      "w2f-capture-snapshots",
      2,
      "rawSnapshots",
      `raw-snapshot:${snapshot.artifactId}`,
      `(value) => value`,
    );
    assert(rawSnapshot?.adapter === "cdp", `Viewport ${snapshot.plan?.id} did not use CDP capture`);
    assert(rawSnapshot?.url === fixtureUrl, `Viewport ${snapshot.plan?.id} source URL mismatch`);
    assert(
      Math.abs(rawSnapshot?.environment?.viewportWidth - snapshot.plan.width) <= 1,
      `Viewport ${snapshot.plan?.id} width mismatch`,
    );
    assert(
      Math.abs(rawSnapshot?.environment?.viewportHeight - snapshot.plan.height) <= 1,
      `Viewport ${snapshot.plan?.id} height mismatch`,
    );
    assert(
      rawSnapshot?.nodes?.some(
        (node) => node.source?.attributes?.["data-node31-class-a"] === "level2-responsive",
      ),
      `Viewport ${snapshot.plan?.id} is missing the Level-2 proof node`,
    );
    assert(
      rawSnapshot?.nodes?.some((node) =>
        node.textContent?.includes("One source, three predictable layout states."),
      ),
      `Viewport ${snapshot.plan?.id} is missing deterministic editable text`,
    );
    snapshots.push({ plan: snapshot.plan, artifactId: snapshot.artifactId, rawSnapshot });
  }

  const capturedWidths = snapshots.map((item) => item.plan.width).sort((a, b) => b - a);
  assert(
    JSON.stringify(capturedWidths) === JSON.stringify(expectedWidths),
    `Persisted responsive snapshot widths mismatch: ${JSON.stringify(capturedWidths)}`,
  );

  const storedPackage = await readIndexedDb(
    options.client,
    "w2f-wtf-packages",
    1,
    "packages",
    `wtf-package:${job.jobId}`,
    `(value) => ({
      jobId: value.jobId,
      filename: value.filename,
      mimeType: value.mimeType,
      sha256: value.sha256,
      summary: value.summary,
      bytes: Array.from(value.bytes ?? [])
    })`,
  );
  assert(storedPackage?.bytes?.length > 0, "Persisted responsive WTF package bytes are missing");
  const wtfBytes = Uint8Array.from(storedPackage.bytes);
  const computedWtfSha = sha256(wtfBytes);
  assert(
    computedWtfSha === exportReceipt.archiveSha256,
    "Responsive export receipt SHA-256 disagrees with WTF bytes",
  );
  assert(
    computedWtfSha === storedPackage.sha256,
    "Stored responsive WTF SHA-256 disagrees with WTF bytes",
  );

  const parsed = await parseWtfPackage(wtfBytes);
  const parsedResponsiveWidths = parsed.ir.responsive.snapshots
    .map((snapshot) => snapshot.viewport.width)
    .sort((a, b) => b - a);
  assert(
    JSON.stringify(parsedResponsiveWidths) === JSON.stringify(expectedWidths),
    `Parsed WTF responsive widths mismatch: ${JSON.stringify(parsedResponsiveWidths)}`,
  );
  assert(
    parsed.manifest.compatibility.capabilities.includes("responsive-snapshots"),
    "Responsive WTF package omitted responsive-snapshots capability",
  );
  assert(
    parsed.ir.responsive.snapshots.length === 3,
    "Parsed WTF responsive snapshot count mismatch",
  );
  assert(parsed.ir.sourceGraph.nodes.length > 0, "Parsed responsive WTF source graph is empty");
  assert(parsed.ir.renderTree.nodes.length > 0, "Parsed responsive WTF render tree is empty");

  await mkdir(outputDir, { recursive: true });
  const base = "deterministic-level2-responsive";
  const responsivePath = join(outputDir, `${base}.responsive-capture.json`);
  const snapshotsPath = join(outputDir, `${base}.responsive-snapshots.json`);
  const wtfPath = join(outputDir, `${base}.wtf`);
  const parsedPath = join(outputDir, `${base}.parsed-summary.json`);
  const measurementPath = join(outputDir, `${base}.measurement.json`);

  const responsiveBytes = Buffer.from(JSON.stringify(responsiveCapture, null, 2));
  const snapshotsBytes = Buffer.from(JSON.stringify(snapshots, null, 2));
  const parsedSummary = {
    manifest: parsed.manifest,
    migration: parsed.migration,
    preview: parsed.preview,
    sourceNodeCount: parsed.ir.sourceGraph.nodes.length,
    renderNodeCount: parsed.ir.renderTree.nodes.length,
    assetCount: parsed.ir.assets.assets.length,
    responsiveSnapshotCount: parsed.ir.responsive.snapshots.length,
    responsiveRuleCount: parsed.ir.responsive.rules.length,
    responsiveMediaRuleCount: parsed.ir.responsive.mediaRules.length,
    responsiveContainerQueryCount: parsed.ir.responsive.containerQueries.length,
    responsiveViewportWidths: parsedResponsiveWidths,
  };
  const parsedBytes = Buffer.from(JSON.stringify(parsedSummary, null, 2));
  await writeFile(responsivePath, responsiveBytes);
  await writeFile(snapshotsPath, snapshotsBytes);
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
      category: "deterministic-responsive",
      supportClass: "native-supported",
      standardHtmlCss: true,
      level: 2,
      sourceArtifact,
      sourceSha256,
    },
    provenance: {
      branchHead: checkoutRevision(),
      generatedAt: new Date().toISOString(),
      environmentFingerprint: `${process.platform}-${process.arch}-node-${process.versions.node}-${chrome.version.product}-high-fidelity-file-responsive-common`,
      ciRunId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : undefined,
    },
    pipeline: {
      browserCapture: {
        status: "PASS",
        artifact: responsivePath.replace(`${process.cwd()}/`, ""),
        sha256: sha256(responsiveBytes),
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
        host: { kind: "figma-host-simulator", version: "not-executed" },
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
      `Production High Fidelity responsive capture ran the product Common Viewports plan at 1440, 768 and 390 CSS pixels against the deterministic file:// Class A fixture; per-viewport evidence is stored in ${snapshotsPath.replace(`${process.cwd()}/`, "")}.`,
      "Each viewport was captured by the production CDP adapter through withHighFidelityViewportOverride; the harness did not emulate viewport state itself or attach the fixture debugger target before production capture.",
      "Production WTF export persisted the responsive snapshot references and responsive inference payload, and parseWtfPackage accepted the archive through secure ZIP, checksum, schema, media-policy and W2F IR validation.",
      "This partial Level-2 artifact intentionally remains UNAVAILABLE until real Figma Desktop render/export evidence exists; responsive fidelity is not inferred from browser-side capture alone.",
    ],
  };

  const report = evaluateNode31MeasurementArtifact(measurementArtifact);
  assert(
    report.status === "UNAVAILABLE",
    `Partial Level-2 measurement must remain UNAVAILABLE, got ${report.status}`,
  );
  assert(
    report.releaseEligible === false,
    "Partial Level-2 measurement must not be release eligible",
  );
  const measurementBytes = Buffer.from(JSON.stringify(measurementArtifact, null, 2));
  await writeFile(measurementPath, measurementBytes);

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        status: "PASS",
        sampleId: base,
        sourceArtifact,
        sourceSha256,
        branchHead: measurementArtifact.provenance.branchHead,
        chrome: chrome.version.product,
        sourceProtocol: job.source.sourceType,
        explicitFileAccess: options.fileAccess,
        preCaptureDebuggerAttached: debuggerState.attached,
        responsiveMode: job.responsive.mode,
        viewportWidths: job.responsive.viewportWidths,
        plannedViewportCount: job.responsive.plannedViewportCount,
        capturedSnapshotCount: job.responsive.capturedSnapshotCount,
        stableNodeEvidenceCount: job.responsive.stableNodeEvidenceCount,
        responsiveRuleCount: job.responsive.responsiveRuleCount,
        breakpointCandidateCount: job.responsive.breakpointCandidateCount,
        responsiveSizingDecisionCount: job.responsive.responsiveSizingDecisionCount,
        wtfSha256: computedWtfSha,
        parsedResponsiveSnapshotCount: parsed.ir.responsive.snapshots.length,
        parsedSourceNodeCount: parsed.ir.sourceGraph.nodes.length,
        parsedRenderNodeCount: parsed.ir.renderTree.nodes.length,
        measurementStatus: report.status,
        releaseEligible: report.releaseEligible,
        outputDir,
      },
      null,
      2,
    ),
  );
} finally {
  await chrome.cleanup();
}
