from pathlib import Path

hybrid_path = Path('apps/figma-plugin/src/figma-hybrid-renderer.ts')
main_path = Path('apps/figma-plugin/src/main.ts')
hybrid = hybrid_path.read_text()
main = main_path.read_text()

old_import = 'import type { W2fRasterReferenceEvidence } from "./protocol.js";'
new_import = '''import type { W2fImportProfile, W2fRasterReferenceEvidence } from "./protocol.js";\nimport {\n  evaluateRasterTextPolicy,\n  rasterTextPolicyAllowsRaster,\n  W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS,\n  type W2fRasterTextPolicyDecision,\n} from "./raster-text-policy.js";'''
if old_import in hybrid:
    hybrid = hybrid.replace(old_import, new_import, 1)
elif new_import not in hybrid:
    raise SystemExit('hybrid import anchor missing')

old_surface = '''export interface W2fHybridRasterSurfacePlan {\n  renderNodeId: string;\n  sourceNodeId: string;\n  reference: W2fRasterReferenceEvidence;\n  tiles: readonly WtfReferenceTileDescriptor[];\n}\n\nexport interface W2fHybridRasterPlan {\n  version: typeof W2F_HYBRID_RASTER_VERSION;\n  surfaces: readonly W2fHybridRasterSurfacePlan[];\n}'''
new_surface = '''export interface W2fHybridRasterSurfacePlan {\n  renderNodeId: string;\n  sourceNodeId: string;\n  reference: W2fRasterReferenceEvidence;\n  tiles: readonly WtfReferenceTileDescriptor[];\n  textPolicy: W2fRasterTextPolicyDecision;\n}\n\nexport interface W2fHybridRasterPlan {\n  version: typeof W2F_HYBRID_RASTER_VERSION;\n  surfaces: readonly W2fHybridRasterSurfacePlan[];\n  nativePreserved: readonly W2fRasterTextPolicyDecision[];\n}'''
if old_surface in hybrid:
    hybrid = hybrid.replace(old_surface, new_surface, 1)
elif new_surface not in hybrid:
    raise SystemExit('surface plan anchor missing')

old_stats = '''export interface W2fHybridRasterStats {\n  rasterNodeCount: number;\n  rasterTileNodeCount: number;\n  suppressedNativeDescendantCount: number;\n}'''
new_stats = '''export interface W2fHybridRasterStats {\n  rasterNodeCount: number;\n  rasterTileNodeCount: number;\n  suppressedNativeDescendantCount: number;\n  rasterTextAuthorizedCount: number;\n  rasterTextNativePreservedCount: number;\n}'''
if old_stats in hybrid:
    hybrid = hybrid.replace(old_stats, new_stats, 1)
elif new_stats not in hybrid:
    raise SystemExit('stats anchor missing')

old_native = '''export function renderTreeForNativePass(renderTree: WtfRenderTree): WtfRenderTree {\n  return {\n    ...renderTree,\n    nodes: renderTree.nodes.map((node) => {\n      if (node.renderStrategy !== "raster") return node;\n      const clone: WtfRenderNode = { ...node, assetRefs: [] };\n      delete clone.text;\n      return clone;\n    }),\n  };\n}'''
new_native = '''export function renderTreeForNativePass(\n  renderTree: WtfRenderTree,\n  profile: W2fImportProfile = "balanced",\n): WtfRenderTree {\n  return {\n    ...renderTree,\n    nodes: renderTree.nodes.map((node) => {\n      if (node.renderStrategy !== "raster") return node;\n      const textPolicy = evaluateRasterTextPolicy(renderTree, node.id, profile);\n      if (!rasterTextPolicyAllowsRaster(textPolicy)) {\n        return { ...node, renderStrategy: "native" as const };\n      }\n      const clone: WtfRenderNode = { ...node, assetRefs: [] };\n      delete clone.text;\n      return clone;\n    }),\n  };\n}'''
if old_native in hybrid:
    hybrid = hybrid.replace(old_native, new_native, 1)
elif new_native not in hybrid:
    raise SystemExit('native pass anchor missing')

