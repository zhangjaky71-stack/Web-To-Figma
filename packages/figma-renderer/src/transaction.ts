import {
  W2F_IMPORTING_ROOT_NAME,
  W2F_PLUGIN_DATA_KEYS,
  W2fBasicRendererError,
  type W2fBasicFigmaAdapter,
  type W2fBasicRenderResult,
  type W2fBasicRendererInput,
} from "./types.js";
import { committedRootPluginData, createBasicFigmaRenderPlan } from "./planner.js";

function applyPluginData<TNode>(
  adapter: W2fBasicFigmaAdapter<TNode>,
  node: TNode,
  data: Readonly<Record<string, string>>,
): void {
  for (const [key, value] of Object.entries(data)) {
    adapter.setPluginData(node, key, value);
  }
}

export function renderBasicFigmaScene<TNode>(
  adapter: W2fBasicFigmaAdapter<TNode>,
  input: W2fBasicRendererInput,
): W2fBasicRenderResult<TNode> {
  const plan = createBasicFigmaRenderPlan(input);
  let root: TNode | undefined;

  try {
    root = adapter.createFrame();
    adapter.setName(root, W2F_IMPORTING_ROOT_NAME);
    adapter.setGeometry(root, plan.root.geometry);
    applyPluginData(adapter, root, plan.root.pluginData);
    adapter.setPluginData(root, W2F_PLUGIN_DATA_KEYS.transactionState, "importing");

    const nodesByRenderNodeId = new Map<string, TNode>();
    const rasterBoundaryIds = new Set<string>();
    const suppressedRenderNodeIds = new Set<string>();
    let createdNodeCount = 1;

    if (plan.root.sourceRenderNodeId) {
      nodesByRenderNodeId.set(plan.root.sourceRenderNodeId, root);
      if (plan.root.pluginData[W2F_PLUGIN_DATA_KEYS.renderStrategy] === "raster") {
        rasterBoundaryIds.add(plan.root.sourceRenderNodeId);
      }
    }

    for (const nodePlan of plan.nodes) {
      const parentRenderNodeId = nodePlan.parentRenderNodeId;
      if (
        parentRenderNodeId &&
        (rasterBoundaryIds.has(parentRenderNodeId) ||
          suppressedRenderNodeIds.has(parentRenderNodeId))
      ) {
        suppressedRenderNodeIds.add(nodePlan.renderNodeId);
        continue;
      }

      const node =
        nodePlan.renderStrategy === "raster" || nodePlan.nodeType === "FRAME"
          ? adapter.createFrame()
          : adapter.createRectangle();
      adapter.setName(node, nodePlan.name);
      adapter.setGeometry(node, nodePlan.localGeometry);
      applyPluginData(adapter, node, nodePlan.pluginData);

      const parent = parentRenderNodeId ? nodesByRenderNodeId.get(parentRenderNodeId) : root;
      if (!parent) {
        throw new W2fBasicRendererError(
          "W2F_RENDERER_TREE",
          `Parent ${parentRenderNodeId ?? "transaction-root"} was not created before ${nodePlan.renderNodeId}`,
        );
      }
      adapter.appendChild(parent, node);
      nodesByRenderNodeId.set(nodePlan.renderNodeId, node);
      createdNodeCount += 1;
      if (nodePlan.renderStrategy === "raster") rasterBoundaryIds.add(nodePlan.renderNodeId);
    }

    adapter.validateRoot?.(root);
    adapter.setName(root, plan.root.name);
    applyPluginData(adapter, root, committedRootPluginData(plan.root.pluginData));
    adapter.setPluginData(root, W2F_PLUGIN_DATA_KEYS.transactionState, "committed");
    adapter.setSelection?.([root]);
    adapter.focusNodes?.([root]);

    return {
      root,
      createdNodeCount,
      mappedRenderNodeIds: [...nodesByRenderNodeId.keys()],
      nodesByRenderNodeId,
      committed: true,
    };
  } catch (error) {
    if (root !== undefined) {
      try {
        adapter.remove(root);
      } catch {
        // Preserve the original renderer failure. Adapter cleanup errors are secondary.
      }
    }
    if (error instanceof W2fBasicRendererError) throw error;
    throw new W2fBasicRendererError(
      "W2F_RENDERER_ADAPTER",
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}
