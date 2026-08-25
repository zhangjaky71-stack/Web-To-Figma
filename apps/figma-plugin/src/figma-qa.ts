import {
  W2F_PLUGIN_DATA_KEYS,
  type W2fEditableClass,
  type W2fFigmaQaNodeSnapshot,
} from "@w2f/figma-renderer";

const RASTER_MODE_KEY = "w2f.raster.mode";

function pluginData(node: BaseNode): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  for (const key of node.getPluginDataKeys()) {
    output[key] = node.getPluginData(key);
  }
  return output;
}

function childNodes(node: BaseNode): readonly SceneNode[] {
  if (!("children" in node)) return [];
  return (node as BaseNode & ChildrenMixin).children;
}

function hasImageFill(node: SceneNode): boolean {
  const fills = (node as SceneNode & { fills?: unknown }).fills;
  return (
    Array.isArray(fills) &&
    fills.some(
      (paint) =>
        typeof paint === "object" &&
        paint !== null &&
        "type" in paint &&
        (paint as { type?: unknown }).type === "IMAGE",
    )
  );
}

function isVectorNodeType(type: SceneNode["type"]): boolean {
  return ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE", "POLYGON"].includes(type);
}

function hasVectorDescendant(node: SceneNode): boolean {
  const stack = [...childNodes(node)];
  while (stack.length > 0) {
    const child = stack.pop();
    if (!child) continue;
    if (isVectorNodeType(child.type)) return true;
    stack.push(...childNodes(child));
  }
  return false;
}

function editableClass(node: SceneNode): W2fEditableClass {
  if (node.getPluginData(RASTER_MODE_KEY)) return "raster";
  if (node.type === "TEXT") return "text";
  if (isVectorNodeType(node.type) || hasVectorDescendant(node)) return "vector";
  if (hasImageFill(node)) return "image";
  if ("children" in node) return "container";
  return "other";
}

function nearestMappedParent(node: SceneNode): string | undefined {
  let parent = node.parent;
  while (parent) {
    const renderNodeId = parent.getPluginData(W2F_PLUGIN_DATA_KEYS.nodeId);
    if (renderNodeId) return renderNodeId;
    parent = parent.parent;
  }
  return undefined;
}

function siblingIndex(node: SceneNode): number {
  const parent = node.parent;
  if (!parent || !("children" in parent)) return 0;
  return Math.max(0, (parent as BaseNode & ChildrenMixin).children.indexOf(node));
}

export function inspectFigmaSceneForQa(root: SceneNode): W2fFigmaQaNodeSnapshot[] {
  const snapshots: W2fFigmaQaNodeSnapshot[] = [];
  const stack: SceneNode[] = [root];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    const data = pluginData(node);
    const renderNodeId = data[W2F_PLUGIN_DATA_KEYS.nodeId];
    const parentRenderNodeId = nearestMappedParent(node);
    snapshots.push({
      figmaNodeId: node.id,
      ...(renderNodeId ? { renderNodeId } : {}),
      ...(parentRenderNodeId ? { parentRenderNodeId } : {}),
      siblingIndex: siblingIndex(node),
      name: node.name,
      nodeType: node.type,
      editableClass: editableClass(node),
      visible: "visible" in node ? node.visible : true,
      width: "width" in node && typeof node.width === "number" ? node.width : 0,
      height: "height" in node && typeof node.height === "number" ? node.height : 0,
      pluginData: data,
    });

    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push(child);
    }
  }

  return snapshots;
}
