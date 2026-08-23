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
import type { RasterCapturedTileInput, RasterTilePlan } from "@w2f/pixel-ground-truth";

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

interface ActiveCdpSession {
  api: ChromeDebuggerApi;
  target: ChromeDebuggee;
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

export interface HighFidelityViewportOverride {
  width: number;
  height: number;
  dpr: number;
}

const activeSessions = new Map<number, ActiveCdpSession>();

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

async function withCdpSession<T>(
  tabId: number,
  operation: (session: ActiveCdpSession) => Promise<T>,
): Promise<T> {
  const existing = activeSessions.get(tabId);
  if (existing) return operation(existing);

  const capability = getCdpRuntimeCapability();
  if (!capability.available) throw new Error(capability.reason);
  const api = debuggerApi();
  const target: ChromeDebuggee = { tabId };
  let attached = false;
  try {
    await api.attach(target, CDP_REQUIRED_PROTOCOL_VERSION);
    attached = true;
    const session = { api, target } satisfies ActiveCdpSession;
    activeSessions.set(tabId, session);
    return await operation(session);
  } finally {
    activeSessions.delete(tabId);
    if (attached) await api.detach(target).catch(() => undefined);
  }
}

function normalizedViewportOverride(
  value: HighFidelityViewportOverride,
): HighFidelityViewportOverride {
  const width = Math.round(value.width);
  const height = Math.round(value.height);
  const dpr = value.dpr;
  if (!Number.isSafeInteger(width) || width < 240 || width > 10_000) {
    throw new TypeError("responsive viewport width must be an integer between 240 and 10000");
  }
  if (!Number.isSafeInteger(height) || height < 240 || height > 10_000) {
    throw new TypeError("responsive viewport height must be an integer between 240 and 10000");
  }
  if (!Number.isFinite(dpr) || dpr < 0.5 || dpr > 8) {
    throw new TypeError("responsive viewport dpr must be between 0.5 and 8");
  }
  return { width, height, dpr };
}

export async function withHighFidelityViewportOverride<T>(
  tabId: number,
  viewport: HighFidelityViewportOverride,
  operation: () => Promise<T>,
): Promise<T> {
  const normalized = normalizedViewportOverride(viewport);
  return withCdpSession(tabId, async ({ api, target }) => {
    await command(api, target, "Emulation.setDeviceMetricsOverride", {
      width: normalized.width,
      height: normalized.height,
      deviceScaleFactor: normalized.dpr,
      mobile: false,
      screenWidth: normalized.width,
      screenHeight: normalized.height,
    });
    try {
      return await operation();
    } finally {
      await command(api, target, "Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    }
  });
}

function readDevicePixelRatio(value: Record<string, unknown>): number {
  const result = value.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) return 1;
  const observed = (result as Record<string, unknown>).value;
  return typeof observed === "number" && Number.isFinite(observed) && observed > 0 ? observed : 1;
}

function decodeBase64Bytes(value: string): number[] {
  const binary = atob(value);
  const bytes = new Array<number>(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
  return response.base64Encoded
    ? decodeBase64Bytes(response.content)
    : [...new TextEncoder().encode(response.content)];
}

export async function fetchHighFidelityResourceContents(
  tabId: number,
  urls: string[],
): Promise<CdpRecoveredResource[]> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available || urls.length === 0) return [];

  return withCdpSession(tabId, async ({ api, target }) => {
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
  });
}

export async function captureHighFidelityRasterTiles(
  tabId: number,
  plans: RasterTilePlan[],
  dpr: number,
): Promise<RasterCapturedTileInput[]> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available) throw new Error(capability.reason);
  if (!Number.isFinite(dpr) || dpr <= 0) throw new TypeError("raster dpr must be positive");
  if (plans.length === 0) return [];

  return withCdpSession(tabId, async ({ api, target }) => {
    await command(api, target, "Page.enable");
    const tiles: RasterCapturedTileInput[] = [];
    for (const plan of plans) {
      const screenshot = await command<CdpScreenshotResponse>(
        api,
        target,
        "Page.captureScreenshot",
        {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: true,
          optimizeForSpeed: true,
          clip: {
            x: plan.bounds.x,
            y: plan.bounds.y,
            width: plan.bounds.width,
            height: plan.bounds.height,
            scale: dpr,
          },
        },
      );
      tiles.push({
        ...plan,
        bounds: { ...plan.bounds },
        bytes: decodeBase64Bytes(screenshot.data),
        mediaType: "image/png",
      });
    }
    return tiles;
  });
}

export async function captureHighFidelityWithCdp(
  tabId: number,
  captureTarget: RawCaptureTarget,
  fallbackUrl?: string,
  fallbackTitle?: string,
): Promise<CdpCaptureResult> {
  const capability = getCdpRuntimeCapability();
  if (!capability.available) throw new Error(capability.reason);

  return withCdpSession(tabId, async ({ api, target }) => {
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
  });
}
