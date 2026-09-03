const nativeFetch = globalThis.fetch;
const timelines = new Map();

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
      `NODE-31 V13 ChromeDriver helper failed: ${response.status} ${JSON.stringify(payload)}`,
    );
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

async function managementHandle(sessionBase) {
  const found = await findHandleByUrl(
    sessionBase,
    (url) => typeof url === "string" && url.startsWith("chrome://extensions"),
  );
  if (!found.handle) {
    throw new Error(
      `NODE-31 V13 could not locate chrome://extensions handle: ${JSON.stringify(found.diagnostics)}`,
    );
  }
  return found.handle;
}

async function readRegistryInfo(sessionBase, extensionId) {
  const originalHandle = await driverJson(`${sessionBase}/window`);
  const manager = await managementHandle(sessionBase);
  await switchWindow(sessionBase, manager);
  try {
    return await driverJson(`${sessionBase}/execute/async`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: `const extensionId = arguments[0];
          const done = arguments[arguments.length - 1];
          chrome.developerPrivate.getExtensionInfo(extensionId, (info) => {
            if (chrome.runtime.lastError) {
              done({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            done({
              ok: true,
              id: info.id,
              state: info.state,
              location: info.location,
              userMayModify: info.userMayModify ?? null,
              disableReasons: info.disableReasons ?? null,
              fileAccess: info.fileAccess ?? null,
              optionsPage: info.optionsPage ?? null,
              views: (info.views ?? []).map((view) => ({
                type: view.type,
                url: view.url,
                incognito: view.incognito ?? null
              }))
            });
          });`,
        args: [extensionId],
      }),
    });
  } finally {
    await switchWindow(sessionBase, originalHandle).catch(() => undefined);
  }
}

function signature(info) {
  return JSON.stringify({
    state: info?.state ?? null,
    userMayModify: info?.userMayModify ?? null,
    disableReasons: info?.disableReasons ?? null,
    fileActive: info?.fileAccess?.isActive ?? null,
    fileEnabled: info?.fileAccess?.isEnabled ?? null,
    views: (info?.views ?? []).map((view) => `${view.type}:${view.url}`),
  });
}

async function sampleTimeline(sessionBase, extensionId, label, durationMs = 2500) {
  const entries = [];
  let lastSignature = null;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= durationMs) {
    const info = await readRegistryInfo(sessionBase, extensionId);
    const nextSignature = signature(info);
    if (nextSignature !== lastSignature) {
      entries.push({ elapsedMs: Date.now() - startedAt, info });
      lastSignature = nextSignature;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  const timeline = timelines.get(extensionId) ?? [];
  timeline.push({ label, entries });
  timelines.set(extensionId, timeline);
  console.log(`NODE-31 file protocol v13: ${label} timeline ${JSON.stringify(entries)}`);
  return entries.at(-1)?.info ?? null;
}

async function waitForNaturalEnabled(sessionBase, extensionId, timeoutMs = 30000) {
  const startedAt = Date.now();
  const transitions = [];
  let lastSignature = null;
  let lastInfo = null;
  while (Date.now() - startedAt <= timeoutMs) {
    lastInfo = await readRegistryInfo(sessionBase, extensionId);
    const nextSignature = signature(lastInfo);
    if (nextSignature !== lastSignature) {
      transitions.push({ elapsedMs: Date.now() - startedAt, info: lastInfo });
      lastSignature = nextSignature;
      console.log(
        `NODE-31 file protocol v13: natural recovery transition ${JSON.stringify(transitions.at(-1))}`,
      );
    }
    if (
      lastInfo?.ok === true &&
      lastInfo?.state === "ENABLED" &&
      lastInfo?.fileAccess?.isActive === true
    ) {
      return { info: lastInfo, transitions };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(
    `NODE-31 V13 BiDi extension did not naturally recover to ENABLED after file-access changes: ${JSON.stringify({ lastInfo, transitions, timeline: timelines.get(extensionId) ?? [] })}`,
  );
}

async function openAuthorizedOptions(sessionId, extensionId) {
  const sessionBase = `http://127.0.0.1:9515/session/${sessionId}`;
  const originalHandle = await driverJson(`${sessionBase}/window`);
  const recovery = await waitForNaturalEnabled(sessionBase, extensionId);
  console.log(
    `NODE-31 file protocol v13: extension naturally recovered before showOptions ${JSON.stringify(recovery.info)}`,
  );

  const manager = await managementHandle(sessionBase);
  await switchWindow(sessionBase, manager);
  const showResult = await driverJson(`${sessionBase}/execute/async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      script: `const extensionId = arguments[0];
        const done = arguments[arguments.length - 1];
        Promise.resolve(chrome.developerPrivate.showOptions(extensionId))
          .then(() => done({ ok: true }))
          .catch((error) => done({ ok: false, error: String(error?.stack ?? error) }));`,
      args: [extensionId],
    }),
  });
  if (showResult?.ok !== true) {
    await switchWindow(sessionBase, originalHandle).catch(() => undefined);
    throw new Error(`NODE-31 V13 developerPrivate.showOptions failed: ${showResult?.error}`);
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
        `NODE-31 file protocol v13: Chrome opened authorized extension target ${extensionTarget.handle} ${extensionTarget.url}`,
      );
      return extensionTarget;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  await switchWindow(sessionBase, originalHandle).catch(() => undefined);
  throw new Error(
    `NODE-31 V13 showOptions did not expose an authorized extension target: ${JSON.stringify(lastDiagnostics)}`,
  );
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url === "http://127.0.0.1:9515/session" && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const chromeOptions = body?.capabilities?.alwaysMatch?.["goog:chromeOptions"];
    if (!chromeOptions || typeof chromeOptions !== "object") {
      throw new Error("NODE-31 V13 could not locate goog:chromeOptions in ChromeDriver session request");
    }
    chromeOptions.enableExtensionTargets = true;
    init = { ...init, body: JSON.stringify(body) };
    console.log("NODE-31 file protocol v13: enabling ChromeDriver extension target introspection");
  }

  const executeMatch = url.match(/^http:\/\/127\.0\.0\.1:9515\/session\/([^/]+)\/execute\/async$/);
  if (executeMatch && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    if (
      typeof body?.script === "string" &&
      body.script.includes("chrome.developerPrivate.updateExtensionConfiguration") &&
      Array.isArray(body.args) &&
      typeof body.args[0] === "string" &&
      typeof body.args[1] === "boolean"
    ) {
      const sessionBase = `http://127.0.0.1:9515/session/${executeMatch[1]}`;
      const extensionId = body.args[0];
      const enabled = body.args[1];
      await sampleTimeline(sessionBase, extensionId, `before-file-access-${enabled ? "enable" : "disable"}`, 300);
      const response = await nativeFetch(input, init);
      const payload = await response.clone().json().catch(() => null);
      if (!response.ok || payload?.value?.error) return response;
      await sampleTimeline(sessionBase, extensionId, `after-file-access-${enabled ? "enable" : "disable"}`, 3000);
      return response;
    }
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
        `NODE-31 file protocol v13: waiting for natural extension recovery before Chrome-owned showOptions(${extensionId})`,
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
