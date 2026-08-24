import type { WtfRenderNode } from "@w2f/w2f-ir";
import { createBasicFigmaRenderPlan, committedRootPluginData } from "./planner.js";
import { createVisualRenderPlan, type W2fVisualRenderPlan } from "./visual-plan.js";
import { resolveFontRequests } from "./text/font-resolver.js";
import type { W2fFontResolution } from "./text/types.js";
import {
  W2fRichRendererError,
  type W2fRichFigmaAdapter,
  type W2fRichRendererInput,
  type W2fRichRenderResult,
  type W2fValidatedAssetPayload,
} from "./rich-types.js";

const FIGMA_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const FIGMA_IMAGE_MAX_DIMENSION = 4096;

function renderNodesById(input: W2fRichRendererInput): ReadonlyMap<string, WtfRenderNode> {
  return new Map(input.renderTree.nodes.map((node) => [node.id, node]));
}

function assetsById(input: W2fRichRendererInput): ReadonlyMap<string, W2fValidatedAssetPayload> {
  const output = new Map<string, W2fValidatedAssetPayload>();
  for (const asset of input.assets ?? []) {
    if (output.has(asset.id)) {
      throw new W2fRichRendererError(
        "W2F_RENDERER_ASSET_MISSING",
        `Duplicate validated asset payload ${asset.id}`,
      );
    }
    output.set(asset.id, asset);
  }
  return output;
}

function includedIds(
  sourceRootId: string | undefined,
  nodePlans: readonly { renderNodeId: string }[],
): string[] {
  return [
    ...(sourceRootId ? [sourceRootId] : []),
    ...nodePlans.map((plan) => plan.renderNodeId),
  ];
}

function svgAssetForNode(
  node: WtfRenderNode,
  assets: ReadonlyMap<string, W2fValidatedAssetPayload>,
): W2fValidatedAssetPayload | undefined {
  for (const assetId of node.assetRefs ?? []) {
    const asset = assets.get(assetId);
    if (asset?.mediaType === "image/svg+xml") return asset;
  }
  return undefined;
}

function assertImageAsset(asset: W2fValidatedAssetPayload | undefined, assetId: string): W2fValidatedAssetPayload {
  if (!asset) {
    throw new W2fRichRendererError(
      "W2F_RENDERER_ASSET_MISSING",
      `Validated image payload ${assetId} is missing`,
    );
  }
  if (!FIGMA_IMAGE_MEDIA_TYPES.has(asset.mediaType)) {
    throw new W2fRichRendererError(
      "W2F_RENDERER_IMAGE_UNSUPPORTED",
      `Image asset ${assetId} uses unsupported Figma image type ${asset.mediaType}`,
    );
  }
  if (!asset.bytes || asset.bytes.byteLength === 0) {
    throw new W2fRichRendererError(
      "W2F_RENDERER_ASSET_MISSING",
      `Image asset ${assetId} has no validated embedded bytes`,
    );
  }
  if (
    (asset.width !== undefined && asset.width > FIGMA_IMAGE_MAX_DIMENSION) ||
    (asset.height !== undefined && asset.height > FIGMA_IMAGE_MAX_DIMENSION)
  ) {
    throw new W2fRichRendererError(
      "W2F_RENDERER_IMAGE_TILE_REQUIRED",
      `Image asset ${assetId} exceeds Figma's 4096px image limit and requires tiled fallback`,
    );
  }
  return asset;
}

function visualPlansForIds(
  ids: readonly string[],
  nodes: ReadonlyMap<string, WtfRenderNode>,
): ReadonlyMap<string, W2fVisualRenderPlan> {
  const plans = new Map<string, W2fVisualRenderPlan>();
  for (const id of ids) {
    const node = nodes.get(id);
    if (!node) {
      throw new W2fRichRendererError(
        "W2F_RENDERER_RICH_ADAPTER",
        `Basic render plan references missing render node ${id}`,
      );
    }
    plans.set(id, createVisualRenderPlan(node));
  }
  return plans;
}

function fontRequests(plans: ReadonlyMap<string, W2fVisualRenderPlan>) {
  return [...plans.values()].flatMap((plan) => plan.text?.ranges.map((range) => range.font) ?? []);
}

