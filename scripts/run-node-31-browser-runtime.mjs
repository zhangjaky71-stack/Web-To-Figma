import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const contentScriptPath = "apps/browser-extension/dist/runtime/content-script.js";
const expectedScroll = { x: 0, y: 620 };
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

function assertNear(actual, expected, message) {
  assert(Math.abs(actual - expected) <= 1, `${message}: expected ${expected}, got ${actual}`);
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
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
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
      throw new Error(`Chrome exited before CDP was ready (${chromeProcess.exitCode}).\n${stderr()}`);
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function readPageState(client) {
  return evaluate(
    client,
    `(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      activeId: document.activeElement?.id ?? "",
      scrollBehavior: document.documentElement.style.scrollBehavior,
      selectorCount: document.querySelectorAll("[data-w2f-region-selector]").length
    }))()`,
  );
}

function assertRestored(state, label) {
  assertNear(state.scrollX, expectedScroll.x, `${label} scrollX`);
  assertNear(state.scrollY, expectedScroll.y, `${label} scrollY`);
  assert(state.activeId === "before", `${label} focus was not restored to #before`);
  assert(state.scrollBehavior === "smooth", `${label} scroll-behavior inline style was not restored`);
  assert(state.selectorCount === 0, `${label} selector overlay was not removed`);
}

async function openSelector(client, jobId, responseArrayName) {
  await evaluate(
    client,
    `(() => {
      globalThis[${JSON.stringify(responseArrayName)}] = [];
      const accepted = globalThis.__w2fListener(
        { type: "W2F_SELECT_REGION", jobId: ${JSON.stringify(jobId)} },
        null,
        (response) => globalThis[${JSON.stringify(responseArrayName)}].push(response),
      );
      return accepted;
    })()`,
  );
  await waitFor(
    client,
    `document.querySelectorAll("[data-w2f-region-selector]").length === 1`,
    `${jobId} selector overlay did not open`,
  );
}

async function disturbPageState(client, y) {
  await evaluate(
    client,
    `(() => {
      window.scrollTo({ left: 0, top: ${y}, behavior: "instant" });
      document.getElementById("other").focus({ preventScroll: true });
    })()`,
  );
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

const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-chrome-"));
const chromePath = await findChrome();
let chromeProcess;
let client;
let chromeStderr = "";

try {
  const contentScript = await readFile(contentScriptPath, "utf8");
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

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>NODE-31 region restore runtime</title></head>
  <body style="margin:0;min-height:4200px">
    <input id="before" style="position:absolute;top:20px;left:20px" value="before">
    <input id="other" style="position:absolute;top:1900px;left:20px" value="other">
    <main style="position:absolute;top:900px;left:80px;width:600px;height:1800px;background:#eee"></main>
  </body>
</html>`;
  await client.send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  await waitFor(client, `document.readyState === "complete"`, "Test page did not finish loading");

  await evaluate(
    client,
    `(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, ${expectedScroll.y});
      document.documentElement.style.scrollBehavior = "smooth";
      document.getElementById("before").focus({ preventScroll: true });
      globalThis.__w2fListener = null;
      globalThis.chrome.runtime = {
        onMessage: {
          addListener(listener) {
            globalThis.__w2fListener = listener;
          }
        }
      };
    })()`,
  );
  await evaluate(client, contentScript);
  assert(
    await evaluate(client, `typeof globalThis.__w2fListener === "function"`),
    "Content script did not register its runtime listener",
  );

  const initialState = await readPageState(client);
  assertRestored(initialState, "initial state");

  await openSelector(client, "node31-cancel", "__w2fCancelResponses");
  await disturbPageState(client, 1550);
  await evaluate(
    client,
    `globalThis.__w2fListener(
      { type: "W2F_CANCEL_REGION_SELECTION", jobId: "node31-cancel" },
      null,
      (response) => { globalThis.__w2fCancelAck = response; },
    )`,
  );
  await waitFor(
    client,
    `document.querySelectorAll("[data-w2f-region-selector]").length === 0`,
    "Cancel path did not remove selector overlay",
  );
  const cancelState = await readPageState(client);
  assertRestored(cancelState, "cancel path");
  const cancelResponse = await evaluate(client, `globalThis.__w2fCancelResponses[0]`);
  assert(
    cancelResponse?.type === "W2F_CONTENT_SELECTION_CANCELLED",
    "Cancel path did not return W2F_CONTENT_SELECTION_CANCELLED",
  );

  await openSelector(client, "node31-confirm", "__w2fConfirmResponses");
  await disturbPageState(client, 1650);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 120,
    y: 120,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 420,
    y: 320,
    button: "left",
    buttons: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 420,
    y: 320,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await waitFor(
    client,
    `globalThis.__w2fConfirmResponses.length === 1 && document.querySelectorAll("[data-w2f-region-selector]").length === 0`,
    "Confirm path did not complete and remove selector overlay",
  );
  const confirmState = await readPageState(client);
  assertRestored(confirmState, "confirm path");
  const confirmResponse = await evaluate(client, `globalThis.__w2fConfirmResponses[0]`);
  assert(
    confirmResponse?.type === "W2F_CONTENT_REGION_RESULT",
    "Confirm path did not return W2F_CONTENT_REGION_RESULT",
  );
  assert(
    confirmResponse.region?.bounds?.width >= 250,
    "Confirm path selection width was not captured",
  );
  assert(
    confirmResponse.region?.bounds?.height >= 150,
    "Confirm path selection height was not captured",
  );

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        evidenceType: "node31-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        sourceArtifact: contentScriptPath,
        assertions: [
          "cancel-restores-scroll",
          "cancel-restores-focus",
          "cancel-restores-inline-scroll-behavior",
          "cancel-removes-selector-overlay",
          "confirm-restores-scroll",
          "confirm-restores-focus",
          "confirm-restores-inline-scroll-behavior",
          "confirm-removes-selector-overlay",
          "confirm-returns-region-result",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  await stopChrome(chromeProcess);
  await removeProfileDir(profileDir);
}
