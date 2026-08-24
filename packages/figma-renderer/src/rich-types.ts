import type { W2fBasicFigmaAdapter, W2fBasicRenderResult, W2fBasicRendererInput } from "./types.js";
import type { W2fPaintRenderPlan } from "./paint/types.js";
import type { W2fFontResolution, W2fTextRenderPlan } from "./text/types.js";

export interface W2fAvailableFont {
  family: string;
  style: string;
}

export interface W2fValidatedAssetPayload {
  id: string;
  kind: string;
  mediaType: string;
  cacheKey: string;
  bytes?: Uint8Array;
  sanitizedSvg?: string;
  width?: number;
  height?: number;
}

export interface W2fRichRendererInput extends W2fBasicRendererInput {
  assets?: readonly W2fValidatedAssetPayload[];
}

export interface W2fRichFigmaAdapter<TNode, TImage>
  extends W2fBasicFigmaAdapter<TNode> {
  listAvailableFonts(): Promise<readonly W2fAvailableFont[]>;
  loadFont(font: W2fAvailableFont): Promise<void>;
  createText(): TNode;
  createSvg(sanitizedSvg: string): TNode;
  prepareImage(asset: W2fValidatedAssetPayload): Promise<TImage> | TImage;
  applyText(
    node: TNode,
    plan: W2fTextRenderPlan,
    resolutions: ReadonlyMap<string, W2fFontResolution>,
  ): Promise<void> | void;
  applyPaint(
    node: TNode,
    plan: W2fPaintRenderPlan,
    imagesByAssetId: ReadonlyMap<string, TImage>,
  ): Promise<void> | void;
}

export interface W2fRichRenderResult<TNode> extends W2fBasicRenderResult<TNode> {
  fontResolutions: readonly W2fFontResolution[];
  fontSubstitutionCount: number;
  preparedImageCount: number;
  svgNodeCount: number;
}

export type W2fRichRendererErrorCode =
  | "W2F_RENDERER_FONT_UNAVAILABLE"
  | "W2F_RENDERER_FONT_LOAD"
  | "W2F_RENDERER_ASSET_MISSING"
  | "W2F_RENDERER_IMAGE_UNSUPPORTED"
  | "W2F_RENDERER_IMAGE_TILE_REQUIRED"
  | "W2F_RENDERER_SVG_UNAVAILABLE"
  | "W2F_RENDERER_RICH_ADAPTER";

export class W2fRichRendererError extends Error {
  readonly code: W2fRichRendererErrorCode;

  constructor(code: W2fRichRendererErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "W2fRichRendererError";
    this.code = code;
  }
}
