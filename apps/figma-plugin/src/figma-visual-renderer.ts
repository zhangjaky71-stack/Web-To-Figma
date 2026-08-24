import type {
  WtfAssetRecord,
  WtfColor,
  WtfPaintFill,
  WtfPaintModel,
  WtfRenderNode,
  WtfRenderTree,
  WtfTextModel,
  WtfTextRun,
} from "@w2f/w2f-ir";

export interface W2fVisualAssetBundle {
  assets: readonly WtfAssetRecord[];
  assetPayloadsById: Readonly<Record<string, Uint8Array>>;
  sanitizedSvgById: Readonly<Record<string, string>>;
}

export interface W2fVisualRenderStats {
  paintedNodeCount: number;
  textNodeCount: number;
  imageFillCount: number;
  editableSvgCount: number;
  fontFallbackCount: number;
  missingAssetCount: number;
}

type BasicSceneNode = FrameNode | RectangleNode;
type VisualSceneNode = SceneNode;
type FillableNode = SceneNode & { fills: readonly Paint[] | typeof figma.mixed };
type StrokableNode = SceneNode & {
  strokes: readonly Paint[];
  strokeWeight: number | typeof figma.mixed;
};
type EffectNode = SceneNode & { effects: readonly Effect[] };
type OpacityNode = SceneNode & { opacity: number; blendMode: BlendMode };
type CornerNode = SceneNode & {
  cornerRadius: number | typeof figma.mixed;
  topLeftRadius: number;
  topRightRadius: number;
  bottomRightRadius: number;
  bottomLeftRadius: number;
};

const DEFAULT_FONT: FontName = { family: "Inter", style: "Regular" };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function rgb(color: WtfColor): RGB {
  return { r: clamp01(color.r), g: clamp01(color.g), b: clamp01(color.b) };
}

function rgba(color: WtfColor): RGBA {
  return { ...rgb(color), a: clamp01(color.a) };
}

function solidPaint(color: WtfColor): SolidPaint {
  return {
    type: "SOLID",
    color: rgb(color),
    opacity: clamp01(color.a),
  };
}

function gradientPaint(fill: Extract<WtfPaintFill, { stops: unknown }>): GradientPaint {
  const type: GradientPaint["type"] =
    fill.type === "linear-gradient"
      ? "GRADIENT_LINEAR"
      : fill.type === "radial-gradient"
        ? "GRADIENT_RADIAL"
        : "GRADIENT_ANGULAR";
  return {
    type,
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: fill.stops.map((stop) => ({
      position: clamp01(stop.offset),
      color: rgba(stop.color),
    })),
  };
}

function scaleMode(fit: string | undefined): ImagePaint["scaleMode"] {
  switch ((fit ?? "").toLowerCase()) {
    case "contain":
    case "fit":
      return "FIT";
    case "repeat":
    case "tile":
      return "TILE";
    default:
      return "FILL";
  }
}

function blendMode(value: string | undefined): BlendMode {
  switch ((value ?? "normal").toLowerCase()) {
    case "multiply":
      return "MULTIPLY";
    case "screen":
      return "SCREEN";
    case "overlay":
      return "OVERLAY";
    case "darken":
      return "DARKEN";
    case "lighten":
      return "LIGHTEN";
    case "color-dodge":
      return "COLOR_DODGE";
    case "color-burn":
      return "COLOR_BURN";
    case "hard-light":
      return "HARD_LIGHT";
    case "soft-light":
      return "SOFT_LIGHT";
    case "difference":
      return "DIFFERENCE";
    case "exclusion":
      return "EXCLUSION";
    case "hue":
      return "HUE";
    case "saturation":
      return "SATURATION";
    case "color":
      return "COLOR";
    case "luminosity":
      return "LUMINOSITY";
    default:
      return "NORMAL";
  }
}

function hasFills(node: SceneNode): node is FillableNode {
  return "fills" in node;
}

function hasStrokes(node: SceneNode): node is StrokableNode {
  return "strokes" in node && "strokeWeight" in node;
}

function hasEffects(node: SceneNode): node is EffectNode {
  return "effects" in node;
}

