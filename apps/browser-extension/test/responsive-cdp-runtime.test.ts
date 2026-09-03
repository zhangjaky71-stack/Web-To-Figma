import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureHighFidelityRasterTiles,
  withHighFidelityViewportOverride,
} from "../src/runtime/cdp-runtime.js";

const originalChrome = (globalThis as typeof globalThis & { chrome?: unknown }).chrome;

afterEach(() => {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: originalChrome,
  });
});

function installDebuggerMock(options?: { attachedTabId?: number }) {
  const methods: string[] = [];
  const attach = vi.fn(async () => undefined);
  const detach = vi.fn(async () => undefined);
  const getTargets = vi.fn(async () =>
    options?.attachedTabId === undefined
      ? []
      : [
          {
            id: `target-${options.attachedTabId}`,
            type: "page",
            title: "occupied target",
            url: "https://example.test/",
            attached: true,
            tabId: options.attachedTabId,
          },
        ],
  );
  const sendCommand = vi.fn(async (_target: unknown, method: string) => {
    methods.push(method);
    if (method === "Page.captureScreenshot") return { data: "AQID" };
    return {};
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: {
      runtime: {
        getManifest: () => ({ permissions: ["debugger"] }),
      },
      debugger: { attach, detach, getTargets, sendCommand },
    },
  });
  return { methods, attach, detach, getTargets };
}

describe("responsive CDP session orchestration", () => {
  it("reuses one debugger attachment for nested tile capture and restores metrics", async () => {
    const mock = installDebuggerMock();
    const tiles = await withHighFidelityViewportOverride(
      42,
      { width: 390, height: 800, dpr: 2 },
      () =>
        captureHighFidelityRasterTiles(
          42,
          [
            {
              id: "viewport:390x800@2:r0:c0",
              row: 0,
              column: 0,
              bounds: { x: 0, y: 0, width: 390, height: 800 },
              pixelWidth: 780,
              pixelHeight: 1600,
            },
          ],
          2,
        ),
    );

    expect(tiles[0]?.bytes).toEqual([1, 2, 3]);
    expect(mock.getTargets).toHaveBeenCalledTimes(1);
    expect(mock.attach).toHaveBeenCalledTimes(1);
    expect(mock.detach).toHaveBeenCalledTimes(1);
    expect(mock.methods).toEqual([
      "Emulation.setDeviceMetricsOverride",
      "Page.enable",
      "Page.captureScreenshot",
      "Emulation.clearDeviceMetricsOverride",
    ]);
  });

  it("clears device metrics and detaches when a responsive child capture fails", async () => {
    const mock = installDebuggerMock();
    await expect(
      withHighFidelityViewportOverride(7, { width: 768, height: 800, dpr: 1 }, async () => {
        throw new Error("fixture failure");
      }),
    ).rejects.toThrow("fixture failure");
    expect(mock.methods).toEqual([
      "Emulation.setDeviceMetricsOverride",
      "Emulation.clearDeviceMetricsOverride",
    ]);
    expect(mock.detach).toHaveBeenCalledTimes(1);
  });

  it("fails before attach when the target is already owned by another debugger", async () => {
    const mock = installDebuggerMock({ attachedTabId: 42 });

    await expect(
      withHighFidelityViewportOverride(
        42,
        { width: 390, height: 800, dpr: 2 },
        async () => undefined,
      ),
    ).rejects.toThrow(
      "High Fidelity debugger transport is unavailable because tab 42 already has an attached debugger",
    );

    expect(mock.getTargets).toHaveBeenCalledTimes(1);
    expect(mock.attach).not.toHaveBeenCalled();
    expect(mock.detach).not.toHaveBeenCalled();
    expect(mock.methods).toEqual([]);
  });
});