old_plan_head = '''export function createHybridRasterPlan(\n  renderTree: WtfRenderTree,\n  renderedNodeIds: readonly string[],\n  bundle: W2fHybridRasterBundle,\n): W2fHybridRasterPlan {\n  const rendered = new Set(renderedNodeIds);\n  const surfaces: W2fHybridRasterSurfacePlan[] = [];\n  for (const node of renderTree.nodes) {\n    if (node.renderStrategy !== "raster" || !rendered.has(node.id)) continue;\n    const reference = selectReference(node, bundle.references);'''
new_plan_head = '''export function createHybridRasterPlan(\n  renderTree: WtfRenderTree,\n  renderedNodeIds: readonly string[],\n  bundle: W2fHybridRasterBundle,\n  profile: W2fImportProfile = "balanced",\n): W2fHybridRasterPlan {\n  const rendered = new Set(renderedNodeIds);\n  const surfaces: W2fHybridRasterSurfacePlan[] = [];\n  const nativePreserved: W2fRasterTextPolicyDecision[] = [];\n  for (const node of renderTree.nodes) {\n    if (node.renderStrategy !== "raster" || !rendered.has(node.id)) continue;\n    const textPolicy = evaluateRasterTextPolicy(renderTree, node.id, profile);\n    if (!rasterTextPolicyAllowsRaster(textPolicy)) {\n      nativePreserved.push(textPolicy);\n      continue;\n    }\n    const reference = selectReference(node, bundle.references);'''
if old_plan_head in hybrid:
    hybrid = hybrid.replace(old_plan_head, new_plan_head, 1)
elif new_plan_head not in hybrid:
    raise SystemExit('plan head anchor missing')

old_push = '''    surfaces.push({\n      renderNodeId: node.id,\n      sourceNodeId: reference.sourceNodeId,\n      reference,\n      tiles,\n    });\n  }\n  return { version: W2F_HYBRID_RASTER_VERSION, surfaces };'''
new_push = '''    surfaces.push({\n      renderNodeId: node.id,\n      sourceNodeId: reference.sourceNodeId,\n      reference,\n      tiles,\n      textPolicy,\n    });\n  }\n  return { version: W2F_HYBRID_RASTER_VERSION, surfaces, nativePreserved };'''
if old_push in hybrid:
    hybrid = hybrid.replace(old_push, new_push, 1)
elif new_push not in hybrid:
    raise SystemExit('surface push anchor missing')

plugin_anchor = '''function setSurfacePluginData(frame: FrameNode, surface: W2fHybridRasterSurfacePlan): void {'''
plugin_helper = '''function setRasterTextPolicyPluginData(\n  frame: FrameNode,\n  decision: W2fRasterTextPolicyDecision,\n): void {\n  frame.setPluginData(W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.version, decision.version);\n  frame.setPluginData(W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.status, decision.status);\n  frame.setPluginData(W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.profile, decision.profile);\n  frame.setPluginData(\n    W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.textNodeCount,\n    String(decision.textRenderNodeIds.length),\n  );\n  frame.setPluginData(\n    W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.visualJustifications,\n    JSON.stringify(decision.visualJustifications).slice(0, 4096),\n  );\n  frame.setPluginData(\n    W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.ignoredTextQualityReasons,\n    JSON.stringify(decision.ignoredTextQualityReasons).slice(0, 4096),\n  );\n  frame.setPluginData(W2F_RASTER_TEXT_POLICY_PLUGIN_DATA_KEYS.reason, decision.reason.slice(0, 1024));\n}\n\nfunction setSurfacePluginData(frame: FrameNode, surface: W2fHybridRasterSurfacePlan): void {'''
if 'function setRasterTextPolicyPluginData(' not in hybrid:
    if plugin_anchor not in hybrid:
        raise SystemExit('plugin data helper anchor missing')
    hybrid = hybrid.replace(plugin_anchor, plugin_helper, 1)

surface_reason_anchor = '''  if (surface.reference.reason) {\n    frame.setPluginData(\n      W2F_RASTER_PLUGIN_DATA_KEYS.reason,\n      surface.reference.reason.slice(0, 1024),\n    );\n  }\n}'''
surface_reason_replacement = '''  if (surface.reference.reason) {\n    frame.setPluginData(\n      W2F_RASTER_PLUGIN_DATA_KEYS.reason,\n      surface.reference.reason.slice(0, 1024),\n    );\n  }\n  setRasterTextPolicyPluginData(frame, surface.textPolicy);\n}'''
if surface_reason_anchor in hybrid:
    hybrid = hybrid.replace(surface_reason_anchor, surface_reason_replacement, 1)
