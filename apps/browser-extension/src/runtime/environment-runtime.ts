import type { RawSnapshot } from "@w2f/capture-core";
import {
  createEnvironmentCapture,
  isEnvironmentCapture,
  type EnvironmentCapture,
  type EnvironmentMediaFeatureEvidence,
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

export function captureEnvironmentMediaFeaturesInPage(): EnvironmentMediaFeatureEvidence[] {
  const queries = [
    ["color-scheme-dark", "(prefers-color-scheme: dark)"],
    ["reduced-motion", "(prefers-reduced-motion: reduce)"],
    ["contrast-more", "(prefers-contrast: more)"],
    ["contrast-less", "(prefers-contrast: less)"],
    ["contrast-custom", "(prefers-contrast: custom)"],
    ["reduced-transparency", "(prefers-reduced-transparency: reduce)"],
    ["forced-colors", "(forced-colors: active)"],
    ["hover", "(hover: hover)"],
    ["any-hover", "(any-hover: hover)"],
    ["pointer-coarse", "(pointer: coarse)"],
    ["pointer-fine", "(pointer: fine)"],
    ["any-pointer-coarse", "(any-pointer: coarse)"],
    ["any-pointer-fine", "(any-pointer: fine)"],
  ] as const;

  return queries.map(([id, query]) => ({
    id,
    query,
    matches: matchMedia(query).matches,
    availability: "observed" as const,
  }));
}

export async function captureEnvironmentForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<EnvironmentCapture> {
  const input = buildStandardEnvironmentInput(snapshot);
  const [environmentResults, mediaFeatureResults] = await Promise.all([
    chrome.scripting.executeScript({
      target: { tabId },
      func: captureStandardEnvironmentInPage,
      args: [input],
    }),
    chrome.scripting.executeScript({
      target: { tabId },
      func: captureEnvironmentMediaFeaturesInPage,
      args: [],
    }),
  ]);
  const result = environmentResults[0]?.result as StandardEnvironmentResult | undefined;
  const mediaFeatures = mediaFeatureResults[0]?.result as
    EnvironmentMediaFeatureEvidence[] | undefined;
  if (!result?.capture) throw new Error("Environment acquisition returned no capture evidence");
  const capture = createEnvironmentCapture({
    ...result.capture,
    environment: {
      ...result.capture.environment,
      mediaFeatures: mediaFeatures ?? [],
    },
  });
  if (!isEnvironmentCapture(capture)) throw new Error("Environment sidecar validation failed");
  return capture;
}