async function preflightFonts<TNode, TImage>(
  plans: ReadonlyMap<string, W2fVisualRenderPlan>,
  adapter: W2fRichFigmaAdapter<TNode, TImage>,
): Promise<{
  resolutions: readonly W2fFontResolution[];
  byKey: ReadonlyMap<string, W2fFontResolution>;
}> {
  const requests = fontRequests(plans);
  if (requests.length === 0) return { resolutions: [], byKey: new Map() };
  const available = await adapter.listAvailableFonts();
  const resolutions = resolveFontRequests(requests, available);
  const unavailable = resolutions.filter((resolution) => resolution.level === "C");
  if (unavailable.length > 0) {
    throw new W2fRichRendererError(
      "W2F_RENDERER_FONT_UNAVAILABLE",
      unavailable.map((resolution) => resolution.diagnostic).join("; "),
    );
  }

  const loaded = new Set<string>();
  for (const resolution of resolutions) {
    if (resolution.level === "C") continue;
    const key = `${resolution.resolvedFamily}\u0000${resolution.resolvedStyle}`;
    if (loaded.has(key)) continue;
    try {
      await adapter.loadFont({
        family: resolution.resolvedFamily,
        style: resolution.resolvedStyle,
      });
    } catch (error) {
      throw new W2fRichRendererError(
        "W2F_RENDERER_FONT_LOAD",
        `Failed to load Figma font ${resolution.resolvedFamily} ${resolution.resolvedStyle}`,
        { cause: error },
      );
    }
    loaded.add(key);
  }
  return {
    resolutions,
    byKey: new Map(resolutions.map((resolution) => [resolution.requested.key, resolution])),
  };
}

async function preflightImages<TNode, TImage>(
  plans: ReadonlyMap<string, W2fVisualRenderPlan>,
  assets: ReadonlyMap<string, W2fValidatedAssetPayload>,
  adapter: W2fRichFigmaAdapter<TNode, TImage>,
): Promise<ReadonlyMap<string, TImage>> {
  const requiredIds = new Set<string>();
  for (const plan of plans.values()) {
    for (const fill of plan.paint.fills) {
      if (fill.kind === "IMAGE") requiredIds.add(fill.assetId);
    }
  }

  const imageByCacheKey = new Map<string, TImage>();
  const imageByAssetId = new Map<string, TImage>();
  for (const assetId of [...requiredIds].sort((left, right) => left.localeCompare(right, "en-US"))) {
    const asset = assertImageAsset(assets.get(assetId), assetId);
    let image = imageByCacheKey.get(asset.cacheKey);
    if (image === undefined) {
      try {
        image = await adapter.prepareImage(asset);
      } catch (error) {
        throw new W2fRichRendererError(
          "W2F_RENDERER_IMAGE_UNSUPPORTED",
          `Figma rejected validated image asset ${assetId}`,
          { cause: error },
        );
      }
      imageByCacheKey.set(asset.cacheKey, image);
    }
    imageByAssetId.set(assetId, image);
  }
  return imageByAssetId;
}

function needsFrameForPaint(plan: W2fVisualRenderPlan): boolean {
  return plan.paint.border.mode === "PER_SIDE" && !plan.paint.border.nativeSingleStrokeCompatible;
}

