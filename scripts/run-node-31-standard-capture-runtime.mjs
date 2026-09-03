import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const captureModulePath = "apps/browser-extension/dist/runtime/standard-capture-adapter/capture.js";
const shadowFixturePath = "qa/corpus/node31/class-b/shadow-dom.html";
const iframeFixturePath = "qa/corpus/node31/class-b/iframe.html";
const p0FixturePath = "qa/corpus/node31/p0/standard-capture-runtime.html";
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
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
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Unable to open CDP WebSocket")), {
        once: true,
      });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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

async function waitFor(client, expression, message) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => childProcess.once("exit", () => resolve(true))),
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

function contentType(path) {
  if (extname(path) === ".js") return "text/javascript; charset=utf-8";
  if (extname(path) === ".html") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Fixture server did not expose a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function startFixtureServer() {
  const routes = new Map([
    ["/runtime/standard-capture-adapter/capture.js", captureModulePath],
    ["/fixture/shadow-dom.html", shadowFixturePath],
    ["/fixture/iframe.html", iframeFixturePath],
    ["/fixture/standard-capture-p0.html", p0FixturePath],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = routes.get(requestUrl.pathname);
      if (!path) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        "content-type": contentType(path),
        "cache-control": "no-store",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(String(error));
    }
  });
  return { server, baseUrl: await listen(server) };
}

async function startCrossOriginServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/fixture/cross-origin-child.html") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      '<!doctype html><html><body><main data-node31-role="cross-origin-child">Cross-origin child must stay inaccessible to Standard capture.</main></body></html>',
    );
  });
  return { server, baseUrl: await listen(server) };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function navigate(client, url, readinessExpression, label) {
  await client.send("Page.navigate", { url });
  await waitFor(client, `document.readyState === "complete"`, `${label} did not finish loading`);
  await waitFor(client, readinessExpression, `${label} fixture readiness condition failed`);
}

async function captureSnapshot(client, moduleUrl, captureTarget = { type: "document" }) {
  return evaluate(
    client,
    `(async () => {
      const module = await import(${JSON.stringify(moduleUrl)});
      const result = module.captureStandardSnapshotInPage({ captureTarget: ${JSON.stringify(captureTarget)} });
      return result.snapshot;
    })()`,
  );
}

function findNode(snapshot, predicate, label) {
  const node = snapshot.nodes.find(predicate);
  assert(node, `Missing ${label}`);
  return node;
}

function findNodeByRole(snapshot, role, label) {
  return findNode(
    snapshot,
    (node) => node.source?.attributes?.["data-node31-role"] === role,
    label,
  );
}

function normalizeSnapshot(snapshot) {
  const normalized = structuredClone(snapshot);
  delete normalized.capturedAt;
  return JSON.stringify(normalized);
}

function assertShadowSnapshot(snapshot) {
  assert(snapshot?.adapter === "standard", "Shadow fixture did not use the Standard adapter");
  const host = findNode(
    snapshot,
    (node) => node.source?.tagName === "FIXTURE-CARD",
    "Shadow DOM host node",
  );
  const shadowRoot = findNode(
    snapshot,
    (node) =>
      node.kind === "shadow-root" && node.relationships?.shadowHostId === host.captureNodeId,
    "open ShadowRoot node",
  );
  assert(
    shadowRoot.relationships?.sourceParentId === host.captureNodeId &&
      shadowRoot.relationships?.composedParentId === host.captureNodeId,
    "ShadowRoot parent relationships do not point to the host",
  );
  const slot = findNode(
    snapshot,
    (node) => node.kind === "slot" && node.source?.attributes?.name === "meta",
    "named slot node",
  );
  const assigned = findNode(
    snapshot,
    (node) => node.source?.tagName === "SPAN" && node.source?.attributes?.slot === "meta",
    "assigned light-DOM node",
  );
  assert(
    assigned.relationships?.sourceParentId === host.captureNodeId,
    "Assigned light-DOM node lost its source parent",
  );
  assert(
    assigned.relationships?.composedParentId === slot.captureNodeId &&
      assigned.relationships?.assignedSlotId === slot.captureNodeId,
    "Assigned light-DOM node was not reparented to the slot in the composed tree",
  );
  assert(
    snapshot.nodes.some((node) => node.textContent?.includes("Open ShadowRoot")),
    "Shadow-root editable text was not captured",
  );
  assert(
    snapshot.nodes.some((node) => node.textContent?.includes("Assigned light DOM metadata")),
    "Slotted light-DOM text was not captured",
  );
}