function hasOpacity(node: SceneNode): node is OpacityNode {
  return "opacity" in node && "blendMode" in node;
}

function hasCorners(node: SceneNode): node is CornerNode {
  return (
    "cornerRadius" in node &&
    "topLeftRadius" in node &&
    "topRightRadius" in node &&
    "bottomRightRadius" in node &&
    "bottomLeftRadius" in node
  );
}

function copyPluginData(from: SceneNode, to: SceneNode): void {
  for (const key of from.getPluginDataKeys()) {
    to.setPluginData(key, from.getPluginData(key));
  }
}

function replaceAtSameIndex(oldNode: SceneNode, replacement: SceneNode): SceneNode {
  const parent = oldNode.parent;
  if (parent && "children" in parent && "insertChild" in parent) {
    const container = parent as BaseNode & ChildrenMixin;
    const index = container.children.indexOf(oldNode);
    container.insertChild(Math.max(0, index), replacement);
  }
  replacement.name = oldNode.name;
  replacement.x = oldNode.x;
  replacement.y = oldNode.y;
  replacement.resize(Math.max(0.01, oldNode.width), Math.max(0.01, oldNode.height));
  copyPluginData(oldNode, replacement);
  oldNode.remove();
  return replacement;
}

function assetMap(bundle: W2fVisualAssetBundle): ReadonlyMap<string, WtfAssetRecord> {
  return new Map(bundle.assets.map((asset) => [asset.id, asset]));
}

async function paintForFill(
  fill: WtfPaintFill,
  bundle: W2fVisualAssetBundle,
): Promise<Paint | null> {
  if (fill.type === "solid") return solidPaint(fill.color);
  if (
    fill.type === "linear-gradient" ||
    fill.type === "radial-gradient" ||
    fill.type === "conic-gradient"
  ) {
    return gradientPaint(fill);
  }
  const bytes = bundle.assetPayloadsById[fill.assetId];
  if (!bytes) return null;
  const image = figma.createImage(bytes);
  return {
    type: "IMAGE",
    imageHash: image.hash,
    scaleMode: scaleMode(fill.fit),
  };
}

function firstBorder(paint: WtfPaintModel) {
  const border = paint.border;
  if (!border) return undefined;
  return [border.top, border.right, border.bottom, border.left].find(
    (side) => side && side.width > 0 && side.style !== "none",
  );
}

async function applyPaintModel(
  node: SceneNode,
  paint: WtfPaintModel,
  bundle: W2fVisualAssetBundle,
  options: { skipFills?: boolean } = {},
): Promise<{ imageFills: number; missingAssets: number }> {
  let imageFills = 0;
  let missingAssets = 0;

  if (hasFills(node) && !options.skipFills) {
    const fills: Paint[] = [];
    for (const fill of paint.fills) {
      const converted = await paintForFill(fill, bundle);
      if (converted) {
        fills.push(converted);
        if (converted.type === "IMAGE") imageFills += 1;
      } else if (fill.type === "image") {
        missingAssets += 1;
      }
    }
    node.fills = fills;
  }

  const border = firstBorder(paint);
  if (border && hasStrokes(node)) {
    node.strokes = [solidPaint(border.color)];
    node.strokeWeight = Math.max(0, border.width);
  }

  if (paint.border?.radius && hasCorners(node)) {
    node.topLeftRadius = Math.max(0, paint.border.radius.topLeft);
    node.topRightRadius = Math.max(0, paint.border.radius.topRight);
    node.bottomRightRadius = Math.max(0, paint.border.radius.bottomRight);
    node.bottomLeftRadius = Math.max(0, paint.border.radius.bottomLeft);
  }

  if (hasEffects(node)) {
    node.effects = (paint.shadows ?? []).map((shadow): ShadowEffect => ({
      type: shadow.inset ? "INNER_SHADOW" : "DROP_SHADOW",
      color: rgba(shadow.color),
      offset: { x: shadow.offsetX, y: shadow.offsetY },
      radius: Math.max(0, shadow.blur),
      spread: shadow.spread,
      visible: true,
      blendMode: "NORMAL",
    }));
  }

  if (hasOpacity(node)) {
    node.opacity = clamp01(paint.opacity);
    node.blendMode = blendMode(paint.blendMode);
  }

  return { imageFills, missingAssets };
}

