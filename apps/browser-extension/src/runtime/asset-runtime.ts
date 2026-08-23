import {
  buildAssetCapture,
  isAssetCapture,
  type AssetCapture,
  type AssetHasher,
} from "@w2f/asset-resolver";
import type { RawSnapshot } from "@w2f/capture-core";
import {
  captureStandardAssetsInPage,
  type StandardAssetInput,
  type StandardAssetResult,
} from "@w2f/standard-capture-adapter";
import { buildStandardCascadeInput } from "./css-cascade-runtime.js";

export function assetSnapshotId(snapshot: RawSnapshot): string {
  return `snapshot:${snapshot.capturedAt}`;
}

export function buildStandardAssetInput(snapshot: RawSnapshot): StandardAssetInput {
  const cascadeInput = buildStandardCascadeInput(snapshot);
  return {
    frames: cascadeInput.frames,
    targets: cascadeInput.targets,
    maxAssets: 2_000,
    maxAssetBytes: 20 * 1024 * 1024,
    maxTotalBytes: 100 * 1024 * 1024,
  };
}

export const sha256AssetBytes: AssetHasher = async (bytes) => {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export async function captureAssetsForSnapshot(
  tabId: number,
  snapshot: RawSnapshot,
): Promise<AssetCapture> {
  const input = buildStandardAssetInput(snapshot);
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureStandardAssetsInPage,
    args: [input],
  });
  const result = injectionResults[0]?.result as StandardAssetResult | undefined;
  if (!result?.acquisition) throw new Error("Asset acquisition returned no evidence");
  const capture = await buildAssetCapture(
    {
      adapter: snapshot.adapter,
      snapshotId: assetSnapshotId(snapshot),
      acquisition: result.acquisition,
    },
    sha256AssetBytes,
  );
  if (!isAssetCapture(capture)) throw new Error("Asset sidecar validation failed");
  return capture;
}
