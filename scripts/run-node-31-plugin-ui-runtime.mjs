import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { packageWtf } from "../packages/wtf-packager/dist/index.js";
import { WTF_DEFAULT_ENTRYPOINTS } from "../packages/w2f-schema/dist/index.js";

const uiPath = resolve("apps/figma-plugin/dist/ui.html");
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const HASH = "a".repeat(64);
const SVG_PATH = "assets/safe.svg";
const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

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

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error)
          pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      if (typeof message.method !== "string") return;
      const waiters = this.eventWaiters.get(message.method);
      if (!waiters || waiters.length === 0) return;
      this.eventWaiters.delete(message.method);
      for (const waiter of waiters) waiter.resolve(message.params ?? {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("CDP socket closed before response"));
      }
      this.pending.clear();
      for (const waiters of this.eventWaiters.values()) {
        for (const waiter of waiters) waiter.reject(new Error("CDP socket closed before event"));
      }
      this.eventWaiters.clear();
    });
  }

  static async connect(url) {
    assert(typeof WebSocket === "function", "Node.js WebSocket client is unavailable");
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener(
        "error",
        () => rejectPromise(new Error("Unable to open CDP WebSocket")),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = 5000) {
    return new Promise((resolvePromise, rejectPromise) => {
      const waiter = { resolve: resolvePromise, reject: rejectPromise };
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push(waiter);
      this.eventWaiters.set(method, waiters);
      const timeout = setTimeout(() => {
        const current = this.eventWaiters.get(method) ?? [];
        const remaining = current.filter((candidate) => candidate !== waiter);
        if (remaining.length > 0) this.eventWaiters.set(method, remaining);
        else this.eventWaiters.delete(method);
        rejectPromise(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      waiter.resolve = (value) => {
        clearTimeout(timeout);
        resolvePromise(value);
      };
      waiter.reject = (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      };
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForDevToolsPort(profileDir, chromeProcess, stderr) {
  const activePortPath = join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(
        `Chrome exited before CDP was ready (${chromeProcess.exitCode}).\n${stderr()}`,
      );
    }
    try {
      const [portLine] = (await readFile(activePortPath, "utf8")).trim().split("\n");
      const port = Number.parseInt(portLine, 10);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // DevToolsActivePort is created asynchronously by Chrome.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for Chrome DevToolsActivePort.\n${stderr()}`);
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

function bundle(svgBytes) {
  return {
    document: {
      irVersion: "2.0.0",
      documentId: "doc_choose_runtime",
      captureId: "cap_choose_runtime",
      revisionId: "rev_choose_runtime",
      sourceFingerprint: HASH,
      sourceGraphRootId: "source_root",
      renderTreeRootId: "render_root",
      environmentRefs: ["env_runtime"],
      environments: [
        {
          id: "env_runtime",
          browserName: "Chromium",
          browserVersion: "151.0.0",
          platform: "node31-runtime",
          language: "en-US",
          direction: "ltr",
          colorScheme: "light",
          reducedMotion: false,
          viewportWidth: 1440,
          viewportHeight: 900,
          dpr: 1,
          pageZoom: 1,
        },
      ],
      animationCaptureMode: "freeze-current",
      visualState: "current",
    },
    sourceGraph: {
      rootCaptureNodeId: "source_root",
      nodes: [
        {
          captureNodeId: "source_root",
          stableIdentity: { id: "sid_root", confidence: 1, evidence: ["node31-runtime"] },
          kind: "document",
          relationships: {},
          childCaptureNodeIds: [],
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
          assetRefs: ["asset_svg"],
        },
      ],
      scrollContainers: [],
      revision: {
        documentId: "doc_choose_runtime",
        captureId: "cap_choose_runtime",
        revisionId: "rev_choose_runtime",
        sourceFingerprint: HASH,
        capturedAt: "2026-08-27T00:00:00.000Z",
      },
    },
    renderTree: {
      rootId: "render_root",
      nodes: [
        {
          id: "render_root",
          childIds: [],
          sourceNodeIds: ["source_root"],
          sourceStableIds: ["sid_root"],
          kind: "document",
          name: "NODE-31 Choose Runtime",
          geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
          layout: {
            mode: "flow",
            display: "block",
            position: "static",
            sizing: {
              width: { mode: "fixed", confidence: 1, reasons: ["node31-runtime"] },
              height: { mode: "fixed", confidence: 1, reasons: ["node31-runtime"] },
            },
            decision: { confidence: 1, reasons: ["node31-runtime"] },
          },
          paint: { fills: [], opacity: 1 },
          assetRefs: ["asset_svg"],
          renderStrategy: "native",
          renderDecision: { confidence: 1, reasons: ["node31-runtime"] },
        },
      ],
      sections: [
        {
          id: "section_root",
          renderNodeId: "render_root",
          name: "Runtime Section",
          childSectionIds: [],
        },
      ],
    },
    styles: { styles: [] },
    assets: {
      assets: [
        {
          id: "asset_svg",
          kind: "svg",
          mediaType: "image/svg+xml",
          embeddedPath: SVG_PATH,
          byteLength: svgBytes,
        },
      ],
      referenceTiles: [],
    },
    responsive: { snapshots: [], rules: [], mediaRules: [], containerQueries: [] },
    states: { states: [] },
    diagnostics: { diagnostics: [] },
    tokens: { tokens: [], usages: [] },
  };
}

function jsonPayload(path, role, json) {
  return { path, role, json };
}

async function buildFixture() {
  const svgData = new TextEncoder().encode(safeSvg);
  const ir = bundle(svgData.byteLength);
  const payloads = [
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.document, "document", ir.document),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceGraph, "source-graph", ir.sourceGraph),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.renderTree, "render-tree", ir.renderTree),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.styles, "styles", ir.styles),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.assets, "assets-index", ir.assets),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.responsive, "responsive", ir.responsive),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.states, "states", ir.states),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.diagnostics, "diagnostics", ir.diagnostics),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.tokens, "token-graph", ir.tokens),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceCascade, "source-cascade", {
      version: "node31-runtime",
    }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceMetadata, "source-metadata", {
      url: "https://example.test/node31-choose-runtime",
      title: "NODE-31 Choose Runtime",
    }),
    { path: SVG_PATH, role: "asset", mediaType: "image/svg+xml", bytes: svgData },
  ];
  return packageWtf({
    filenameBase: "NODE-31 Choose Runtime",
    identity: {
      documentId: "doc_choose_runtime",
      captureId: "cap_choose_runtime",
      sourceFingerprint: HASH,
      capturedAt: "2026-08-27T00:00:00.000Z",
      revisionId: "rev_choose_runtime",
    },
    captureTarget: { type: "document" },
    compatibility: {
      writerVersion: "1.0.0",
      minReaderVersion: "1.0.0",
      capabilities: ["source-tree", "render-tree"],
    },
    features: {
      required: ["source-graph", "render-tree", "precise-geometry"],
      optional: ["stable-identity"],
    },
    payloads,
  });
}