function assertIframeSnapshot(snapshot) {
  assert(snapshot?.adapter === "standard", "Iframe fixture did not use the Standard adapter");
  const iframe = findNode(
    snapshot,
    (node) => node.kind === "iframe" && node.source?.tagName === "IFRAME",
    "iframe boundary node",
  );
  const childFrame = snapshot.frames.find(
    (frame) => frame.context?.parentFrameId === "frame-main" && frame.accessible === true,
  );
  assert(childFrame, "Same-origin iframe did not create an accessible child frame");
  assert(childFrame.rootCaptureNodeId, "Same-origin iframe child frame has no rootCaptureNodeId");
  const childRoot = findNode(
    snapshot,
    (node) => node.captureNodeId === childFrame.rootCaptureNodeId && node.kind === "document",
    "same-origin iframe document root",
  );
  assert(
    childRoot.relationships?.sourceParentId === iframe.captureNodeId &&
      childRoot.relationships?.composedParentId === iframe.captureNodeId,
    "Nested iframe document root is not linked to the iframe boundary",
  );
  assert(
    snapshot.nodes.some(
      (node) =>
        node.frameContext?.frameId === childFrame.context.frameId &&
        node.textContent?.includes("Embedded analytics"),
    ),
    "Same-origin iframe editable text was not captured in the child frame",
  );
  assert(
    !snapshot.diagnostics.some((item) => item.code === "STANDARD_CAPTURE_FRAME_INACCESSIBLE"),
    "Same-origin iframe incorrectly emitted the inaccessible-frame diagnostic",
  );
}

function assertDocumentAndCrossOriginSnapshot(snapshot, expectedState, crossOriginUrl) {
  assert(snapshot?.adapter === "standard", "P0 fixture did not use the Standard adapter");
  assert(
    snapshot.captureTarget?.type === "document",
    "P0 current-document capture target mismatch",
  );
  assert(snapshot.url.startsWith("http://127.0.0.1:"), "P0 fixture was not captured from HTTP");

  const documentScrollRoot = snapshot.scrollContainers.find(
    (item) =>
      item.isDocumentScrollRoot === true && item.sourceNodeId === snapshot.rootCaptureNodeId,
  );
  assert(documentScrollRoot, "Document scroll root record was not captured");
  assert(
    Math.abs(documentScrollRoot.scrollTop - expectedState.windowScrollY) <= 1,
    "Document scroll root did not preserve the live scroll position",
  );

  const appNode = findNodeByRole(snapshot, "primary-scroll-root", "primary app scroll-root node");
  const appScrollRoot = snapshot.scrollContainers.find(
    (item) => item.sourceNodeId === appNode.captureNodeId,
  );
  assert(appScrollRoot, "Primary app scroll-root record was not captured");
  assert(
    appScrollRoot.isPrimaryApplicationScrollRoot === true,
    "Largest visible application scroller was not identified as the primary app scroll root",
  );
  assert(
    Math.abs(appScrollRoot.scrollTop - expectedState.appScrollTop) <= 1,
    "Primary app scroll root did not preserve its live scrollTop",
  );

  const iframe = findNode(
    snapshot,
    (node) => node.kind === "iframe" && node.source?.attributes?.id === "cross-origin-frame",
    "cross-origin iframe boundary",
  );
  const inaccessibleFrame = snapshot.frames.find(
    (frame) => frame.context?.parentFrameId === "frame-main" && frame.accessible === false,
  );
  assert(inaccessibleFrame, "Cross-origin iframe did not produce an inaccessible frame record");
  assert(
    inaccessibleFrame.inaccessibleReason === "cross-origin-or-inaccessible",
    "Cross-origin frame inaccessible reason mismatch",
  );
  assert(
    inaccessibleFrame.context?.url === crossOriginUrl,
    "Cross-origin frame record did not preserve the iframe URL",
  );
  assert(
    !snapshot.nodes.some(
      (node) => node.frameContext?.frameId === inaccessibleFrame.context.frameId,
    ),
    "Cross-origin iframe fabricated an editable child-document subtree",
  );
  const diagnostic = snapshot.diagnostics.find(
    (item) =>
      item.code === "STANDARD_CAPTURE_FRAME_INACCESSIBLE" &&
      item.frameId === inaccessibleFrame.context.frameId,
  );
  assert(diagnostic, "Cross-origin iframe diagnostic was not emitted");
  assert(
    diagnostic.sourceNodeId === iframe.captureNodeId,
    "Cross-origin iframe diagnostic is not linked to the iframe boundary",
  );
}

