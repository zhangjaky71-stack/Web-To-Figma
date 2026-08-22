import {
  CDP_COMPUTED_STYLE_PROPERTIES,
  normalizeCdpCapture,
  type CdpCaptureResult,
  type CdpDomSnapshotResponse,
  type CdpFrameTreeResponse,
  type CdpLayoutMetricsResponse,
  type CdpScreenshotResponse,
} from "@w2f/cdp-capture-adapter";
import type { RawCaptureTarget } from "@w2f/capture-core";

export const CDP_REQUIRED_PROTOCOL_VERSION = "1.3" as const;

export interface CdpRuntimeCapability {
  buildProfile: "standard" | "high-fidelity";
  debuggerPermission: boolean;
  available: boolean;
  reason: string;
}

function manifestHasDebuggerPermission(): boolean {
  return chrome.runtime.getManifest().permissions?.includes("debugger") === true;
}

export function getCdpRuntimeCapability(): CdpRuntimeCapability {
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

async function command<T extends Record<string, unknown>>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return (await chrome.debugger.sendCommand(target, method, params)) as T;
}

function readDevicePixelRatio(value: Record<string, unknown>): number {
  const result = value.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) return 1;
  const observed = (result as Record<string, unknown>).value;
  return typeof observed === "number" && Number.isFinite(observed) && observed > 0 ? observed : 1;
}

export async function captureHighFidelityWithCdp(
  tabId: number,
  captureTarget: RawCaptureTarget,
  fallbackUrl?: string,
  fallbackTitle?: string,
): Promise<CdpCaptureResult> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available) throw new Error(capability.reason);

  const target: chrome.debugger.Debuggee = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
    attached = true;

    await Promise.all([
      command(target, "Page.enable"),
      command(target, "DOMSnapshot.enable"),
    ]);

    const [domSnapshot, layoutMetrics, frameTree, dprEvaluation, screenshot] = await Promise.all([
      command<CdpDomSnapshotResponse>(target, "DOMSnapshot.captureSnapshot", {
        computedStyles: [...CDP_COMPUTED_STYLE_PROPERTIES],
        includePaintOrder: true,
        includeDOMRects: true,
        includeBlendedBackgroundColors: false,
        includeTextColorOpacities: false,
      }),
      command<CdpLayoutMetricsResponse>(target, "Page.getLayoutMetrics"),
      command<CdpFrameTreeResponse>(target, "Page.getFrameTree"),
      command(target, "Runtime.evaluate", {
        expression: "window.devicePixelRatio",
        returnByValue: true,
        silent: true,
      }),
      command<CdpScreenshotResponse>(target, "Page.captureScreenshot", {
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
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}
