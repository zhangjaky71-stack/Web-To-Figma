import { setTimeout as delay } from "node:timers/promises";

const nativeFetch = globalThis.fetch;
const JOB_STORAGE_KEY = "w2f.captureJob.v1";
const PROBE_KEY = "node31.fileProtocol.v15.startJobResponse";

function jsonResponse(value) {
  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function driverJson(url, init) {
  const response = await nativeFetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.value?.error) {
    throw new Error(
      `NODE-31 V15 ChromeDriver helper failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  return payload?.value;
}

async function executeAsync(sessionBase, script, args = []) {
  return driverJson(`${sessionBase}/execute/async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script, args }),
  });
}

async function readStoredProgress(sessionBase) {
  return executeAsync(
    sessionBase,
    `const keys = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.storage.local.get(keys, (values) => {
       if (chrome.runtime.lastError) {
         done({ ok: false, error: chrome.runtime.lastError.message });
         return;
       }
       done({ ok: true, values });
     });`,
    [[JOB_STORAGE_KEY, PROBE_KEY]],
  );
}

async function dispatchCapability(sessionBase, fixtureUrl) {
  return executeAsync(
    sessionBase,
    `const fixtureUrl = arguments[0];
     const done = arguments[arguments.length - 1];
     (async () => {
       try {
         const tabs = await chrome.tabs.query({});
         const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
         if (!fileTab || typeof fileTab.id !== "number") {
           done({
             ok: false,
             error: "file-tab-not-found",
             tabs: tabs.map((tab) => ({ id: tab.id, url: tab.url }))
           });
           return;
         }
         const [injection] = await chrome.scripting.executeScript({
           target: { tabId: fileTab.id },
           func: async () => chrome.runtime.sendMessage({ type: "W2F_GET_SOURCE_CAPABILITY" })
         });
         done({ ok: true, response: injection?.result ?? null, tabId: fileTab.id });
       } catch (error) {
         done({ ok: false, error: String(error?.stack ?? error) });
       }
     })();`,
    [fixtureUrl],
  );
}

async function probeActionActiveTabGrant(sessionBase, fixtureUrl) {
  return executeAsync(
    sessionBase,
    `const fixtureUrl = arguments[0];
     const done = arguments[arguments.length - 1];
     (async () => {
       try {
         const tabs = await chrome.tabs.query({});
         const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
         if (!fileTab || typeof fileTab.id !== "number" || typeof fileTab.windowId !== "number") {
           done({ ok: false, stage: "resolve-file-tab", error: "file-tab-not-found" });
           return;
         }
         await chrome.tabs.update(fileTab.id, { active: true });
         await chrome.windows.update(fileTab.windowId, { focused: true }).catch(() => undefined);
         const activeBefore = await chrome.tabs.query({ active: true, windowId: fileTab.windowId });
         let popupOpened = false;
         let popupError = null;
         try {
           await chrome.action.openPopup({ windowId: fileTab.windowId });
           popupOpened = true;
         } catch (error) {
           popupError = String(error?.stack ?? error);
         }
         await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
         try {
           const dataUrl = await chrome.tabs.captureVisibleTab(fileTab.windowId, { format: "png" });
           done({
             ok: true,
             fileTabId: fileTab.id,
             windowId: fileTab.windowId,
             activeBefore: activeBefore.map((tab) => ({ id: tab.id, url: tab.url })),
             popupOpened,
             popupError,
             captureVisibleTabGranted: typeof dataUrl === "string" && dataUrl.startsWith("data:image/png"),
             captureByteHint: typeof dataUrl === "string" ? dataUrl.length : 0
           });
         } catch (error) {
           done({
             ok: false,
             stage: "capture-visible-tab",
             fileTabId: fileTab.id,
             windowId: fileTab.windowId,
             activeBefore: activeBefore.map((tab) => ({ id: tab.id, url: tab.url })),
             popupOpened,
             popupError,
             captureVisibleTabGranted: false,
             error: String(error?.message ?? error)
           });
         }
       } catch (error) {
         done({ ok: false, stage: "action-probe", error: String(error?.stack ?? error) });
       }
     })();`,
    [fixtureUrl],
  );
}