function assertRegionSnapshot(snapshot, bounds) {
  assert(snapshot.captureTarget?.type === "region", "Region capture target type mismatch");
  assert(
    JSON.stringify(snapshot.captureTarget.bounds) === JSON.stringify(bounds),
    "Region capture bounds were not preserved",
  );

  const target = findNodeByRole(snapshot, "region-target", "intersecting region target");
  const wrapper = findNodeByRole(
    snapshot,
    "region-structural-wrapper",
    "geometry-free structural wrapper",
  );
  const ancestor = findNodeByRole(snapshot, "region-ancestor", "region structural ancestor");
  assert(
    wrapper.geometry === undefined,
    "Structural wrapper unexpectedly gained geometry evidence",
  );
  assert(
    target.relationships?.sourceParentId === wrapper.captureNodeId,
    "Region target lost its source structural parent",
  );
  assert(
    wrapper.relationships?.sourceParentId === ancestor.captureNodeId,
    "Geometry-free structural wrapper lost its ancestor relationship",
  );
  assert(
    ancestor.childCaptureNodeIds.includes(wrapper.captureNodeId) &&
      wrapper.childCaptureNodeIds.includes(target.captureNodeId),
    "Region ancestor child closure was not preserved",
  );
  assert(
    !snapshot.nodes.some(
      (node) => node.source?.attributes?.["data-node31-role"] === "region-outside-sibling",
    ),
    "Non-intersecting region sibling was incorrectly retained",
  );

  const retainedIds = new Set(snapshot.nodes.map((node) => node.captureNodeId));
  for (const node of snapshot.nodes) {
    for (const relation of [
      node.relationships?.sourceParentId,
      node.relationships?.composedParentId,
      node.relationships?.assignedSlotId,
      node.relationships?.shadowHostId,
    ]) {
      assert(
        !relation || retainedIds.has(relation),
        `Region relationship points outside retained set: ${relation}`,
      );
    }
    for (const childId of node.childCaptureNodeIds) {
      assert(
        retainedIds.has(childId),
        `Region childCaptureNodeIds points outside retained set: ${childId}`,
      );
    }
  }
}

const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-standard-capture-"));
const chromePath = await findChrome();
let chromeProcess;
let client;
let fixtureServer;
let crossOriginServer;
let chromeStderr = "";