function fontStyleFromWeight(weight: number | string | undefined): string {
  const numeric =
    typeof weight === "number" ? weight : Number.parseInt(String(weight ?? "400"), 10);
  if (!Number.isFinite(numeric)) return "Regular";
  if (numeric >= 800) return "Extra Bold";
  if (numeric >= 700) return "Bold";
  if (numeric >= 600) return "Semi Bold";
  if (numeric >= 500) return "Medium";
  if (numeric <= 300) return "Light";
  return "Regular";
}

async function resolveFont(
  run: WtfTextRun | undefined,
  available: readonly Font[],
): Promise<{ fontName: FontName; fallback: boolean }> {
  const family = run?.font.family?.trim();
  const requestedStyle = run?.font.style?.trim() || fontStyleFromWeight(run?.font.weight);
  if (family) {
    const exact = available.find(
      (font) =>
        font.fontName.family.toLowerCase() === family.toLowerCase() &&
        font.fontName.style.toLowerCase() === requestedStyle.toLowerCase(),
    );
    const sameFamily =
      exact ??
      available.find(
        (font) =>
          font.fontName.family.toLowerCase() === family.toLowerCase() &&
          font.fontName.style.toLowerCase() === "regular",
      ) ??
      available.find((font) => font.fontName.family.toLowerCase() === family.toLowerCase());
    if (sameFamily) {
      await figma.loadFontAsync(sameFamily.fontName);
      return { fontName: sameFamily.fontName, fallback: exact === undefined };
    }
  }
  const fallback =
    available.find(
      (font) =>
        font.fontName.family.toLowerCase() === DEFAULT_FONT.family.toLowerCase() &&
        font.fontName.style.toLowerCase() === DEFAULT_FONT.style.toLowerCase(),
    )?.fontName ??
    available[0]?.fontName ??
    DEFAULT_FONT;
  await figma.loadFontAsync(fallback);
  return { fontName: fallback, fallback: true };
}

function lineHeight(value: number | string | undefined): LineHeight {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { unit: "PIXELS", value: Math.max(0, value) };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) return { unit: "PERCENT", value: Math.max(0, parsed) };
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) return { unit: "PIXELS", value: Math.max(0, parsed) };
  }
  return { unit: "AUTO" };
}

function decoration(value: string | undefined): TextDecoration {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("underline")) return "UNDERLINE";
  if (normalized.includes("line-through")) return "STRIKETHROUGH";
  return "NONE";
}

function align(value: string | undefined): TextNode["textAlignHorizontal"] {
  switch ((value ?? "left").toLowerCase()) {
    case "center":
      return "CENTER";
    case "right":
    case "end":
      return "RIGHT";
    case "justify":
      return "JUSTIFIED";
    default:
      return "LEFT";
  }
}

async function replaceWithText(
  oldNode: SceneNode,
  text: WtfTextModel,
  availableFonts: readonly Font[],
): Promise<{ node: TextNode; fontFallbacks: number }> {
  const textNode = figma.createText();
  const replacement = replaceAtSameIndex(oldNode, textNode) as TextNode;
  const defaultRun = text.runs[0];
  const defaultFont = await resolveFont(defaultRun, availableFonts);
  let fontFallbacks = defaultFont.fallback ? 1 : 0;
  replacement.fontName = defaultFont.fontName;
  replacement.characters = text.value;
  replacement.textAlignHorizontal = align(text.textAlign);
  replacement.textAutoResize = "NONE";

  for (const run of text.runs) {
    const start = Math.max(0, Math.min(text.value.length, run.start));
    const end = Math.max(start, Math.min(text.value.length, run.end));
    if (end <= start) continue;
    const resolved = await resolveFont(run, availableFonts);
    if (resolved.fallback) fontFallbacks += 1;
    replacement.setRangeFontName(start, end, resolved.fontName);
    if (Number.isFinite(run.fontSize) && run.fontSize > 0) {
      replacement.setRangeFontSize(start, end, run.fontSize);
    }
    replacement.setRangeLineHeight(start, end, lineHeight(run.lineHeight));
    if (Number.isFinite(run.letterSpacing)) {
      replacement.setRangeLetterSpacing(start, end, {
        unit: "PIXELS",
        value: run.letterSpacing ?? 0,
      });
    }
    if (run.color) replacement.setRangeFills(start, end, [solidPaint(run.color)]);
    replacement.setRangeTextDecoration(start, end, decoration(run.decoration));
  }

  return { node: replacement, fontFallbacks };
}

