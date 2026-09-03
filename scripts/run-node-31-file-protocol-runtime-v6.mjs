const nativeFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === "http://127.0.0.1:9515/session" && init.method === "POST" && init.body) {
    const body = JSON.parse(String(init.body));
    const chromeOptions = body?.capabilities?.alwaysMatch?.["goog:chromeOptions"];
    if (!chromeOptions || typeof chromeOptions !== "object") {
      throw new Error("NODE-31 V6 could not locate goog:chromeOptions in ChromeDriver session request");
    }
    chromeOptions.enableExtensionTargets = true;
    init = {
      ...init,
      body: JSON.stringify(body),
    };
    console.log("NODE-31 file protocol v6: enabling ChromeDriver extension target introspection");
  }
  return nativeFetch(input, init);
};

try {
  await import("./run-node-31-file-protocol-runtime-v5.mjs");
} finally {
  globalThis.fetch = nativeFetch;
}
