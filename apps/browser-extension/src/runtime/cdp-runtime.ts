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

interface ChromeDebuggee {
  tabId?: number;
  targetId?: string;
  extensionId?: string;
  sessionId?: string;
}

interface ChromeDebuggerApi {
  attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
  detach(target: ChromeDebuggee): Promise<void>;
  sendCommand(
    target: ChromeDebuggee,
    method: string,
    commandParams?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

interface CdpPageResource {
  url: string;
  type?: string;
  mimeType?: string;
}

interface CdpResourceTreeNode {
  frame: { id: string; url?: string };
  resources?: CdpPageResource[];
  childFrames?: CdpResourceTreeNode[];
}

interface CdpResourceTreeResponse {
  frameTree: CdpResourceTreeNode;
}

interface CdpResourceContentResponse {
  content: string;
  base64Encoded: boolean;
}

export interface CdpRuntimeCapability {
  buildProfile: "standard" | "high-fidelity";
  debuggerPermission: boolean;
  available: boolean;
  reason: string;
}

export interface CdpRecoveredResource {
  url: string;
  frameId: string;
  bytes: number[];
  mediaTypeHint?: string;
}

function debuggerApi(): ChromeDebuggerApi {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { debugger?: ChromeDebuggerApi };
  };
  const api = runtime.chrome?.debugger;
  if (!api) throw new Error("Chrome debugger API is unavailable in this extension context");
  return api;
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

async function command<T>(
  api: ChromeDebuggerApi,
  target: ChromeDebuggee,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return (await api.sendCommand(target, method, params)) as T;
}

function readDevicePixelRatio(value: Record<string, unknown>): number {
  const result = value.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) return 1;
  const observed = (result as Record<string, unknown>).value;
  return typeof observed === "number" && Number.isFinite(observed) && observed > 0 ? observed : 1;
}

function resourceKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url.split("#", 1)[0] ?? url;
  }
}

function collectResources(
  tree: CdpResourceTreeNode,
  map: Map<string, { frameId: string; resource: CdpPageResource }>,
): void {
  for (const resource of tree.resources ?? []) {
    const key = resourceKey(resource.url);
    if (!map.has(key)) map.set(key, { frameId: tree.frame.id, resource });
  }
  for (const child of tree.childFrames ?? []) collectResources(child, map);
}

function decodeCdpContent(response: CdpResourceContentResponse): number[] {
  if (!response.base64Encoded) return [...new TextEncoder().encode(response.content)];
  const binary = atob(response.content);
  const bytes = new Array<number>(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function fetchHighFidelityResourceContents(
  tabId: number,
  urls: string[],
): Promise<CdpRecoveredResource[]> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available || urls.length === 0) return [];

  const api = debuggerApi();
  const target: ChromeDebuggee = { tabId };
  let attached = false;
  try {
    await api.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
    attached = true;
    await command(api, target, "Page.enable");
    const resourceTree = await command<CdpResourceTreeResponse>(
      api,
      target,
      "Page.getResourceTree",
    );
    const resourceMap = new Map<string, { frameId: string; resource: CdpPageResource }>();
    collectResources(resourceTree.frameTree, resourceMap);

    const results: CdpRecoveredResource[] = [];
    for (const url of [...new Set(urls.map((value) => value.trim()).filter(Boolean))]) {
      const matched = resourceMap.get(resourceKey(url));
      if (!matched) continue;
      try {
        const content = await command<CdpResourceContentResponse>(
          api,
          target,
          "Page.getResourceContent",
          { frameId: matched.frameId, url: matched.resource.url },
        );
        results.push({
          url,
          frameId: matched.frameId,
          bytes: decodeCdpContent(content),
          ...(matched.resource.mimeType ? { mediaTypeHint: matched.resource.mimeType } : {}),
        });
      } catch {
        // Keep the original native-fetch diagnostic when CDP cannot recover one resource.
      }
    }
    return results;
  } finally {
    if (attached) await api.detach(target).catch(() => undefined);
  }
}

export async function captureHighFidelityWithCdp(
  tabId: number,
  captureTarget: RawCaptureTarget,
  fallbackUrl?: string,
  fallbackTitle?: string,
): Promise<CdpCaptureResult> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available) throw new Error(capability.reason);

  const api = debuggerApi();
  const target: ChromeDebuggee = { tabId };
  let attached = false;
  try {
    await api.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
    attached = true;

    await Promise.all([
      command(api, target, "Page.enable"),
      command(api, target, "DOMSnapshot.enable"),
    ]);

    const [domSnapshot, layoutMetrics, frameTree, dprEvaluation, screenshot] = await Promise.all([
      command<CdpDomSnapshotResponse>(api, target, "DOMSnapshot.captureSnapshot", {
        computedStyles: [...CDP_COMPUTED_STYLE_PROPERTIES],
        includePaintOrder: true,
        includeDOMRects: true,
        includeBlendedBackgroundColors: false,
        includeTextColorOpacities: false,
      }),
      command<CdpLayoutMetricsResponse>(api, target, "Page.getLayoutMetrics"),
      command<CdpFrameTreeResponse>(api, target, "Page.getFrameTree"),
      command<Record<string, unknown>>(api, target, "Runtime.evaluate", {
        expression: "window.devicePixelRatio",
        returnByValue: true,
        silent: true,
      }),
      command<CdpScreenshotResponse>(api, target, "Page.captureScreenshot", {
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
    if (attached) await api.detach(target).catch(() => undefined);
  }
}
