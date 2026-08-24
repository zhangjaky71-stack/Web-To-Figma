import type {
  FigmaCapabilityKey,
  FigmaCapabilityRecord,
  FigmaCapabilityRegistry,
} from "./types.js";

const record = (value: FigmaCapabilityRecord): FigmaCapabilityRecord => value;

export const FIGMA_CAPABILITY_REGISTRY_2026_08_24: FigmaCapabilityRegistry = {
  snapshotId: "figma-plugin-api-2026-08-24",
  pluginTypingsVersion: "1.134.0",
  records: {
    autoLayout: record({
      key: "autoLayout",
      state: "native",
      nativeContext: "frame-like-target",
      emulationAvailable: true,
      wrapperEligible: true,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["layoutMode:NONE|HORIZONTAL|VERTICAL|GRID"],
      note: "Frame-like nodes can represent Auto Layout natively.",
    }),
    fillSizing: record({
      key: "fillSizing",
      state: "native",
      nativeContext: "auto-layout-parent",
      emulationAvailable: true,
      wrapperEligible: true,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["layoutSizingHorizontal:FILL", "layoutSizingVertical:FILL"],
      note: "FILL is native only when the target is a direct Auto Layout child.",
    }),
    hugSizing: record({
      key: "hugSizing",
      state: "native",
      nativeContext: "auto-layout-target-or-parent",
      emulationAvailable: true,
      wrapperEligible: true,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["layoutSizingHorizontal:HUG", "layoutSizingVertical:HUG"],
      note: "HUG is native for Auto Layout frames and text, with contextual restrictions.",
    }),
    grid: record({
      key: "grid",
      state: "native",
      nativeContext: "frame-like-target",
      emulationAvailable: true,
      wrapperEligible: true,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["layoutMode:GRID", "gridRowSizes", "gridColumnSizes"],
      note: "The current Plugin API exposes native Grid Auto Layout.",
    }),
    gridSpan: record({
      key: "gridSpan",
      state: "native",
      nativeContext: "grid-parent",
      emulationAvailable: true,
      wrapperEligible: false,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["gridRowSpan", "gridColumnSpan"],
      note: "Grid span is native for direct children of Grid Auto Layout frames.",
    }),
    minMaxSizing: record({
      key: "minMaxSizing",
      state: "native",
      nativeContext: "auto-layout-target-or-parent",
      emulationAvailable: true,
      wrapperEligible: true,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["minWidth", "maxWidth", "minHeight", "maxHeight"],
      note: "Min/max sizing is native for Auto Layout frames and their direct children.",
    }),
    svgImport: record({
      key: "svgImport",
      state: "native",
      nativeContext: "always",
      emulationAvailable: false,
      wrapperEligible: false,
      absoluteEligible: false,
      rasterEligible: true,
      evidence: ["figma.createNodeFromSvg"],
      note: "Sanitized SVG strings can be imported through the native Plugin API.",
    }),
    textMixedStyles: record({
      key: "textMixedStyles",
      state: "native",
      nativeContext: "text-target",
      emulationAvailable: true,
      wrapperEligible: false,
      absoluteEligible: false,
      rasterEligible: true,
      evidence: ["setRangeFontName", "setRangeFontSize", "setRangeFills"],
      note: "Text range APIs support mixed styles when required fonts are loaded.",
    }),
    absoluteInAutoLayout: record({
      key: "absoluteInAutoLayout",
      state: "native",
      nativeContext: "auto-layout-parent",
      emulationAvailable: true,
      wrapperEligible: false,
      absoluteEligible: true,
      rasterEligible: true,
      evidence: ["layoutPositioning:ABSOLUTE"],
      note: "Direct Auto Layout children can opt out of flow using native absolute positioning.",
    }),
    imageTransform: record({
      key: "imageTransform",
      state: "partial",
      nativeContext: "crop-image-transform",
      emulationAvailable: true,
      wrapperEligible: false,
      absoluteEligible: false,
      rasterEligible: true,
      evidence: ["ImagePaint.imageTransform:CROP", "ImagePaint.rotation:90-degree-steps"],
      note: "Arbitrary image transform support is partial; CROP exposes imageTransform while other modes are constrained.",
    }),
  },
};

export const CURRENT_FIGMA_CAPABILITY_REGISTRY = FIGMA_CAPABILITY_REGISTRY_2026_08_24;

export function withCapabilityOverrides(
  registry: FigmaCapabilityRegistry,
  overrides: Partial<Record<FigmaCapabilityKey, Partial<FigmaCapabilityRecord>>>,
): FigmaCapabilityRegistry {
  const records: Record<FigmaCapabilityKey, FigmaCapabilityRecord> = { ...registry.records };
  for (const key of Object.keys(overrides) as FigmaCapabilityKey[]) {
    const current = records[key];
    const override = overrides[key];
    if (!current || !override) continue;
    records[key] = { ...current, ...override, key };
  }
  return {
    ...registry,
    snapshotId: `${registry.snapshotId}+override`,
    records,
  };
}
