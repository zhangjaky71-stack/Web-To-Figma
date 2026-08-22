(() => {
  type ContentProbeRequest = {
    type: "W2F_PROBE_PAGE";
    jobId: string;
    mode: "full-page" | "region";
  };

  type ShellGlobal = typeof globalThis & {
    __W2F_CONTENT_SHELL_INSTALLED__?: boolean;
  };

  function isProbeRequest(value: unknown): value is ContentProbeRequest {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      record.type === "W2F_PROBE_PAGE" &&
      typeof record.jobId === "string" &&
      (record.mode === "full-page" || record.mode === "region")
    );
  }

  const shellGlobal = globalThis as ShellGlobal;
  if (shellGlobal.__W2F_CONTENT_SHELL_INSTALLED__) return;
  shellGlobal.__W2F_CONTENT_SHELL_INSTALLED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isProbeRequest(message)) return false;

    const root = document.documentElement;
    const body = document.body;
    const documentWidth = Math.max(
      root.scrollWidth,
      root.offsetWidth,
      root.clientWidth,
      body?.scrollWidth ?? 0,
      body?.offsetWidth ?? 0,
    );
    const documentHeight = Math.max(
      root.scrollHeight,
      root.offsetHeight,
      root.clientHeight,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
    );

    sendResponse({
      type: "W2F_CONTENT_PROBE_RESULT",
      jobId: message.jobId,
      page: {
        url: location.href,
        title: document.title,
        documentWidth,
        documentHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    });
    return false;
  });
})();
