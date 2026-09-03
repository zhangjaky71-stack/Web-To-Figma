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
    throw new Error(`NODE-31 V7 ChromeDriver helper failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload?.value;
}

async function findAuthorizedExtensionTarget(sessionId, extensionUrl) {
  const sessionBase = `http://127.0.0.1:9515/session/${sessionId}`;
  const originalHandle = await driverJson(`${sessionBase}/window`);
  const handles = await driverJson(`${sessionBase}/window/handles`);
  const diagnostics = [];

  for (const handle of handles ?? []) {
    try {
      await driverJson(`${sessionBase}/window`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const currentUrl = await driverJson(`${sessionBase}/url`);
      diagnostics.push({ handle, url: currentUrl });
      if (typeof currentUrl === "string" && currentUrl.startsWith(extensionUrl)) {
        console.log(
          `NODE-31 file protocol v7: reusing authorized extension target ${handle} ${currentUrl}`,
        );
        return { handle, url: currentUrl, diagnostics };
      }
    } catch (error) {
      diagnostics.push({ handle, error: String(error) });
    }
  }

  await driverJson(`${sessionBase}/window`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: originalHandle }),
  }).catch(() => undefined);
  console.log(`NODE-31 file protocol v7: no authorized extension target ${JSON.stringify(diagnostics)}`);
  return null;
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url === "http://127.0.0.1:9515/session" && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const chromeOptions = body?.capabilities?.alwaysMatch?.["goog:chromeOptions"];
    if (!chromeOptions || typeof chromeOptions !== "object") {
      throw new Error("NODE-31 V7 could not locate goog:chromeOptions in ChromeDriver session request");
    }
    chromeOptions.enableExtensionTargets = true;
    init = { ...init, body: JSON.stringify(body) };
    console.log("NODE-31 file protocol v7: enabling ChromeDriver extension target introspection");
  }

  const navigationMatch = url.match(/^http:\/\/127\.0\.0\.1:9515\/session\/([^/]+)\/url$/);
  if (navigationMatch && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    if (typeof body?.url === "string" && body.url.startsWith("chrome-extension://")) {
      const extensionRootUrl = body.url.match(/^chrome-extension:\/\/[^/]+\//)?.[0];
      if (extensionRootUrl) {
        const existing = await findAuthorizedExtensionTarget(navigationMatch[1], extensionRootUrl);
        if (existing) {
          console.log(
            `NODE-31 file protocol v7: substituting direct extension-page navigation with existing authorized target ${existing.url}`,
          );
          return jsonResponse(null);
        }
      }
    }
  }

  return nativeFetch(input, init);
};

try {
  await import("./run-node-31-file-protocol-runtime-v5.mjs");
} finally {
  globalThis.fetch = nativeFetch;
}
