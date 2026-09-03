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
    throw new Error(
      `NODE-31 V11 ChromeDriver helper failed: ${response.status} ${JSON.stringify(payload)}`,
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

async function readRegistryInfo(sessionBase, extensionId) {
  return driverJson(`${sessionBase}/execute/async`, {
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
            fileAccess: info.fileAccess ?? null,
            optionsPage: info.optionsPage ?? null,
            views: info.views ?? []
          });
        });`,
      args: [extensionId],
    }),
  });
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
      `NODE-31 V11 could not locate chrome://extensions handle: ${JSON.stringify(management.diagnostics)}`,
    );
  }

  const registryInfo = await readRegistryInfo(sessionBase, extensionId);
  console.log(
    `NODE-31 file protocol v11: pre-showOptions registry diagnostics ${JSON.stringify(registryInfo)}`,
  );
  if (registryInfo?.ok !== true) {
    throw new Error(`NODE-31 V11 cannot read extension registry state: ${registryInfo?.error}`);
  }
  if (registryInfo?.state !== "ENABLED") {
    throw new Error(
      `NODE-31 V11 refuses legacy registry mutation; BiDi extension is not ENABLED: ${JSON.stringify(registryInfo)}`,
    );
  }
  if (registryInfo?.fileAccess?.isActive !== true) {
    throw new Error("NODE-31 V11 explicit file access is not active before opening options");
  }

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
    throw new Error(`NODE-31 V11 developerPrivate.showOptions failed: ${showResult?.error}`);
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
        `NODE-31 file protocol v11: Chrome opened authorized extension target ${extensionTarget.handle} ${extensionTarget.url}`,
      );
      return extensionTarget;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  await switchWindow(sessionBase, originalHandle).catch(() => undefined);
  throw new Error(
    `NODE-31 V11 showOptions did not expose an authorized extension target: ${JSON.stringify(lastDiagnostics)}`,
  );
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url === "http://127.0.0.1:9515/session" && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const chromeOptions = body?.capabilities?.alwaysMatch?.["goog:chromeOptions"];
    if (!chromeOptions || typeof chromeOptions !== "object") {
      throw new Error("NODE-31 V11 could not locate goog:chromeOptions in ChromeDriver session request");
    }
    chromeOptions.enableExtensionTargets = true;
    init = { ...init, body: JSON.stringify(body) };
    console.log("NODE-31 file protocol v11: enabling ChromeDriver extension target introspection");
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
        `NODE-31 file protocol v11: replacing synthetic extension navigation with Chrome-owned showOptions(${extensionId})`,
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