async function readDebuggerTargetState(sessionBase, fixtureUrl) {
  return executeAsync(
    sessionBase,
    `const fixtureUrl = arguments[0];
     const done = arguments[arguments.length - 1];
     (async () => {
       try {
         const tabs = await chrome.tabs.query({});
         const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
         if (!fileTab || typeof fileTab.id !== "number") {
           done({ ok: false, error: "file-tab-not-found" });
           return;
         }
         chrome.debugger.getTargets((targets) => {
           if (chrome.runtime.lastError) {
             done({ ok: false, error: chrome.runtime.lastError.message, fileTabId: fileTab.id });
             return;
           }
           const matches = (targets ?? [])
             .filter((target) => target.tabId === fileTab.id || target.url === fixtureUrl)
             .map((target) => ({
               id: target.id,
               tabId: target.tabId ?? null,
               type: target.type,
               attached: target.attached,
               title: target.title,
               url: target.url
             }));
           done({ ok: true, fileTabId: fileTab.id, matches });
         });
       } catch (error) {
         done({ ok: false, error: String(error?.stack ?? error) });
       }
     })();`,
    [fixtureUrl],
  );
}

async function launchStartJob(sessionBase, fixtureUrl) {
  await executeAsync(
    sessionBase,
    `const key = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.storage.local.remove(key, () => {
       if (chrome.runtime.lastError) {
         done({ ok: false, error: chrome.runtime.lastError.message });
         return;
       }
       done({ ok: true });
     });`,
    [PROBE_KEY],
  );

  return executeAsync(
    sessionBase,
    `const fixtureUrl = arguments[0];
     const responseKey = arguments[1];
     const done = arguments[arguments.length - 1];
     (async () => {
       try {
         const tabs = await chrome.tabs.query({});
         const fileTab = tabs.find((candidate) => candidate.url === fixtureUrl);
         if (!fileTab || typeof fileTab.id !== "number") {
           done({
             ok: false,
             error: "file-tab-not-found",
             tabs: tabs.map((tab) => ({ id: tab.id, url: tab.url }))
           });
           return;
         }
         const [injection] = await chrome.scripting.executeScript({
           target: { tabId: fileTab.id },
           func: (responseKey) => {
             void chrome.runtime
               .sendMessage({ type: "W2F_START_JOB", mode: "full-page" })
               .then(
                 (response) => chrome.storage.local.set({
                   [responseKey]: { settled: true, response }
                 }),
                 (error) => chrome.storage.local.set({
                   [responseKey]: {
                     settled: true,
                     error: String(error?.stack ?? error)
                   }
                 })
               );
             return { started: true, runtimeId: chrome.runtime.id };
           },
           args: [responseKey]
         });
         done({
           ok: true,
           tabId: fileTab.id,
           launch: injection?.result ?? null
         });
       } catch (error) {
         done({ ok: false, error: String(error?.stack ?? error) });
       }
     })();`,
    [fixtureUrl, PROBE_KEY],
  );
}

function jobSignature(job) {
  if (!job || typeof job !== "object") return "none";
  return JSON.stringify({
    jobId: job.jobId ?? null,
    status: job.status ?? null,
    phase: job.phase ?? null,
    error: job.error ?? null,
    adapter: job.capture?.adapter ?? null,
    nodeCount: job.capture?.nodeCount ?? null,
  });
}

