import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const modulePath = "apps/browser-extension/dist/runtime/visual-state-runtime.js";
const fixturePath = "qa/corpus/node31/p0/visual-state-runtime.html";
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

function delta(left, right) {
  return Math.abs(Number(left) - Number(right));
}

function animationProgressed(before, after, minimumMs = 25) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    return false;
  }
  return before.some((value, index) => delta(value, after[index]) >= minimumMs);
}

function animationsStable(before, after, epsilonMs = 3) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    return false;
  }
  return before.every((value, index) => delta(value, after[index]) <= epsilonMs);
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
    await new Promise((resolveConnection, rejectConnection) => {
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener(
        "error",
        () => rejectConnection(new Error("Unable to open CDP WebSocket")),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveMessage, rejectMessage) => {
      this.pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForDevToolsPort(profileDir, chromeProcess, stderr) {
  const activePortPath = join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 1200; attempt += 1) {
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function readVisualState(client) {
  return evaluate(client, `globalThis.__node31VisualState?.()`);
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolveExit) => childProcess.once("exit", () => resolveExit(true))),
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

const moduleUrl = pathToFileURL(resolve(modulePath));
const visualStateModule = await import(moduleUrl.href);
const freezeSource = String(visualStateModule.freezeVisualStateInPage);
const restoreSource = String(visualStateModule.restoreVisualStateInPage);
assert(
  freezeSource.includes("__W2F_VISUAL_STATE_FREEZE_V1__"),
  "Built freeze function does not contain the visual-state transaction boundary",
);
assert(
  restoreSource.includes("__W2F_VISUAL_STATE_FREEZE_V1__"),
  "Built restore function does not contain the visual-state transaction boundary",
);

const fixtureHtml = await readFile(fixturePath, "utf8");
const profileDir = await mkdtemp(join(tmpdir(), "w2f-node31-visual-state-"));
const chromePath = await findChrome();
let chromeProcess;
let client;
let chromeStderr = "";

try {
  chromeProcess = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--autoplay-policy=no-user-gesture-required",
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

  await client.send("Page.navigate", {
    url: `data:text/html;charset=utf-8,${encodeURIComponent(fixtureHtml)}`,
  });
  await waitFor(client, `document.readyState === "complete"`, "Fixture did not finish loading");
  await waitFor(
    client,
    `globalThis.__node31VisualStateReady === true`,
    "Fixture media did not begin playback",
  );

  await waitFor(
    client,
    `globalThis.__node31VisualState?.().ready === true && globalThis.__node31VisualState?.().mediaPaused === false`,
    "Fixture media did not enter playing state",
  );

  const beforeA = await readVisualState(client);
  let beforeB = beforeA;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(100);
    beforeB = await readVisualState(client);
    if (
      beforeB?.ready &&
      animationProgressed(beforeA.animationTimes, beforeB.animationTimes) &&
      (delta(beforeA.cssX, beforeB.cssX) >= 3 || delta(beforeA.waapiX, beforeB.waapiX) >= 3) &&
      beforeB.mediaPaused === false &&
      beforeB.mediaTime - beforeA.mediaTime >= 0.08
    ) {
      break;
    }
  }
  assert(beforeA?.ready && beforeB?.ready, "Fixture did not expose ready visual-state samples");
  assert(
    beforeA.animationTimes.length >= 2,
    `Expected CSS and WAAPI animations, got ${beforeA.animationTimes.length}`,
  );
  assert(
    animationProgressed(beforeA.animationTimes, beforeB.animationTimes),
    "Animations did not advance before freeze",
  );
  assert(
    delta(beforeA.cssX, beforeB.cssX) >= 3 || delta(beforeA.waapiX, beforeB.waapiX) >= 3,
    "Animated geometry did not advance before freeze",
  );
  assert(beforeA.mediaPaused === false && beforeB.mediaPaused === false, "Media was not playing");
  assert(beforeB.mediaTime - beforeA.mediaTime >= 0.08, "Media did not advance before freeze");
  const originalDomSignature = beforeB.domSignature;

  const transactionId = "node31-visual-state-runtime";
  const freezeReceipt = await evaluate(
    client,
    `(${freezeSource})(${JSON.stringify(transactionId)})`,
  );
  assert(freezeReceipt?.version === "1.0.0", "Freeze receipt version mismatch");
  assert(freezeReceipt?.transactionId === transactionId, "Freeze receipt transaction mismatch");
  assert(freezeReceipt?.status === "frozen", "Freeze receipt status mismatch");
  assert(freezeReceipt?.idempotent === false, "First freeze unexpectedly reported idempotent");
  assert(freezeReceipt?.animationCount >= 2, "Freeze did not discover both animations");
  assert(freezeReceipt?.pausedAnimationCount >= 2, "Freeze did not pause running animations");
  assert(freezeReceipt?.mediaCount >= 1, "Freeze did not discover ShadowRoot media");
  assert(freezeReceipt?.pausedMediaCount >= 1, "Freeze did not pause playing media");

  const frozenA = await readVisualState(client);
  await delay(350);
  const frozenB = await readVisualState(client);
  assert(
    frozenA.freezeGlobalPresent && frozenB.freezeGlobalPresent,
    "Freeze transaction was not held",
  );
  assert(
    frozenA.animationStates.every((state) => state === "paused") &&
      frozenB.animationStates.every((state) => state === "paused"),
    "Running animations were not paused during freeze",
  );
  assert(
    animationsStable(frozenA.animationTimes, frozenB.animationTimes),
    "Animation timelines advanced while frozen",
  );
  assert(delta(frozenA.cssX, frozenB.cssX) <= 1, "CSS animated geometry changed while frozen");
  assert(delta(frozenA.waapiX, frozenB.waapiX) <= 1, "WAAPI geometry changed while frozen");
  assert(frozenA.mediaPaused && frozenB.mediaPaused, "Playing media was not paused during freeze");
  assert(
    delta(frozenA.mediaTime, frozenB.mediaTime) <= 0.03,
    "Media timeline advanced while frozen",
  );
  assert(
    frozenB.domSignature === originalDomSignature,
    "Freeze permanently mutated fixture DOM or inline state",
  );

  const restoreReceipt = await evaluate(
    client,
    `(${restoreSource})(${JSON.stringify(transactionId)})`,
  );
  assert(restoreReceipt?.version === "1.0.0", "Restore receipt version mismatch");
  assert(restoreReceipt?.transactionId === transactionId, "Restore receipt transaction mismatch");
  assert(restoreReceipt?.status === "restored", "Restore receipt status mismatch");
  assert(restoreReceipt?.restoredAnimationCount >= 2, "Restore did not resume both animations");
  assert(restoreReceipt?.restoredMediaCount >= 1, "Restore did not resume media");
  assert(restoreReceipt?.resumeFailureCount === 0, "Restore reported resume failures");

  await waitFor(
    client,
    `globalThis.__node31VisualState?.().animationStates.every((state) => state === "running") && globalThis.__node31VisualState?.().mediaPaused === false`,
    "Animations or media did not resume after restore",
  );
  const restoredA = await readVisualState(client);
  await delay(300);
  const restoredB = await readVisualState(client);
  assert(
    !restoredA.freezeGlobalPresent && !restoredB.freezeGlobalPresent,
    "Freeze global survived restore",
  );
  assert(
    animationProgressed(restoredA.animationTimes, restoredB.animationTimes),
    "Animations did not advance after restore",
  );
  assert(
    delta(restoredA.cssX, restoredB.cssX) >= 3 || delta(restoredA.waapiX, restoredB.waapiX) >= 3,
    "Animated geometry did not advance after restore",
  );
  assert(restoredB.mediaTime - restoredA.mediaTime >= 0.08, "Media did not advance after restore");
  assert(
    restoredB.domSignature === originalDomSignature,
    "Restore left a permanent DOM or inline-state mutation",
  );

  console.log(
    JSON.stringify(
      {
        version: "1.0.0",
        evidenceType: "node31-visual-state-browser-runtime",
        status: "PASS",
        chrome: browserVersion.product,
        moduleArtifact: modulePath,
        fixtureArtifact: fixturePath,
        assertions: [
          "animations-advance-before-freeze",
          "animated-geometry-advances-before-freeze",
          "shadow-root-media-advances-before-freeze",
          "freeze-receipt-valid",
          "running-animations-paused-during-freeze",
          "animation-timelines-stable-during-freeze",
          "css-and-waapi-geometry-stable-during-freeze",
          "shadow-root-media-paused-during-freeze",
          "media-timeline-stable-during-freeze",
          "freeze-does-not-mutate-dom-inline-state",
          "restore-receipt-valid-zero-resume-failures",
          "animations-resume-after-restore",
          "animated-geometry-resumes-after-restore",
          "shadow-root-media-resumes-after-restore",
          "freeze-global-removed-after-restore",
          "restore-leaves-no-permanent-dom-inline-mutation",
        ],
        provesP0Items: ["visual-state-freeze-and-restore"],
        notProvenByThisArtifact: [
          "file-protocol-explicit-permission",
          "geometry-preserving-correction-policy",
          "raster-text-only-when-policy-justifies",
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
