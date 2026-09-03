const nativeFetch = globalThis.fetch;

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
    throw new Error(`NODE-31 V9 ChromeDriver helper failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload?.value;
}

async function switchWindow(sessionBase, handle) {
  await driverJson(`${sessionBase}/window`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle }),
  });
}

async function currentUrl(sessionBase) {
  return driverJson(`${sessionBase}/url`);
}

async function executeAsync(sessionBase, script, args = []) {
  return driverJson(`${sessionBase}/execute/async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script, args }),
  });
}

async function findHandleByUrl(sessionBase, predicate) {
  const handles = await driverJson(`${sessionBase}/window/handles`);
  const diagnostics = [];
  for (const handle of handles ?? []) {
    try {
      await switchWindow(sessionBase, handle);
      const url = await currentUrl(sessionBase);
      diagnostics.push({ handle, url });
      if (predicate(url)) return { handle, url, diagnostics };
    } catch (error) {
      diagnostics.push({ handle, error: String(error) });
    }
  }
  return { handle: null, url: null, diagnostics };
}

async function readExtensionInfo(sessionBase, extensionId) {
  return executeAsync(
    sessionBase,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     chrome.developerPrivate.getExtensionInfo(
       extensionId,
       (info) => chrome.runtime.lastError
         ? done({ ok: false, error: chrome.runtime.lastError.message })
         : done({
             ok: true,
             info: {
               id: info.id,
               name: info.name,
               state: info.state,
               location: info.location,
               type: info.type,
               optionsPage: info.optionsPage ?? null,
               fileAccess: info.fileAccess ?? null,
               views: (info.views ?? []).map((view) => ({
                 type: view.type,
                 url: view.url,
                 renderProcessId: view.renderProcessId,
                 renderViewId: view.renderViewId,
                 incognito: view.incognito
               }))
             }
           })
     );`,
    [extensionId],
  );
}

async function enableExtension(sessionBase, extensionId) {
  return executeAsync(
    sessionBase,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     if (typeof chrome?.management?.setEnabled !== "function") {
       done({ ok: false, error: "chrome.management.setEnabled unavailable" });
       return;
     }
     chrome.management.setEnabled(extensionId, true, () =>
       chrome.runtime.lastError
         ? done({ ok: false, error: chrome.runtime.lastError.message })
         : done({ ok: true })
     );`,
    [extensionId],
  );
}

async function waitForEnabled(sessionBase, extensionId) {
  let lastInfo = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    lastInfo = await readExtensionInfo(sessionBase, extensionId);
    if (lastInfo?.ok && lastInfo.info?.state === "ENABLED") return lastInfo;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  return lastInfo;
}

async function openAuthorizedOptions(sessionId, extensionId) {
  const sessionBase = `http://127.0.0.1:9515/session/${sessionId}`;
  const originalHandle = await driverJson(`${sessionBase}/window`);

  const management = await findHandleByUrl(
    sessionBase,
    (url) => typeof url === "string" && url.startsWith("chrome://extensions"),
  );
  if (!management.handle) {
    await switchWindow(sessionBase, originalHandle).catch(() => undefined);
    throw new Error(
      `NODE-31 V9 could not locate chrome://extensions handle: ${JSON.stringify(management.diagnostics)}`,
    );
  }

  let info = await readExtensionInfo(sessionBase, extensionId);
  console.log(`NODE-31 file protocol v9: extension info before showOptions ${JSON.stringify(info)}`);
  if (!info?.ok) {
    throw new Error(`NODE-31 V9 getExtensionInfo failed: ${info?.error}`);
  }

  if (info.info?.state !== "ENABLED") {
    console.log(`NODE-31 file protocol v9: enabling extension from state ${info.info?.state}`);
    const enabled = await enableExtension(sessionBase, extensionId);
    if (enabled?.ok !== true) {
      throw new Error(`NODE-31 V9 chrome.management.setEnabled failed: ${enabled?.error}`);
    }
    info = await waitForEnabled(sessionBase, extensionId);
    console.log(`NODE-31 file protocol v9: extension info after enable ${JSON.stringify(info)}`);
    if (info?.info?.state !== "ENABLED") {
      throw new Error(`NODE-31 V9 extension did not enter ENABLED state: ${JSON.stringify(info)}`);
    }
  }

  const showResult = await executeAsync(
    sessionBase,
    `const extensionId = arguments[0];
     const done = arguments[arguments.length - 1];
     Promise.resolve(chrome.developerPrivate.showOptions(extensionId))
       .then(() => done({ ok: true }))
       .catch((error) => done({ ok: false, error: String(error?.stack ?? error) }));`,
    [extensionId],
  );
  if (showResult?.ok !== true) {
    const latestInfo = await readExtensionInfo(sessionBase, extensionId).catch(() => null);
    throw new Error(
      `NODE-31 V9 developerPrivate.showOptions failed: ${showResult?.error}; extension=${JSON.stringify(latestInfo)}`,
    );
  }

  let lastDiagnostics = [];
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const extensionTarget = await findHandleByUrl(
      sessionBase,
      (url) => typeof url === "string" && url.startsWith(`chrome-extension://${extensionId}/`),
    );
    lastDiagnostics = extensionTarget.diagnostics;
    if (extensionTarget.handle) {
      console.log(
        `NODE-31 file protocol v9: Chrome opened authorized extension target ${extensionTarget.handle} ${extensionTarget.url}`,
      );
      return extensionTarget;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  await switchWindow(sessionBase, originalHandle).catch(() => undefined);
  throw new Error(
    `NODE-31 V9 showOptions did not expose an authorized extension target: ${JSON.stringify(lastDiagnostics)}`,
  );
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url === "http://127.0.0.1:9515/session" && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const chromeOptions = body?.capabilities?.alwaysMatch?.["goog:chromeOptions"];
    if (!chromeOptions || typeof chromeOptions !== "object") {
      throw new Error("NODE-31 V9 could not locate goog:chromeOptions in ChromeDriver session request");
    }
    chromeOptions.enableExtensionTargets = true;
    init = { ...init, body: JSON.stringify(body) };
    console.log("NODE-31 file protocol v9: enabling ChromeDriver extension target introspection");
  }

  const navigationMatch = url.match(/^http:\/\/127\.0\.0\.1:9515\/session\/([^/]+)\/url$/);
  if (navigationMatch && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const extensionMatch =
      typeof body?.url === "string"
        ? body.url.match(/^chrome-extension:\/\/([a-p]{32})\//)
        : null;
    if (extensionMatch) {
      const extensionId = extensionMatch[1];
      console.log(
        `NODE-31 file protocol v9: replacing synthetic extension navigation with enabled developerPrivate.showOptions(${extensionId})`,
      );
      await openAuthorizedOptions(navigationMatch[1], extensionId);
      return jsonResponse(null);
    }
  }

  return nativeFetch(input, init);
};

try {
  await import("./run-node-31-file-protocol-runtime-v5.mjs");
} finally {
  globalThis.fetch = nativeFetch;
}