async function waitForProductionResponse(sessionBase, timeoutMs = 120000) {
  const startedAt = Date.now();
  let lastSignature = null;
  let lastJob = null;
  let lastProbe = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const stored = await readStoredProgress(sessionBase);
    if (stored?.ok !== true) {
      throw new Error(`NODE-31 V15 cannot read production job storage: ${stored?.error}`);
    }
    lastJob = stored.values?.[JOB_STORAGE_KEY] ?? null;
    lastProbe = stored.values?.[PROBE_KEY] ?? null;

    const signature = jobSignature(lastJob);
    if (signature !== lastSignature) {
      lastSignature = signature;
      console.log(
        `NODE-31 file protocol v15: production job transition +${Date.now() - startedAt}ms ${signature}`,
      );
    }

    if (lastProbe?.settled === true) {
      if (lastProbe.error) {
        throw new Error(
          `NODE-31 V15 production W2F_START_JOB promise rejected: ${lastProbe.error}; job=${JSON.stringify(lastJob)}`,
        );
      }
      if (!lastProbe.response) {
        throw new Error(
          `NODE-31 V15 production W2F_START_JOB settled without a response; job=${JSON.stringify(lastJob)}`,
        );
      }
      return { response: lastProbe.response, job: lastJob, elapsedMs: Date.now() - startedAt };
    }

    if (["completed", "failed", "cancelled"].includes(lastJob?.status)) {
      for (let grace = 0; grace < 40; grace += 1) {
        await delay(25);
        const after = await readStoredProgress(sessionBase);
        const probe = after?.values?.[PROBE_KEY] ?? null;
        if (probe?.settled === true) {
          if (probe.error) {
            throw new Error(
              `NODE-31 V15 production response persistence failed: ${probe.error}; job=${JSON.stringify(lastJob)}`,
            );
          }
          return { response: probe.response, job: lastJob, elapsedMs: Date.now() - startedAt };
        }
      }
      throw new Error(
        `NODE-31 V15 production job reached ${lastJob.status} but exact runtime response was not persisted: ${JSON.stringify(lastJob)}`,
      );
    }

    await delay(100);
  }

  throw new Error(
    `NODE-31 V15 production capture timed out after ${timeoutMs}ms: ${JSON.stringify({ lastJob, lastProbe })}`,
  );
}

async function handleProductionDispatch(sessionId, fixtureUrl) {
  const sessionBase = `http://127.0.0.1:9516/session/${sessionId}`;

  console.log("NODE-31 file protocol v15: querying production source capability independently");
  const capability = await dispatchCapability(sessionBase, fixtureUrl);
  if (capability?.ok !== true || !capability.response) {
    throw new Error(
      `NODE-31 V15 production source capability dispatch failed: ${JSON.stringify(capability)}`,
    );
  }
  console.log(
    `NODE-31 file protocol v15: source capability response ${JSON.stringify(capability.response)}`,
  );

  console.log("NODE-31 file protocol v15: probing real action activeTab grant on the file tab");
  const actionGrant = await probeActionActiveTabGrant(sessionBase, fixtureUrl);
  console.log(`NODE-31 file protocol v15: action activeTab probe ${JSON.stringify(actionGrant)}`);
  if (actionGrant?.ok !== true || actionGrant.captureVisibleTabGranted !== true) {
    throw new Error(
      `NODE-31 V15 action invocation did not grant captureVisibleTab permission: ${JSON.stringify(actionGrant)}`,
    );
  }

  const debuggerState = await readDebuggerTargetState(sessionBase, fixtureUrl);
  console.log(
    `NODE-31 file protocol v15: debugger target ownership ${JSON.stringify(debuggerState)}`,
  );

  console.log("NODE-31 file protocol v15: launching production full-page job without blocking WebDriver");
  const launch = await launchStartJob(sessionBase, fixtureUrl);
  if (launch?.ok !== true || launch?.launch?.started !== true) {
    throw new Error(`NODE-31 V15 production job launch failed: ${JSON.stringify(launch)}`);
  }

  const completion = await waitForProductionResponse(sessionBase);
  console.log(
    `NODE-31 file protocol v15: production W2F_START_JOB exact response settled in ${completion.elapsedMs}ms`,
  );

  return {
    ok: true,
    result: {
      capability: capability.response,
      job: completion.response,
    },
  };
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const dispatchMatch = url.match(
    /^http:\/\/127\.0\.0\.1:9516\/session\/([^/]+)\/execute\/async$/,
  );

  if (dispatchMatch && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    if (
      typeof body?.script === "string" &&
      body.script.includes('W2F_GET_SOURCE_CAPABILITY') &&
      body.script.includes('W2F_START_JOB') &&
      Array.isArray(body.args) &&
      typeof body.args[0] === "string" &&
      body.args[0].startsWith("file://")
    ) {
      const productionResponses = await handleProductionDispatch(dispatchMatch[1], body.args[0]);
      return jsonResponse(productionResponses);
    }
  }

  return nativeFetch(input, init);
};

try {
  await import("./run-node-31-file-protocol-runtime-v14.mjs");
} finally {
  globalThis.fetch = nativeFetch;
}
