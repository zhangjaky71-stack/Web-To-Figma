import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createContext, runInContext } from "node:vm";
import { packageWtf } from "../packages/wtf-packager/dist/index.js";
import { WTF_DEFAULT_ENTRYPOINTS } from "../packages/w2f-schema/dist/index.js";

const mainBundlePath = resolve("apps/figma-plugin/dist/code.js");
const uiPath = resolve("apps/figma-plugin/dist/ui.html");
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const HASH = "c".repeat(64);
const DROP_POINT = { x: 321.25, y: 654.75 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("CDP socket closed before response"));
      }
      this.pending.clear();
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

function jsonPayload(path, role, json) {
  return { path, role, json };
}

async function buildFixture() {
  const document = {
    irVersion: "2.0.0",
    documentId: "doc_canvas_drop_runtime",
    captureId: "cap_canvas_drop_runtime",
    revisionId: "rev_canvas_drop_runtime",
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
  };
  const sourceGraph = {
    rootCaptureNodeId: "source_root",
    nodes: [
      {
        captureNodeId: "source_root",
        stableIdentity: {
          id: "sid_root",
          confidence: 1,
          evidence: ["node31-canvas-drop-runtime"],
        },
        kind: "document",
        relationships: {},
        childCaptureNodeIds: [],
        geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        assetRefs: [],
      },
    ],
    scrollContainers: [],
    revision: {
      documentId: "doc_canvas_drop_runtime",
      captureId: "cap_canvas_drop_runtime",
      revisionId: "rev_canvas_drop_runtime",
      sourceFingerprint: HASH,
      capturedAt: "2026-08-27T00:00:00.000Z",
    },
  };
  const renderTree = {
    rootId: "render_root",
    nodes: [
      {
        id: "render_root",
        childIds: [],
        sourceNodeIds: ["source_root"],
        sourceStableIds: ["sid_root"],
        kind: "document",
        name: "NODE-31 Canvas Drop Runtime",
        geometry: { bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        layout: {
          mode: "flow",
          display: "block",
          position: "static",
          sizing: {
            width: {
              mode: "fixed",
              confidence: 1,
              reasons: ["node31-canvas-drop-runtime"],
            },
            height: {
              mode: "fixed",
              confidence: 1,
              reasons: ["node31-canvas-drop-runtime"],
            },
          },
          decision: { confidence: 1, reasons: ["node31-canvas-drop-runtime"] },
        },
        paint: { fills: [], opacity: 1 },
        assetRefs: [],
        renderStrategy: "native",
        renderDecision: { confidence: 1, reasons: ["node31-canvas-drop-runtime"] },
      },
    ],
    sections: [
      {
        id: "section_root",
        renderNodeId: "render_root",
        name: "Canvas Drop Runtime Section",
        childSectionIds: [],
      },
    ],
  };
  const payloads = [
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.document, "document", document),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceGraph, "source-graph", sourceGraph),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.renderTree, "render-tree", renderTree),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.styles, "styles", { styles: [] }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.assets, "assets-index", {
      assets: [],
      referenceTiles: [],
    }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.responsive, "responsive", {
      snapshots: [],
      rules: [],
      mediaRules: [],
      containerQueries: [],
    }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.states, "states", { states: [] }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.diagnostics, "diagnostics", { diagnostics: [] }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.tokens, "token-graph", { tokens: [], usages: [] }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceCascade, "source-cascade", {
      version: "node31-canvas-drop-runtime",
    }),
    jsonPayload(WTF_DEFAULT_ENTRYPOINTS.sourceMetadata, "source-metadata", {
      url: "https://example.test/node31-canvas-drop-runtime",
      title: "NODE-31 Canvas Drop Runtime",
    }),
  ];
  return packageWtf({
    filenameBase: "NODE-31 Canvas Drop Runtime",
    identity: {
      documentId: document.documentId,
      captureId: document.captureId,
      sourceFingerprint: HASH,
      capturedAt: "2026-08-27T00:00:00.000Z",
      revisionId: document.revisionId,
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

function serializableMainMessage(message) {
  if (message?.payload?.type !== "W2F_FILE_BYTES") return message;
  return {
    ...message,
    payload: {
      ...message.payload,
      bytes: Array.from(message.payload.bytes ?? []),
    },
  };
}

const tempRoot = await mkdtemp(join(tmpdir(), "w2f-node31-plugin-canvas-drop-"));
const profileDir = join(tempRoot, "chrome-profile");
const chromePath = await findChrome();
let chromeProcess;
let client;
let chromeStderr = "";

try {
  await access(mainBundlePath);
  await access(uiPath);
  await mkdir(profileDir, { recursive: true });
  const [mainCode, uiBytes, packaged] = await Promise.all([
    readFile(mainBundlePath, "utf8"),
    readFile(uiPath),
    buildFixture(),
  ]);

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
  const browserVersion = await client.send("Browser.getVersion");
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      globalThis.__node31UiOutbound = [];
      window.addEventListener("message", (event) => {
        if (event.data?.__node31FromMain === true) return;
        const message = event.data?.pluginMessage;
        const type = message?.payload?.type;
        if (typeof type !== "string") return;
        if (["W2F_UI_READY", "W2F_INTAKE_METADATA", "W2F_IMPORT_SELECTION", "W2F_CANCEL_IMPORT", "W2F_CLOSE_PLUGIN"].includes(type)) {
          globalThis.__node31UiOutbound.push({ type, message });
          return;
        }
        if (type === "W2F_RENDER_BASIC_REQUEST") {
          const request = message.payload.request;
          globalThis.__node31UiOutbound.push({
            type,
            summary: {
              intakeId: request?.intakeId,
              profile: request?.profile,
              mode: request?.mode,
              tokenPolicy: request?.tokenPolicy,
              destination: request?.destination,
              importName: request?.importName,
              renderNodeCount: request?.renderTree?.nodes?.length,
              sourceNodeCount: request?.sourceGraph?.nodes?.length,
              selectedRootCount: request?.selectedRootIds?.length,
            },
          });
        }
      });
    })();`,
  });
  await client.send("Page.navigate", { url: pathToFileURL(uiPath).href });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (
      await evaluate(
        client,
        `document.readyState === "complete" && Boolean(document.getElementById("import-button"))`,
      )
    )
      break;
    if (attempt === 199) throw new Error("Figma plugin UI did not load");
    await delay(25);
  }

  const mainToUiPromises = [];
  const bridgeErrors = [];
  const mainMessages = [];
  const uiMessages = [];
  let dropHandler = null;
  let showUiCall = null;
  let closePluginCalled = false;

  async function deliverMainToUi(message) {
    const serialized = JSON.stringify(serializableMainMessage(message));
    await evaluate(
      client,
      `((message) => {
        if (message?.payload?.type === "W2F_FILE_BYTES") {
          message.payload.bytes = new Uint8Array(message.payload.bytes);
        }
        window.postMessage({ __node31FromMain: true, pluginMessage: message }, "*");
      })(${serialized})`,
    );
  }

  const figma = {
    ui: {
      onmessage: null,
      postMessage(message) {
        mainMessages.push(message?.payload?.type ?? "UNKNOWN");
        const promise = deliverMainToUi(message).catch((error) => {
          bridgeErrors.push(error);
        });
        mainToUiPromises.push(promise);
      },
    },
    showUI(html, options) {
      showUiCall = { htmlType: typeof html, options };
    },
    on(eventName, handler) {
      if (eventName === "drop") dropHandler = handler;
    },
    closePlugin() {
      closePluginCalled = true;
    },
  };

  const context = createContext({
    __html__: "<html></html>",
    figma,
    console,
    setTimeout,
    clearTimeout,
    Uint8Array,
    TextEncoder,
    TextDecoder,
  });
  runInContext(mainCode, context, { filename: mainBundlePath });
  assert(
    showUiCall?.options?.title === "W2F Import",
    "Built main bundle did not initialize plugin UI",
  );
  assert(typeof dropHandler === "function", "Built main bundle did not register figma.on('drop')");

  async function flushMainToUi() {
    while (mainToUiPromises.length > 0) {
      const batch = mainToUiPromises.splice(0);
      await Promise.all(batch);
    }
    if (bridgeErrors.length > 0) throw bridgeErrors[0];
  }

  let renderSummary = null;
  let intakeDescriptor = null;
  async function drainUiOutbound() {
    const entries = (await evaluate(client, `globalThis.__node31UiOutbound.splice(0)`)) ?? [];
    for (const entry of entries) {
      uiMessages.push(entry.type);
      if (entry.type === "W2F_RENDER_BASIC_REQUEST") {
        renderSummary = entry.summary ?? null;
        continue;
      }
      if (entry.type === "W2F_INTAKE_METADATA") {
        intakeDescriptor = entry.message?.payload?.descriptor ?? null;
      }
      if (entry.message && typeof figma.ui.onmessage === "function") {
        figma.ui.onmessage(entry.message);
      }
    }
  }

  await drainUiOutbound();
  await flushMainToUi();

  let ignoredReadCount = 0;
  const ignored = dropHandler({
    files: [
      {
        name: "not-a-wtf.txt",
        type: "text/plain",
        async getBytesAsync() {
          ignoredReadCount += 1;
          return new Uint8Array([1, 2, 3]);
        },
      },
    ],
    absoluteX: 10,
    absoluteY: 20,
  });
  assert(ignored === true, "Non-.wtf canvas drop must pass through to Figma");
  assert(ignoredReadCount === 0, "Non-.wtf canvas drop must not read file bytes");

  let dropReadCount = 0;
  const handled = dropHandler({
    files: [
      {
        name: "NODE-31 Canvas Drop Runtime.wtf",
        type: "application/x-wtf",
        async getBytesAsync() {
          dropReadCount += 1;
          return Uint8Array.from(packaged.bytes);
        },
      },
    ],
    absoluteX: DROP_POINT.x,
    absoluteY: DROP_POINT.y,
  });
  assert(handled === false, ".wtf canvas drop must be consumed by the plugin");

  let previewState = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await flushMainToUi();
    await drainUiOutbound();
    previewState = await evaluate(
      client,
      `(() => ({
        stage: document.getElementById("progress-bar")?.dataset.stage ?? "",
        importDisabled: Boolean(document.getElementById("import-button")?.disabled),
        fileName: document.getElementById("file-name")?.textContent ?? "",
        fileMeta: document.getElementById("file-meta")?.textContent ?? "",
        detail: document.getElementById("progress-detail")?.textContent ?? "",
      }))()`,
    );
    if (
      previewState?.stage === "preview-ready" &&
      previewState.importDisabled === false &&
      intakeDescriptor
    )
      break;
    if (previewState?.stage === "failed") {
      throw new Error(`Canvas-drop secure parser failed: ${previewState.detail}`);
    }
    if (attempt === 239) throw new Error("Canvas-drop secure parser did not reach preview-ready");
    await delay(25);
  }

  assert(dropReadCount === 1, "Canvas drop must read the DropFile exactly once");
  assert(intakeDescriptor?.source === "canvas-drop", "Canvas-drop intake source was not preserved");
  assert(
    intakeDescriptor?.canvasPoint?.x === DROP_POINT.x &&
      intakeDescriptor?.canvasPoint?.y === DROP_POINT.y,
    "Canvas-drop absolute point was not preserved in intake metadata",
  );
  assert(
    intakeDescriptor?.byteLength === packaged.bytes.byteLength,
    "Canvas-drop byte length changed between main and UI",
  );
  assert(
    previewState.fileName === "NODE-31 Canvas Drop Runtime.wtf",
    "Canvas-drop filename was not rendered in the final UI",
  );
  assert(
    previewState.fileMeta.includes("canvas-drop") &&
      previewState.fileMeta.includes("canvas 321, 655"),
    "Canvas-drop source/point were not exposed by the final UI",
  );
  assert(
    uiMessages.includes("W2F_INTAKE_METADATA"),
    "Canvas-drop flow did not return intake metadata to plugin main",
  );
  assert(
    mainMessages.includes("W2F_FILE_BYTES"),
    "Canvas-drop main path did not forward DropFile bytes to the final UI",
  );

  await evaluate(
    client,
    `(async () => {
      const button = document.getElementById("import-button");
      if (!(button instanceof HTMLElement) || button.disabled) return false;
      button.scrollIntoView({ block: "center", inline: "center" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    })()`,
  );
  const importButtonCenter = await evaluate(
    client,
    `(() => {
      const button = document.getElementById("import-button");
      if (!(button instanceof HTMLElement) || button.disabled) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  assert(
    importButtonCenter,
    "Canvas-drop import button has no clickable geometry after secure parse",
  );
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: importButtonCenter.x,
    y: importButtonCenter.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: importButtonCenter.x,
    y: importButtonCenter.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await drainUiOutbound();
    if (renderSummary) break;
    if (attempt === 119) throw new Error("Canvas-drop flow did not emit a render request");
    await delay(25);
  }

  assert(
    renderSummary?.intakeId === intakeDescriptor?.intakeId,
    "Canvas-drop render request lost intake identity",
  );
  assert(
    renderSummary?.destination?.x === DROP_POINT.x &&
      renderSummary?.destination?.y === DROP_POINT.y,
    "Canvas-drop render request lost the Figma canvas destination",
  );
  assert(renderSummary?.profile === "balanced", "Canvas-drop render profile changed unexpectedly");
  assert(renderSummary?.mode === "whole-page", "Canvas-drop render mode changed unexpectedly");
  assert(renderSummary?.tokenPolicy === "literal", "Canvas-drop token policy changed unexpectedly");
  assert(renderSummary?.renderNodeCount === 1, "Canvas-drop parsed render tree handoff changed");
  assert(renderSummary?.sourceNodeCount === 1, "Canvas-drop parsed source graph handoff changed");
  assert(
    renderSummary?.selectedRootCount === 0,
    "Whole-page canvas drop must not inject selected roots",
  );
  assert(
    renderSummary?.importName === "NODE-31 Canvas Drop Runtime",
    "Canvas-drop import name did not preserve parsed package title",
  );
  assert(closePluginCalled === false, "Canvas-drop flow unexpectedly closed the plugin");

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        evidenceType: "node31-plugin-canvas-drop-integration-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        mainBundleArtifact: "apps/figma-plugin/dist/code.js",
        uiBundleArtifact: "apps/figma-plugin/dist/ui.html",
        mainBundleSha256: sha256(new TextEncoder().encode(mainCode)),
        uiBundleSha256: sha256(uiBytes),
        fixtureArchiveSha256: sha256(packaged.bytes),
        hostBoundary: {
          figmaApi: "simulated",
          note: "The final built plugin main bundle executes unchanged against a narrow Figma host API simulator for showUI/ui.postMessage/figma.on(drop). The final built UI, secure parser, DOM, pointer import action and .wtf bytes run in real Chrome. This is not a claim of Figma Desktop execution.",
        },
        assertions: [
          "final-main-registers-figma-canvas-drop-handler",
          "non-wtf-canvas-drop-passes-through-without-byte-read",
          "wtf-canvas-drop-consumed-by-plugin",
          "canvas-drop-file-bytes-read-once",
          "canvas-drop-bytes-forwarded-main-to-final-ui",
          "canvas-drop-source-preserved",
          "canvas-drop-absolute-point-preserved-in-intake-metadata",
          "canvas-drop-byte-length-preserved",
          "canvas-drop-secure-parser-reaches-preview-ready",
          "canvas-drop-import-disabled-until-secure-parse-completes",
          "canvas-drop-source-and-rounded-point-visible-in-ui",
          "trusted-import-pointer-emits-render-request",
          "canvas-drop-intake-identity-preserved-to-render-request",
          "canvas-drop-destination-preserved-to-render-request",
          "canvas-drop-parsed-render-tree-handoff-preserved",
          "canvas-drop-parsed-source-graph-handoff-preserved",
        ],
        provesP0Items: ["drop-on-canvas-path"],
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  await stopChrome(chromeProcess);
  await rm(tempRoot, { recursive: true, force: true });
}
