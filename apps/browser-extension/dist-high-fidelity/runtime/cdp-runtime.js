import { CDP_COMPUTED_STYLE_PROPERTIES, normalizeCdpCapture, } from "./cdp-capture-adapter/index.js";
export const CDP_REQUIRED_PROTOCOL_VERSION = "1.3";
function debuggerApi() {
    const runtime = globalThis;
    const api = runtime.chrome?.debugger;
    if (!api)
        throw new Error("Chrome debugger API is unavailable in this extension context");
    return api;
}
function manifestHasDebuggerPermission() {
    return chrome.runtime.getManifest().permissions?.includes("debugger") === true;
}
export function getCdpRuntimeCapability() {
    const debuggerPermission = manifestHasDebuggerPermission();
    return {
        buildProfile: debuggerPermission ? "high-fidelity" : "standard",
        debuggerPermission,
        available: debuggerPermission,
        reason: debuggerPermission
            ? "High Fidelity build includes the explicit Chrome debugger permission."
            : "Standard build intentionally excludes Chrome debugger permission.",
    };
}
async function command(api, target, method, params) {
    return (await api.sendCommand(target, method, params));
}
function readDevicePixelRatio(value) {
    const result = value.result;
    if (typeof result !== "object" || result === null || Array.isArray(result))
        return 1;
    const observed = result.value;
    return typeof observed === "number" && Number.isFinite(observed) && observed > 0 ? observed : 1;
}
export async function captureHighFidelityWithCdp(tabId, captureTarget, fallbackUrl, fallbackTitle) {
    const capability = getCdpRuntimeCapability();
    if (!capability.available)
        throw new Error(capability.reason);
    const api = debuggerApi();
    const target = { tabId };
    let attached = false;
    try {
        await api.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
        attached = true;
        await Promise.all([
            command(api, target, "Page.enable"),
            command(api, target, "DOMSnapshot.enable"),
        ]);
        const [domSnapshot, layoutMetrics, frameTree, dprEvaluation, screenshot] = await Promise.all([
            command(api, target, "DOMSnapshot.captureSnapshot", {
                computedStyles: [...CDP_COMPUTED_STYLE_PROPERTIES],
                includePaintOrder: true,
                includeDOMRects: true,
                includeBlendedBackgroundColors: false,
                includeTextColorOpacities: false,
            }),
            command(api, target, "Page.getLayoutMetrics"),
            command(api, target, "Page.getFrameTree"),
            command(api, target, "Runtime.evaluate", {
                expression: "window.devicePixelRatio",
                returnByValue: true,
                silent: true,
            }),
            command(api, target, "Page.captureScreenshot", {
                format: "png",
                fromSurface: true,
                captureBeyondViewport: true,
                optimizeForSpeed: true,
                ...(captureTarget.type === "region"
                    ? {
                        clip: {
                            x: captureTarget.bounds.x,
                            y: captureTarget.bounds.y,
                            width: captureTarget.bounds.width,
                            height: captureTarget.bounds.height,
                            scale: 1,
                        },
                    }
                    : {}),
            }),
        ]);
        return normalizeCdpCapture({
            captureTarget,
            capturedAt: new Date().toISOString(),
            evidence: {
                domSnapshot,
                layoutMetrics,
                frameTree,
                screenshot,
                devicePixelRatio: readDevicePixelRatio(dprEvaluation),
            },
            ...(fallbackUrl === undefined ? {} : { fallbackUrl }),
            ...(fallbackTitle === undefined ? {} : { fallbackTitle }),
        });
    }
    finally {
        if (attached)
            await api.detach(target).catch(() => undefined);
    }
}
//# sourceMappingURL=cdp-runtime.js.map