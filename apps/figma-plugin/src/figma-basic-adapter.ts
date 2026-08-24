import type { W2fBasicFigmaAdapter, W2fBasicGeometry } from "@w2f/figma-renderer";

type BasicSceneNode = FrameNode | RectangleNode;

function neutralizePaint(node: BasicSceneNode): void {
  node.fills = [];
  node.strokes = [];
}

export function createFigmaBasicAdapter(): W2fBasicFigmaAdapter<BasicSceneNode> {
  return {
    createFrame(): BasicSceneNode {
      const node = figma.createFrame();
      neutralizePaint(node);
      node.clipsContent = false;
      return node;
    },
    createRectangle(): BasicSceneNode {
      const node = figma.createRectangle();
      neutralizePaint(node);
      return node;
    },
    appendChild(parent, child): void {
      if (parent.type !== "FRAME") {
        throw new Error(`W2F_E_RENDER_PARENT: ${parent.type} cannot contain ${child.type}`);
      }
      parent.appendChild(child);
    },
    setName(node, name): void {
      node.name = name;
    },
    setGeometry(node, geometry: W2fBasicGeometry): void {
      node.x = geometry.x;
      node.y = geometry.y;
      node.resize(Math.max(0.01, geometry.width), Math.max(0.01, geometry.height));
    },
    setPluginData(node, key, value): void {
      node.setPluginData(key, value);
    },
    remove(node): void {
      node.remove();
    },
    validateRoot(root): void {
      if (root.type !== "FRAME") throw new Error("W2F_E_RENDER_ROOT: import root must be a frame");
    },
    setSelection(nodes): void {
      figma.currentPage.selection = [...nodes];
    },
    focusNodes(nodes): void {
      figma.viewport.scrollAndZoomIntoView([...nodes]);
    },
  };
}