elif surface_reason_replacement not in hybrid:
    raise SystemExit('surface policy plugin data anchor missing')

apply_head_old = '''export function applyFigmaHybridRasterFallbacks(\n  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,\n  renderTree: WtfRenderTree,\n  bundle: W2fHybridRasterBundle,\n): W2fHybridRasterStats {\n  const plan = createHybridRasterPlan(renderTree, [...nodesByRenderNodeId.keys()], bundle);\n  const renderNodes = renderNodeMap(renderTree);'''
apply_head_new = '''export function applyFigmaHybridRasterFallbacks(\n  nodesByRenderNodeId: ReadonlyMap<string, SceneNode>,\n  renderTree: WtfRenderTree,\n  bundle: W2fHybridRasterBundle,\n  profile: W2fImportProfile = "balanced",\n): W2fHybridRasterStats {\n  const plan = createHybridRasterPlan(\n    renderTree,\n    [...nodesByRenderNodeId.keys()],\n    bundle,\n    profile,\n  );\n  const renderNodes = renderNodeMap(renderTree);\n  for (const decision of plan.nativePreserved) {\n    const target = nodesByRenderNodeId.get(decision.boundaryRenderNodeId);\n    if (target?.type === "FRAME") setRasterTextPolicyPluginData(target, decision);\n  }'''
if apply_head_old in hybrid:
    hybrid = hybrid.replace(apply_head_old, apply_head_new, 1)
elif apply_head_new not in hybrid:
    raise SystemExit('apply head anchor missing')

return_old = '''  return {\n    rasterNodeCount: plan.surfaces.length,\n    rasterTileNodeCount: plan.surfaces.reduce((total, surface) => total + surface.tiles.length, 0),\n    suppressedNativeDescendantCount: countSuppressedDescendants(\n      renderTree,\n      renderedNodeIds,\n      rasterNodeIds,\n    ),\n  };'''
return_new = '''  return {\n    rasterNodeCount: plan.surfaces.length,\n    rasterTileNodeCount: plan.surfaces.reduce((total, surface) => total + surface.tiles.length, 0),\n    suppressedNativeDescendantCount: countSuppressedDescendants(\n      renderTree,\n      renderedNodeIds,\n      rasterNodeIds,\n    ),\n    rasterTextAuthorizedCount: plan.surfaces.filter(\n      (surface) => surface.textPolicy.status === "raster-authorized",\n    ).length,\n    rasterTextNativePreservedCount: plan.nativePreserved.length,\n  };'''
if return_old in hybrid:
    hybrid = hybrid.replace(return_old, return_new, 1)
elif return_new not in hybrid:
    raise SystemExit('stats return anchor missing')

main_native_old = '      renderTreeForNativePass(request.renderTree),'
main_native_new = '      renderTreeForNativePass(request.renderTree, request.profile),'
if main_native_old in main:
    main = main.replace(main_native_old, main_native_new, 1)
elif main_native_new not in main:
    raise SystemExit('main native pass anchor missing')

main_raster_old = '''    const raster = applyFigmaHybridRasterFallbacks(visual.nodesByRenderNodeId, request.renderTree, {\n      references: request.rasterReferences ?? [],\n      tilePayloadsByPath: request.rasterTilePayloadsByPath ?? {},\n    });'''
main_raster_new = '''    const raster = applyFigmaHybridRasterFallbacks(\n      visual.nodesByRenderNodeId,\n      request.renderTree,\n      {\n        references: request.rasterReferences ?? [],\n        tilePayloadsByPath: request.rasterTilePayloadsByPath ?? {},\n      },\n      request.profile,\n    );'''
if main_raster_old in main:
    main = main.replace(main_raster_old, main_raster_new, 1)
elif main_raster_new not in main:
    raise SystemExit('main raster apply anchor missing')

hybrid_path.write_text(hybrid)
main_path.write_text(main)
print('NODE-31 raster text policy integrated into final Figma import path candidate.')