const tempRoot = await mkdtemp(join(tmpdir(), "w2f-node31-plugin-ui-"));
const profileDir = join(tempRoot, "chrome-profile");
const fixturePath = join(tempRoot, "NODE-31 Choose Runtime.wtf");
const chromePath = await findChrome();
let chromeProcess;
let client;
let chromeStderr = "";

try {
  await access(uiPath);
  await mkdir(profileDir, { recursive: true });
  const packaged = await buildFixture();
  await writeFile(fixturePath, packaged.bytes);

  chromeProcess = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  chromeProcess.stderr.setEncoding("utf8");
  chromeProcess.stderr.on("data", (chunk) => {
    chromeStderr = `${chromeStderr}${chunk}`.slice(-20000);
  });

  const port = await waitForDevToolsPort(profileDir, chromeProcess, () => chromeStderr);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => {
    if (!response.ok) throw new Error(`Unable to query Chrome targets: HTTP ${response.status}`);
    return response.json();
  });
  const pageTarget = targets.find(
    (target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string",
  );
  assert(pageTarget, "Chrome did not expose a page target");

  client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("DOM.enable");
  const browserVersion = await client.send("Browser.getVersion");

  await client.send("Page.navigate", { url: pathToFileURL(uiPath).href });
  await waitFor(
    client,
    `document.readyState === "complete" && Boolean(document.getElementById("choose-file"))`,
    "Figma plugin UI did not load",
  );
  await evaluate(
    client,
    `(() => {
      globalThis.__node31PluginMessages = [];
      window.addEventListener("message", (event) => {
        const payload = event.data?.pluginMessage?.payload;
        if (payload && typeof payload.type === "string") {
          globalThis.__node31PluginMessages.push(payload);
        }
      });
    })()`,
  );

  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  const chooserOpened = client.waitForEvent("Page.fileChooserOpened");
  await evaluate(client, `document.getElementById("choose-file").click()`);
  const chooser = await chooserOpened;
  assert(chooser.mode === "selectSingle", `choose button opened unexpected file mode ${chooser.mode}`);

  const documentNode = await client.send("DOM.getDocument", { depth: 2, pierce: true });
  const fileInputNode = await client.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: "#wtf-file",
  });
  assert(fileInputNode.nodeId > 0, "hidden .wtf file input was not found");
  await client.send("DOM.setFileInputFiles", {
    files: [fixturePath],
    nodeId: fileInputNode.nodeId,
  });

  await waitFor(
    client,
    `document.getElementById("progress-bar")?.dataset.stage === "preview-ready" && !document.getElementById("import-button")?.disabled`,
    "choose-file path did not reach secure preview-ready state",
  );

  const previewState = await evaluate(
    client,
    `(() => ({
      fileName: document.getElementById("file-name")?.textContent ?? "",
      fileMeta: document.getElementById("file-meta")?.textContent ?? "",
      progressLabel: document.getElementById("progress-label")?.textContent ?? "",
      progressDetail: document.getElementById("progress-detail")?.textContent ?? "",
      stage: document.getElementById("progress-bar")?.dataset.stage ?? "",
      importDisabled: document.getElementById("import-button")?.disabled ?? true,
      intake: globalThis.__node31PluginMessages.find((item) => item.type === "W2F_INTAKE_METADATA") ?? null,
      errors: globalThis.__node31PluginMessages.filter((item) => item.type === "W2F_ERROR").length
    }))()`,
  );
  assert(previewState.fileName === packaged.filename, "selected filename was not rendered in UI");
  assert(previewState.fileMeta.includes("choose"), "selected file metadata did not preserve choose source");
  assert(previewState.progressLabel === "Secure validation complete", "secure parser did not complete");
  assert(previewState.progressDetail.includes("1 render nodes"), "preview render-node count mismatch");
  assert(previewState.progressDetail.includes("1 sections"), "preview section count mismatch");
  assert(previewState.stage === "preview-ready", "UI progress stage did not reach preview-ready");
  assert(previewState.importDisabled === false, "import button was not enabled after secure parse");
  assert(previewState.errors === 0, "choose-file flow emitted an unexpected W2F_ERROR");
  assert(previewState.intake?.descriptor?.source === "choose", "intake metadata source was not choose");
  assert(
    previewState.intake?.descriptor?.fileName === packaged.filename,
    "intake metadata filename mismatch",
  );
  assert(
    previewState.intake?.descriptor?.byteLength === packaged.bytes.byteLength,
    "intake metadata byte length mismatch",
  );

  await evaluate(client, `document.getElementById("import-button").click()`);
  await waitFor(
    client,
    `globalThis.__node31PluginMessages.some((item) => item.type === "W2F_RENDER_BASIC_REQUEST")`,
    "secure parsed choose-file flow did not hand off a render request",
  );
  const renderHandoff = await evaluate(
    client,
    `(() => {
      const payload = globalThis.__node31PluginMessages.find((item) => item.type === "W2F_RENDER_BASIC_REQUEST");
      return payload ? {
        type: payload.type,
        mode: payload.request?.mode,
        importName: payload.request?.importName,
        renderRootId: payload.request?.renderTree?.rootId,
        sourceRootId: payload.request?.sourceGraph?.rootCaptureNodeId
      } : null;
    })()`,
  );
  assert(renderHandoff?.mode === "whole-page", "choose-file render request mode mismatch");
  assert(renderHandoff?.importName === "NODE-31 Choose Runtime", "choose-file import name mismatch");
  assert(renderHandoff?.renderRootId === "render_root", "render-tree handoff root mismatch");
  assert(renderHandoff?.sourceRootId === "source_root", "source-graph handoff root mismatch");

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        evidenceType: "node31-plugin-ui-choose-file-runtime",
        status: "PASS",
        environment: { chrome: browserVersion.product },
        loadedBuiltArtifact: "apps/figma-plugin/dist/ui.html",
        fixtureProducer: "packages/wtf-packager/dist/index.js",
        fixtureArchiveSha256: packaged.sha256,
        assertions: [
          "choose-button-opens-native-single-file-chooser",
          "native-file-input-receives-real-wtf-file",
          "intake-metadata-preserves-choose-source",
          "secure-parser-reaches-preview-ready",
          "secure-parser-preview-exposes-render-and-section-counts",
          "import-enabled-only-after-secure-parse",
          "choose-flow-emits-no-runtime-error",
          "parsed-render-tree-handoff-preserved",
          "parsed-source-graph-handoff-preserved",
          "render-request-emitted-after-user-import-action",
        ],
        provesP0Items: ["choose-file-path"],
        notProvenByThisArtifact: [
          "drop-on-canvas-path",
          "file-protocol-explicit-permission",
          "visual-state-freeze-and-restore",
          "geometry-preserving-correction-policy",
          "raster-text-only-when-policy-justifies",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (client) client.close();
  await stopChrome(chromeProcess);
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
