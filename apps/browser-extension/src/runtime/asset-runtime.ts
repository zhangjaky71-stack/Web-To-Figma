import {
  buildAssetCapture,
  isAssetCapture,
  type AssetAcquiredResource,
  type AssetAcquisitionResult,
  type AssetCapture,
  type AssetCaptureDiagnostic,
  type AssetHasher,
  type AssetResourceSourceType,
} from "@w2f/asset-resolver";
import type { RawNode, RawSnapshot } from "@w2f/capture-core";
import {
  captureStandardAssetsInPage,
  type StandardAssetInput,
  type StandardAssetResult,
} from "@w2f/standard-capture-adapter";
import { fetchHighFidelityResourceContents } from "./cdp-runtime.js";
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
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

function sourceTypeForRecovery(
  diagnostic: AssetCaptureDiagnostic,
  node: RawNode | undefined,
): AssetResourceSourceType {
  const url = diagnostic.sourceUrl?.toLowerCase() ?? "";
  const id = diagnostic.acquisitionId ?? "";
  if (url.startsWith("data:")) return "data-url";
  if (url.startsWith("blob:")) return "blob";
  if (/\.svg(?:[?#]|$)/i.test(url)) return "svg-external";
  if (id.includes(":css:background-image:")) return "css-background";
  if (id.includes(":css:mask-image:") || id.includes(":css:-webkit-mask-image:")) return "css-mask";
  if (id.includes(":css:border-image-source:")) return "css-border";
  if (id.includes(":css:content:")) return "css-content";
  if (id.includes(":video-poster:")) return "video-poster";
  if (node?.source.tagName?.toLowerCase() === "svg") return "svg-external";
  return "img";
}

function authoredSource(node: RawNode | undefined): string | undefined {
  const attributes = node?.source.attributes;
  if (!attributes) return undefined;
  const tagName = node.source.tagName?.toLowerCase();
  if (tagName === "video") return attributes.poster;
  if (tagName === "image") return attributes.href ?? attributes["xlink:href"];
  return attributes.src;
}

function frameOrigin(node: RawNode | undefined): string | undefined {
  const url = node?.frameContext.url;
  if (!url) return undefined;
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

function recoveredResource(
  diagnostic: AssetCaptureDiagnostic,
  resource: Awaited<ReturnType<typeof fetchHighFidelityResourceContents>>[number],
  node: RawNode | undefined,
): AssetAcquiredResource | undefined {
  if (!diagnostic.acquisitionId || !diagnostic.sourceUrl || resource.bytes.length === 0) {
    return undefined;
  }
  const authoredSrc = authoredSource(node);
  const sourceType = sourceTypeForRecovery(diagnostic, node);
  const tagName = node?.source.tagName?.toLowerCase();
  const recoveredFrameOrigin = frameOrigin(node);
  return {
    acquisitionId: diagnostic.acquisitionId,
    bytes: resource.bytes,
    ...(resource.mediaTypeHint ? { mediaTypeHint: resource.mediaTypeHint } : {}),
    ...(tagName === "img" || (tagName === "input" && node?.source.attributes?.type === "image")
      ? { currentSrc: diagnostic.sourceUrl }
      : {}),
    ...(authoredSrc ? { authoredSrc } : {}),
    ...(node?.geometry
      ? {
          displayWidth: node.geometry.bounds.width,
          displayHeight: node.geometry.bounds.height,
        }
      : {}),
    provenance: {
      sourceType,
      ...(diagnostic.sourceNodeId ? { sourceNodeId: diagnostic.sourceNodeId } : {}),
      sourceUrl: diagnostic.sourceUrl,
      ...(authoredSrc ? { originalUrl: authoredSrc } : {}),
      ...(node ? { frameId: node.frameContext.frameId } : { frameId: resource.frameId }),
      ...(recoveredFrameOrigin ? { frameOrigin: recoveredFrameOrigin } : {}),
      ...(sourceType === "css-background" ? { cssProperty: "background-image" } : {}),
      ...(sourceType === "css-mask" ? { cssProperty: "mask-image" } : {}),
      ...(sourceType === "css-border" ? { cssProperty: "border-image-source" } : {}),
      ...(sourceType === "css-content" ? { cssProperty: "content" } : {}),
    },
  };
}

async function recoverHighFidelityAssets(
  tabId: number,
  snapshot: RawSnapshot,
  acquisition: AssetAcquisitionResult,
): Promise<AssetAcquisitionResult> {
  if (snapshot.adapter !== "cdp") return acquisition;
  const failures = acquisition.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === "ASSET_FETCH_FAILED" &&
      Boolean(diagnostic.acquisitionId) &&
      Boolean(diagnostic.sourceUrl),
  );
  if (failures.length === 0) return acquisition;

  let recovered: Awaited<ReturnType<typeof fetchHighFidelityResourceContents>>;
  try {
    recovered = await fetchHighFidelityResourceContents(
      tabId,
      failures.flatMap((diagnostic) => (diagnostic.sourceUrl ? [diagnostic.sourceUrl] : [])),
    );
  } catch {
    return acquisition;
  }
  const byUrl = new Map(recovered.map((item) => [item.url, item]));
  const nodeById = new Map(snapshot.nodes.map((node) => [node.captureNodeId, node]));
  const recoveredIds = new Set<string>();
  const resources = [...acquisition.resources];

  for (const diagnostic of failures) {
    const resource = diagnostic.sourceUrl ? byUrl.get(diagnostic.sourceUrl) : undefined;
    if (!resource) continue;
    const acquired = recoveredResource(
      diagnostic,
      resource,
      diagnostic.sourceNodeId ? nodeById.get(diagnostic.sourceNodeId) : undefined,
    );
    if (!acquired) continue;
    resources.push(acquired);
    if (diagnostic.acquisitionId) recoveredIds.add(diagnostic.acquisitionId);
  }

  return {
    resources,
    diagnostics: acquisition.diagnostics.filter(
      (diagnostic) =>
        !(
          diagnostic.code === "ASSET_FETCH_FAILED" &&
          diagnostic.acquisitionId &&
          recoveredIds.has(diagnostic.acquisitionId)
        ),
    ),
  };
}

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
  const acquisition = await recoverHighFidelityAssets(tabId, snapshot, result.acquisition);
  const capture = await buildAssetCapture(
    {
      adapter: snapshot.adapter,
      snapshotId: assetSnapshotId(snapshot),
      acquisition,
    },
    sha256AssetBytes,
  );
  if (!isAssetCapture(capture)) throw new Error("Asset sidecar validation failed");
  return capture;
}