try {
  await access(captureModulePath);
  await access(shadowFixturePath);
  await access(iframeFixturePath);
  await access(p0FixturePath);
  fixtureServer = await startFixtureServer();
  crossOriginServer = await startCrossOriginServer();

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
  const moduleUrl = `${fixtureServer.baseUrl}/runtime/standard-capture-adapter/capture.js`;

  await navigate(
    client,
    `${fixtureServer.baseUrl}/fixture/shadow-dom.html`,
    `Boolean(document.querySelector("fixture-card")?.shadowRoot?.querySelector('slot[name="meta"]'))`,
    "Shadow DOM",
  );
  const shadowSnapshot = await captureSnapshot(client, moduleUrl);
  assertShadowSnapshot(shadowSnapshot);

  await navigate(
    client,
    `${fixtureServer.baseUrl}/fixture/iframe.html`,
    `Boolean(document.querySelector("iframe")?.contentDocument?.body?.textContent?.includes("Embedded analytics"))`,
    "same-origin iframe",
  );
  const iframeSnapshot = await captureSnapshot(client, moduleUrl);
  assertIframeSnapshot(iframeSnapshot);

  await navigate(
    client,
    `${fixtureServer.baseUrl}/fixture/standard-capture-p0.html`,
    `document.documentElement.dataset.node31Ready === "true"`,
    "Standard capture P0",
  );
  const crossOriginUrl = `${crossOriginServer.baseUrl}/fixture/cross-origin-child.html`;
  const p0State = await evaluate(
    client,
    `(async () => {
      const iframe = document.querySelector("#cross-origin-frame");
      const app = document.querySelector("#app-scroll");
      if (!(iframe instanceof HTMLIFrameElement) || !(app instanceof HTMLElement)) {
        throw new Error("P0 fixture controls are missing");
      }
      const loaded = new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
      iframe.src = ${JSON.stringify(crossOriginUrl)};
      await loaded;
      app.scrollTop = 420;
      window.scrollTo(0, 500);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const target = document.querySelector("#region-target");
      if (!(target instanceof HTMLElement)) throw new Error("P0 region target is missing");
      const rect = target.getBoundingClientRect();
      return {
        windowScrollY: window.scrollY,
        appScrollTop: app.scrollTop,
        regionBounds: {
          x: rect.left + window.scrollX + 16,
          y: rect.top + window.scrollY + 16,
          width: Math.max(1, rect.width - 32),
          height: Math.max(1, Math.min(72, rect.height - 32)),
        },
      };
    })()`,
  );

  const p0Snapshots = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    p0Snapshots.push(await captureSnapshot(client, moduleUrl));
  }
  const normalizedBaseline = normalizeSnapshot(p0Snapshots[0]);
  for (let attempt = 1; attempt < p0Snapshots.length; attempt += 1) {
    assert(
      normalizeSnapshot(p0Snapshots[attempt]) === normalizedBaseline,
      `Current HTTP document capture was nondeterministic on repeat ${attempt + 1}`,
    );
  }
  assertDocumentAndCrossOriginSnapshot(p0Snapshots[0], p0State, crossOriginUrl);

  const regionTarget = {
    type: "region",
    bounds: p0State.regionBounds,
    exclusions: [],
  };
  const regionSnapshot = await captureSnapshot(client, moduleUrl, regionTarget);
  assertRegionSnapshot(regionSnapshot, p0State.regionBounds);

  console.log(
    JSON.stringify(
      {
        version: "1.1.0",
        evidenceType: "node31-standard-capture-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        moduleArtifact: captureModulePath,
        fixtureArtifacts: [shadowFixturePath, iframeFixturePath, p0FixturePath],
        assertions: [
          "open-shadow-root-captured",
          "shadow-host-relationship-preserved",
          "named-slot-captured",
          "slotted-light-dom-source-parent-preserved",
          "slotted-light-dom-composed-parent-remapped",
          "slotted-light-dom-assigned-slot-id-preserved",
          "shadow-root-editable-text-captured",
          "same-origin-iframe-accessible-child-frame-captured",
          "same-origin-iframe-root-linked-to-boundary",
          "same-origin-iframe-editable-text-captured",
          "same-origin-iframe-no-inaccessible-diagnostic",
          "current-http-document-capture-repeat-10-normalized-identical",
          "document-scroll-root-live-position-preserved",
          "primary-app-scroll-root-identified",
          "primary-app-scroll-root-live-position-preserved",
          "cross-origin-iframe-inaccessible-frame-recorded",
          "cross-origin-iframe-diagnostic-linked-to-boundary",
          "cross-origin-iframe-no-editable-child-subtree-fabricated",
          "region-partial-intersection-retained",
          "region-geometry-free-structural-ancestor-retained",
          "region-non-intersecting-sibling-excluded",
          "region-relationship-closure-preserved",
        ],
        provesP0Items: [
          "current-document-deterministic-online",
          "region-intersections-and-structural-ancestors",
          "document-and-primary-app-scroll-root-semantics",
          "open-shadow-dom-slot-composed-tree",
          "same-origin-iframe",
          "inaccessible-cross-origin-frame-diagnostic",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  await stopChrome(chromeProcess);
  await closeServer(fixtureServer?.server);
  await closeServer(crossOriginServer?.server);
  await removeProfileDir(profileDir);
}