export async function renderRichFigmaScene<TNode, TImage>(
  input: W2fRichRendererInput,
  adapter: W2fRichFigmaAdapter<TNode, TImage>,
): Promise<W2fRichRenderResult<TNode>> {
  const basicPlan = createBasicFigmaRenderPlan(input);
  const nodes = renderNodesById(input);
  const assets = assetsById(input);
  const ids = includedIds(basicPlan.root.sourceRenderNodeId, basicPlan.nodes);
  const visualPlans = visualPlansForIds(ids, nodes);
  const fontPreflight = await preflightFonts(visualPlans, adapter);
  const imagesByAssetId = await preflightImages(visualPlans, assets, adapter);

  for (const id of ids) {
    const node = nodes.get(id)!;
    if (node.kind !== "vector") continue;
    const svg = svgAssetForNode(node, assets);
    if (!svg?.sanitizedSvg) {
      throw new W2fRichRendererError(
        "W2F_RENDERER_SVG_UNAVAILABLE",
        `Vector render node ${node.id} has no NODE-23 sanitized SVG payload`,
      );
    }
  }

  const created: TNode[] = [];
  const nodesByRenderNodeId = new Map<string, TNode>();
  let svgNodeCount = 0;
  try {
    const root = adapter.createFrame();
    created.push(root);
    adapter.setName(root, basicPlan.root.name);
    adapter.setGeometry(root, basicPlan.root.geometry);
    for (const [key, value] of Object.entries(basicPlan.root.pluginData)) {
      adapter.setPluginData(root, key, value);
    }
    if (basicPlan.root.sourceRenderNodeId) {
      nodesByRenderNodeId.set(basicPlan.root.sourceRenderNodeId, root);
      const rootVisual = visualPlans.get(basicPlan.root.sourceRenderNodeId);
      if (rootVisual) await adapter.applyPaint(root, rootVisual.paint, imagesByAssetId);
    }

    for (const plan of basicPlan.nodes) {
      const source = nodes.get(plan.renderNodeId)!;
      const visual = visualPlans.get(plan.renderNodeId)!;
      let current: TNode;
      if (source.kind === "text") {
        if (source.childIds.length > 0) {
          throw new W2fRichRendererError(
            "W2F_RENDERER_RICH_ADAPTER",
            `Text render node ${source.id} cannot own scene children`,
          );
        }
        current = adapter.createText();
      } else if (source.kind === "vector") {
        const svg = svgAssetForNode(source, assets)!;
        current = adapter.createSvg(svg.sanitizedSvg!);
        svgNodeCount += 1;
      } else if (plan.nodeType === "FRAME" || needsFrameForPaint(visual)) {
        current = adapter.createFrame();
      } else {
        current = adapter.createRectangle();
      }
      created.push(current);
      adapter.setName(current, plan.name);
      for (const [key, value] of Object.entries(plan.pluginData)) {
        adapter.setPluginData(current, key, value);
      }
      const parent = plan.parentRenderNodeId
        ? nodesByRenderNodeId.get(plan.parentRenderNodeId)
        : root;
      if (!parent) {
        throw new W2fRichRendererError(
          "W2F_RENDERER_RICH_ADAPTER",
          `Missing Figma parent for render node ${plan.renderNodeId}`,
        );
      }
      adapter.appendChild(parent, current);

      if (visual.text) {
        await adapter.applyText(current, visual.text, fontPreflight.byKey);
      }
      adapter.setGeometry(current, plan.localGeometry);
      await adapter.applyPaint(current, visual.paint, imagesByAssetId);
      nodesByRenderNodeId.set(plan.renderNodeId, current);
    }

    const committed = committedRootPluginData(basicPlan.root.pluginData);
    for (const [key, value] of Object.entries(committed)) adapter.setPluginData(root, key, value);
    adapter.setName(root, basicPlan.root.name);
    adapter.validateRoot?.(root);
    adapter.setSelection?.([root]);
    adapter.focusNodes?.([root]);
    return {
      root,
      createdNodeCount: created.length,
      mappedRenderNodeIds: [...nodesByRenderNodeId.keys()],
      nodesByRenderNodeId,
      committed: true,
      fontResolutions: fontPreflight.resolutions,
      fontSubstitutionCount: fontPreflight.resolutions.filter((resolution) => resolution.level === "B")
        .length,
      preparedImageCount: new Set(imagesByAssetId.values()).size,
      svgNodeCount,
    };
  } catch (error) {
    for (let index = created.length - 1; index >= 0; index -= 1) {
      try {
        adapter.remove(created[index]!);
      } catch {
        // Best-effort cleanup continues so one adapter cleanup failure cannot strand the rest.
      }
    }
    if (error instanceof W2fRichRendererError) throw error;
    throw new W2fRichRendererError("W2F_RENDERER_RICH_ADAPTER", "Figma rich renderer transaction failed", {
      cause: error,
    });
  }
}