function findAsset(
  renderNode: WtfRenderNode,
  assets: ReadonlyMap<string, WtfAssetRecord>,
  kind?: WtfAssetRecord["kind"],
): WtfAssetRecord | undefined {
  for (const id of renderNode.assetRefs ?? []) {
    const asset = assets.get(id);
    if (asset && (!kind || asset.kind === kind)) return asset;
  }
  return undefined;
}

function replaceWithSvg(oldNode: SceneNode, svg: string): SceneNode {
  const svgNode = figma.createNodeFromSvg(svg);
  return replaceAtSameIndex(oldNode, svgNode);
}

async function ensureImageFill(
  node: SceneNode,
  renderNode: WtfRenderNode,
  assets: ReadonlyMap<string, WtfAssetRecord>,
  bundle: W2fVisualAssetBundle,
): Promise<{ imageFills: number; missingAssets: number }> {
  if (!hasFills(node)) return { imageFills: 0, missingAssets: 0 };
  const asset =
    findAsset(renderNode, assets, "image") ??
    findAsset(renderNode, assets, "canvas-raster") ??
    findAsset(renderNode, assets, "video-frame");
  if (!asset) return { imageFills: 0, missingAssets: 0 };
  const bytes = bundle.assetPayloadsById[asset.id];
  if (!bytes) return { imageFills: 0, missingAssets: 1 };
  const image = figma.createImage(bytes);
  node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
  return { imageFills: 1, missingAssets: 0 };
}

export async function applyFigmaVisuals(
  nodesByRenderNodeId: ReadonlyMap<string, BasicSceneNode>,
  renderTree: WtfRenderTree,
  bundle: W2fVisualAssetBundle,
): Promise<{
  nodesByRenderNodeId: ReadonlyMap<string, VisualSceneNode>;
  stats: W2fVisualRenderStats;
}> {
  const nodes = new Map<string, SceneNode>(nodesByRenderNodeId);
  const assets = assetMap(bundle);
  const availableFonts = await figma.listAvailableFontsAsync();
  const stats: W2fVisualRenderStats = {
    paintedNodeCount: 0,
    textNodeCount: 0,
    imageFillCount: 0,
    editableSvgCount: 0,
    fontFallbackCount: 0,
    missingAssetCount: 0,
  };

  for (const renderNode of renderTree.nodes) {
    let node = nodes.get(renderNode.id);
    if (!node) continue;

    if (renderNode.text) {
      const textResult = await replaceWithText(node, renderNode.text, availableFonts);
      node = textResult.node;
      nodes.set(renderNode.id, node);
      stats.textNodeCount += 1;
      stats.fontFallbackCount += textResult.fontFallbacks;
    } else {
      const svgAsset = findAsset(renderNode, assets, "svg");
      const svg = svgAsset ? bundle.sanitizedSvgById[svgAsset.id] : undefined;
      if (svg) {
        node = replaceWithSvg(node, svg);
        nodes.set(renderNode.id, node);
        stats.editableSvgCount += 1;
      }
    }

    const paintResult = await applyPaintModel(node, renderNode.paint, bundle, {
      skipFills: Boolean(renderNode.text && renderNode.text.runs.length > 0),
    });
    stats.paintedNodeCount += 1;
    stats.imageFillCount += paintResult.imageFills;
    stats.missingAssetCount += paintResult.missingAssets;

    if (["image", "canvas", "video-frame"].includes(renderNode.kind)) {
      const imageResult = await ensureImageFill(node, renderNode, assets, bundle);
      stats.imageFillCount += imageResult.imageFills;
      stats.missingAssetCount += imageResult.missingAssets;
    }
  }

  return { nodesByRenderNodeId: nodes, stats };
}
