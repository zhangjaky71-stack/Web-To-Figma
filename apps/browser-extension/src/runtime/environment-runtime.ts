import type { RawSnapshot } from "@w2f/capture-core";
import {
  createEnvironmentCapture,
  isEnvironmentCapture,
  type EnvironmentCapture,
} from "@w2f/environment-capture";
import {
  captureStandardEnvironmentInPage,
  type StandardEnvironmentInput,
  type StandardEnvironmentResult,
} from "@w2f/standard-capture-adapter";
import { buildStandardCascadeInput } from "./css-cascade-runtime.js";

export function environmentSnapshotId(snapshot: RawSnapshot): string {
  return `snapshot:${snapshot.capturedAt}`;
}

export function buildStandardEnvironmentInput(snapshot: RawSnapshot): StandardEnvironmentInput {
  const cascadeInput = buildStandardCascadeInput(snapshot);
  const scale = snapshot.environment.scale;
  return {
    adapter: snapshot.adapter,
    snapshotId: environmentSnapshotId(snapshot),
    frames: cascadeInput.frames,
    targets: cascadeInput.targets,
    scale: {
      ...(scale.context.browserPageZoom === undefined
        ? {}
        : { pageZoom: scale.context.browserPageZoom }),
      pageZoomAvailability: scale.browserPageZoomAvailability,
      ...(scale.context.visualViewportScale === undefined
        ? {}
        : { visualViewportScale: scale.context.visualViewportScale }),
      ...(scale.context.cssZoom === undefined ? {} : { cssZoom: scale.context.cssZoom }),
      cssZoomAvailability: scale.cssZoomAvailability,
    },
  };
}

export async function captureEnvironmentForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<EnvironmentCapture> {
  const input = buildStandardEnvironmentInput(snapshot);
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureStandardEnvironmentInPage,
    args: [input],
  });
  const result = injectionResults[0]?.result as StandardEnvironmentResult | undefined;
  if (!result?.capture) throw new Error("Environment acquisition returned no capture evidence");
  const capture = createEnvironmentCapture(result.capture);
  if (!isEnvironmentCapture(capture)) throw new Error("Environment sidecar validation failed");
  return capture;
}
